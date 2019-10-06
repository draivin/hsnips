import { HSnippet, IHSnippetHeader } from './hsnippet';

const CODE_DELIMITER = '``';
const HEADER_REGEXP = /^snippet ?(?:`([^`]+)`|(\S+))?(?: "([^"]+)")?(?: ([A]*))?/;

function parseSnippetHeader(header: string): IHSnippetHeader {
  let match = HEADER_REGEXP.exec(header);
  if (!match) throw new Error('Invalid snippet header');

  let trigger: string | RegExp = match[2];
  if (match[1]) {
    if (!match[1].endsWith('$')) match[1] += '$';
    trigger = new RegExp(match[1]);
  }

  return {
    trigger,
    description: match[3] || '',
    flags: match[4] || ''
  };
}

interface IHSnippetInfo {
  body: string;
  placeholders: number;
  header: IHSnippetHeader;
}

function escapeString(string: string) {
  return string.replace('"', '\\"').replace('\\', '\\\\');
}

function countPlaceholders(string: string) {
  return string.split(/\$\d+|\$\{\d+\}/g).length - 1;
}

function parseSnippet(headerLine: string, lines: string[]): IHSnippetInfo {
  let header = parseSnippetHeader(headerLine);

  let script = [`(t, m) => {`];
  script.push(`let rv = "";`);
  script.push(`let result = [];`);
  script.push(`let blockResults = [];`);

  let isCode = false;
  let placeholders = 0;

  while (lines.length > 0) {
    let line = lines.shift() as string;

    if (isCode) {
      if (!line.includes(CODE_DELIMITER)) {
        script.push(line.trim());
      } else {
        let [code, ...rest] = line.split(CODE_DELIMITER);
        script.push(code.trim());
        lines.unshift(rest.join(CODE_DELIMITER));
        script.push(`result.push({block: blockResults.length});`);
        script.push(`blockResults.push(rv);`);
        isCode = false;
      }
    } else {
      if (line.startsWith('endsnippet')) {
        break;
      } else if (!line.includes(CODE_DELIMITER)) {
        script.push(`result.push("${escapeString(line)}");`);
        script.push(`result.push("\\n");`);
        placeholders += countPlaceholders(line);
      } else if (isCode == false) {
        let [text, ...rest] = line.split(CODE_DELIMITER);
        script.push(`result.push("${escapeString(text)}");`);
        script.push(`rv = "";`);
        placeholders += countPlaceholders(text);
        lines.unshift(rest.join(CODE_DELIMITER));
        isCode = true;
      }
    }
  }

  // Remove extra newline at the end.
  script.pop();
  script.push(`return [result, blockResults];`);
  script.push(`}`);

  return { body: script.join('\n'), header, placeholders };
}

// Transforms an hsnips file into a single function where the global context lives, every snippet is
// transformed into a local function inside this and the list of all snippet functions is returned
// so we can build the approppriate HSnippet objects.
export function parse(content: string): HSnippet[] {
  let lines = content.split(/\r?\n/);

  let snippetData = [];
  let script = [];
  let isCode = false;

  while (lines.length > 0) {
    let line = lines.shift() as string;

    if (isCode) {
      if (line.startsWith('endglobal')) {
        isCode = false;
      } else {
        script.push(line);
      }
    } else if (line.startsWith('global')) {
      isCode = true;
    } else if (line.match(HEADER_REGEXP)) {
      snippetData.push(parseSnippet(line, lines));
    }
  }

  script.push(`return [`);
  for (let snippet of snippetData) {
    script.push(snippet.body);
    script.push(',');
  }
  script.push(`]`);

  let generators = new Function(script.join('\n'))();
  return snippetData.map((s, i) => new HSnippet(s.header, generators[i], s.placeholders));
}
