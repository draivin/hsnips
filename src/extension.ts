import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as util from 'util';
import openExplorer = require('open-file-explorer');
import { HSnippet, HSnippetInstance } from './hsnippet';
import { parse } from './parser';

const SNIPPETS_BY_LANGUAGE: Map<string, HSnippet[]> = new Map();
const ACTIVE_SNIPPETS: Map<vscode.Uri, HSnippetInstance[]> = new Map();

function expandSnippet(snippet: HSnippet, editor: vscode.TextEditor, range: vscode.Range, matchGroups: string[]) {
  let snippetInstance = new HSnippetInstance(snippet, editor, range.start, matchGroups);

  editor.insertSnippet(snippetInstance.snippetString, range).then(() => {
    let documentSnippets = ACTIVE_SNIPPETS.get(editor.document.uri) || [];
    documentSnippets.push(snippetInstance);
    ACTIVE_SNIPPETS.set(editor.document.uri, documentSnippets);
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
  let snippetDir = getSnippetDir();
  if (!await existsAsync(snippetDir)) {
    await mkdirAsync(snippetDir);
  }

  for (let file of await readdirAsync(snippetDir)) {
    if (path.extname(file).toLowerCase() != '.hsnips') continue;

    let filePath = path.join(snippetDir, file);
    let fileData = await readFileAsync(filePath, 'utf8');

    let language = path.basename(file, '.hsnips');

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
    () => {
      // console.log(openFE);
      openExplorer(getSnippetDir());
    }
  ));

  const triggers = [];
  for (let i = 32; i <= 126; i++) {
    triggers.push(String.fromCharCode(i));
  }

  function lineRange(character: number, position: vscode.Position): vscode.Range {
    return new vscode.Range(position.line, character, position.line, position.character);
  }

  context.subscriptions.push(vscode.commands.registerTextEditorCommand('hsnips.expand',
    (editor, _, snippet: HSnippet, position: vscode.Position, matchGroups: string[]) => {
      let document = editor.document;
      let range = document.getWordRangeAtPosition(position);

      if (snippet.regexp) {
        let line = document.getText(lineRange(0, position));
        let match = snippet.regexp.exec(line);
        if (match) {
          range = lineRange(match.index, position);
        }
      }

      if (!range) return;
      expandSnippet(snippet, editor, range, matchGroups);
    }
  ));

  context.subscriptions.push(vscode.languages.registerCompletionItemProvider('plaintext',
    {
      provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        let word = '';
        let range = document.getWordRangeAtPosition(position);
        if (range) word = document.getText(range);
        let line = document.getText(lineRange(0, position));

        let snippets = SNIPPETS_BY_LANGUAGE.get(document.languageId);
        if (!snippets) snippets = SNIPPETS_BY_LANGUAGE.get('all');
        if (!snippets) return;

        let completions = [];
        for (let snippet of snippets) {
          let snippetMatches = snippet.trigger && snippet.trigger == word;
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

          if (snippetMatches || (word && snippet.trigger.startsWith(word))) {
            let completionItem = new vscode.CompletionItem(snippet.trigger || word);
            completionItem.detail = snippet.description;
            completionItem.command = {
              command: 'hsnips.expand',
              title: 'expand',
              arguments: [snippet, position, matchGroups]
            };
            completions.push(completionItem);
          }

          if (snippetRange && snippet.automatic && snippetMatches) {
            let editor = vscode.window.activeTextEditor;
            if (editor && document == editor.document) {
              expandSnippet(snippet, editor, snippetRange, matchGroups);
              return;
            }
          }
        }

        return completions;
      }
    },
    ...triggers
  ));

  // Forward all document changes so that the snippets in that document can update their related
  // blocks.
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
    let document = e.document;

    let snippetInstances = ACTIVE_SNIPPETS.get(document.uri);
    if (!snippetInstances) return;

    for (let instance of snippetInstances) {
      instance.update(e.contentChanges);
    }
  }));

  // Remove any stale snippet instances.
  context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(editors => {
    let uris = editors.map(e => e.document.uri);
    for (let key of ACTIVE_SNIPPETS.keys()) {
      if (!uris.includes(key)) {
        ACTIVE_SNIPPETS.delete(key);
      }
    }
  }));

  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(e => {
    let uri = e.textEditor.document.uri;
    let snippets = ACTIVE_SNIPPETS.get(uri);
    if (!snippets) return;

    snippets = snippets.filter(snippet => e.selections.some(sel => snippet.range.contains(sel)));

    ACTIVE_SNIPPETS.set(uri, snippets);
  }));
}
