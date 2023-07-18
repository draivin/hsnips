import { HSnippet, IHSnippetHeader, GeneratorFunction, ContextFilter } from './hsnippet';

const CODE_DELIMITER = '``';
const CODE_DELIMITER_REGEX = /``(?!`)/;
const HEADER_REGEXP = /^snippet ?(?:`([^`]+)`|(\S+))?(?: "([^"]+)")?(?: ([(1-9)AMiwb]*))?/;

function parseSnippetHeader(header: string): IHSnippetHeader {
  let match = HEADER_REGEXP.exec(header);
  if (!match) throw new Error('Invalid snippet header');

  let trigger: string | RegExp = match[2];
  if (match[1]) {
    if (!match[1].endsWith('$')) match[1] += '$';
    trigger = new RegExp(match[1], 'm');
  }

  return {
    trigger,
    description: match[3] || '',
    flags: match[4] || '',
  };
}

interface IHSnippetInfo {
  body: string;
  contextFilter?: string;
  header: IHSnippetHeader;
}

interface IHSnippetParseResult {
  contextFilter?: ContextFilter;
  generatorFunction: GeneratorFunction;
}

// First replacement handles backslash characters, as the string will be inserted using vscode's
// snippet engine, we should double down on every backslash, the second replacement handles double
// quotes, as our snippet will be transformed into a javascript string surrounded by double quotes.
function escapeString(string: string) {
  return string.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function parseSnippet(headerLine: string, lines: string[]): IHSnippetInfo {
  let header = parseSnippetHeader(headerLine);

  let script = [`(t, m, w, path, snip) => {`];
  script.push(`let rv = "";`);
  script.push(`let _result = [];`);
  script.push(`let _blockResults = [];`);

  let isCode = false;

  while (lines.length > 0) {
    let line = lines.shift() as string;

    if (isCode) {
      if (!line.includes(CODE_DELIMITER)) {
        script.push(line.trim());
      } else {
        let [code, ...rest] = line.split(CODE_DELIMITER_REGEX);
        script.push(code.trim());
        lines.unshift(rest.join(CODE_DELIMITER));
        script.push(`_result.push({block: _blockResults.length});`);
        script.push(`_blockResults.push(String(rv));`);
        isCode = false;
      }
    } else {
      if (line.startsWith('endsnippet')) {
        break;
      } else if (!line.includes(CODE_DELIMITER)) {
        script.push(`_result.push("${escapeString(line)}");`);
        script.push(`_result.push("\\n");`);
      } else if (isCode == false) {
        let [text, ...rest] = line.split(CODE_DELIMITER_REGEX);
        script.push(`_result.push("${escapeString(text)}");`);
        script.push(`rv = "";`);
        lines.unshift(rest.join(CODE_DELIMITER));
        isCode = true;
      }
    }
  }

  // Remove extra newline at the end.
  script.pop();
  script.push(`return [_result, _blockResults];`);
  script.push(`}`);

  return { body: script.join('\n'), header };
}

// Transforms an hsnips file into a single function where the global context lives, every snippet is
// transformed into a local function inside this and the list of all snippet functions is returned
// so we can build the approppriate HSnippet objects.
export function parse(content: string): HSnippet[] {
  let lines = content.split(/\r?\n/);

  let snippetInfos = [];
  let script = [];
  let isCode = false;
  let priority = 0;
  let context = undefined;

  while (lines.length > 0) {
    let line = lines.shift() as string;

    if (isCode) {
      if (line.startsWith('endglobal')) {
        isCode = false;
      } else {
        script.push(line);
      }
    } else if (line.startsWith('#')) {
      continue;
    } else if (line.startsWith('global')) {
      isCode = true;
    } else if (line.startsWith('priority ')) {
      priority = Number(line.substring('priority '.length).trim()) || 0;
    } else if (line.startsWith('context ')) {
      context = line.substring('context '.length).trim() || undefined;
    } else if (line.match(HEADER_REGEXP)) {
      let info = parseSnippet(line, lines);
      info.header.priority = priority;
      info.contextFilter = context;
      snippetInfos.push(info);

      priority = 0;
      context = undefined;
    }
  }

  script.push(`return [`);
  for (let snippet of snippetInfos) {
    script.push('{');
    if (snippet.contextFilter) {
      script.push(`contextFilter: (context) => (${snippet.contextFilter}),`);
    }
    script.push(`generatorFunction: ${snippet.body}`);
    script.push('},');
  }
  script.push(`]`);

  // for some reason, `require` is not defined inside the snippet code blocks,
  // so we're going to bind the it onto the function
  let generators = new Function('require', script.join('\n'))(require) as IHSnippetParseResult[];
  return snippetInfos.map(
    (s, i) => new HSnippet(s.header, generators[i].generatorFunction, generators[i].contextFilter)
  );
}
