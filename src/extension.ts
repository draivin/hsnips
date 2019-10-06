import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as util from 'util';
import openExplorer = require('open-file-explorer');
import { HSnippet, HSnippetInstance } from './hsnippet';
import { parse } from './parser';

const SNIPPETS_BY_LANGUAGE: Map<string, HSnippet[]> = new Map();
let ACTIVE_SNIPPET: HSnippetInstance | null;

function expandSnippet(snippet: HSnippet, editor: vscode.TextEditor, range: vscode.Range, matchGroups: string[]) {
  let snippetInstance = new HSnippetInstance(snippet, editor, range.start, matchGroups);

  editor.insertSnippet(snippetInstance.snippetString, range).then(() => {
    ACTIVE_SNIPPET = snippetInstance;
  });
}

function getSnippetDir(): string {
  let platform = os.platform();

  let APPDATA = process.env.APPDATA || '';
  let HOME = process.env.HOME || '';

  if (platform == 'win32') {
    return path.join(APPDATA, 'Code/User/hsnips');
  } else if (platform == 'darwin') {
    return path.join(HOME, 'Library/Application Support/Code/User/hsnips');
  } else {
    return path.join(HOME, '.config/Code/User/hsnips');
  }
}

const readFileAsync = util.promisify(fs.readFile);
const readdirAsync = util.promisify(fs.readdir);
const existsAsync = util.promisify(fs.exists);
const mkdirAsync = util.promisify(fs.mkdir);

async function loadSnippets() {
  SNIPPETS_BY_LANGUAGE.clear();

  let snippetDir = getSnippetDir();
  if (!await existsAsync(snippetDir)) {
    await mkdirAsync(snippetDir);
  }

  for (let file of await readdirAsync(snippetDir)) {
    if (path.extname(file).toLowerCase() != '.hsnips') continue;

    let filePath = path.join(snippetDir, file);
    let fileData = await readFileAsync(filePath, 'utf8');

    let language = path.basename(file, '.hsnips').toLowerCase();

    SNIPPETS_BY_LANGUAGE.set(language, parse(fileData));
  }

  let globalSnippets = SNIPPETS_BY_LANGUAGE.get('all');
  if (globalSnippets) {
    for (let [language, snippetList] of SNIPPETS_BY_LANGUAGE.entries()) {
      if (language != 'all') snippetList.push(...globalSnippets);
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  loadSnippets().then(() => console.log('hsnips loaded'));


  context.subscriptions.push(vscode.commands.registerCommand('hsnips.openSnippetsDir',
    () => openExplorer(getSnippetDir())
  ));

  context.subscriptions.push(vscode.commands.registerCommand('hsnips.reloadSnippets',
    () => loadSnippets()
  ));

  context.subscriptions.push(vscode.commands.registerCommand('hsnips.leaveSnippet',
    () => {
      if (ACTIVE_SNIPPET) ACTIVE_SNIPPET = null;
      vscode.commands.executeCommand('leaveSnippet');
    }
  ));

  context.subscriptions.push(vscode.commands.registerCommand('hsnips.nextPlaceholder',
    () => {
      if (ACTIVE_SNIPPET) ACTIVE_SNIPPET.nextPlaceholder();
      vscode.commands.executeCommand('jumpToNextSnippetPlaceholder');
    }
  ));

  context.subscriptions.push(vscode.commands.registerCommand('hsnips.prevPlaceholder',
    () => {
      if (ACTIVE_SNIPPET) ACTIVE_SNIPPET.prevPlaceholder();
      vscode.commands.executeCommand('jumpToPrevSnippetPlaceholder');
    }
  ));

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
    if (document.languageId == 'hsnips') {
      loadSnippets();
    }
  }));

  const triggers = [];
  for (let i = 32; i <= 126; i++) {
    triggers.push(String.fromCharCode(i));
  }

  function lineRange(character: number, position: vscode.Position): vscode.Range {
    return new vscode.Range(position.line, character, position.line, position.character);
  }

  context.subscriptions.push(vscode.commands.registerTextEditorCommand('hsnips.expand',
    (editor, _, snippet: HSnippet, range: vscode.Range, matchGroups: string[]) => {
      expandSnippet(snippet, editor, range, matchGroups);
    }
  ));

  context.subscriptions.push(vscode.languages.registerCompletionItemProvider('*',
    {
      provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        let line = document.getText(lineRange(0, position));

        // TODO: These are some weird defaults, take a look at them and find something more
        // reasonable, perhaps by introducing new flags to the snippets.

        // Checks if the cursor is at a word, if so the word is our context, otherwise grab
        // everything until previous whitespace, and that is our context.
        let range = document.getWordRangeAtPosition(position);
        if (!range) {
          let match = line.match(/\S*$/);
          range = lineRange((match as RegExpMatchArray).index || 0, position);
        }

        let context = document.getText(range);

        let snippets = SNIPPETS_BY_LANGUAGE.get(document.languageId.toLowerCase());
        if (!snippets) snippets = SNIPPETS_BY_LANGUAGE.get('all');
        if (!snippets) return;

        let completions = [];
        for (let snippet of snippets) {
          let snippetMatches = snippet.trigger && snippet.trigger == context;
          let snippetRange = range;
          let matchGroups: string[] = [];

          if (snippet.regexp) {
            let match = snippet.regexp.exec(line);
            if (match) {
              snippetRange = lineRange(match.index, position);
              snippetMatches = true;
              matchGroups = match;
            }
          }


          if (snippetRange && snippet.automatic && snippetMatches) {
            let editor = vscode.window.activeTextEditor;
            if (editor && document == editor.document) {
              expandSnippet(snippet, editor, snippetRange, matchGroups);
              return;
            }
          } else if (snippetMatches || (context && snippet.trigger.startsWith(context))) {
            let charDelta = 0;

            if (context && snippet.trigger.startsWith(context)) {
              charDelta = snippet.trigger.length - context.length;
            }

            let replacementRange = lineRange(
              snippetRange.start.character,
              position.translate(0, charDelta)
            );

            let completionItem = new vscode.CompletionItem(snippet.trigger || context);
            completionItem.range = snippetRange;
            completionItem.detail = snippet.description;
            completionItem.command = {
              command: 'hsnips.expand',
              title: 'expand',
              arguments: [snippet, replacementRange, matchGroups]
            };
            completions.push(completionItem);
          }
        }

        return completions;
      }
    },
    ...triggers
  ));

  // Forward all document changes so that the active snippet can update its related blocks.
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
    if (!ACTIVE_SNIPPET || ACTIVE_SNIPPET.editor.document != e.document) return;
    ACTIVE_SNIPPET.update(e.contentChanges);
  }));

  // Remove any stale snippet instances.
  context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(() => {
    ACTIVE_SNIPPET = null;
  }));

  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(e => {
    if (!ACTIVE_SNIPPET) return;
    if (!e.selections.some(s => (ACTIVE_SNIPPET as HSnippetInstance).range.contains(s))) {
      ACTIVE_SNIPPET = null;
    }
  }));
}
