import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import openExplorer = require('open-file-explorer');
import { HSnippet } from './hsnippet';
import { HSnippetInstance } from './hsnippetInstance';
import { parse } from './parser';
import { getSnippetDir } from './utils';
import { getCompletions, CompletionInfo } from './completion';

const SNIPPETS_BY_LANGUAGE: Map<string, HSnippet[]> = new Map();
const SNIPPET_STACK: HSnippetInstance[] = [];

const readFileAsync = util.promisify(fs.readFile);
const readdirAsync = util.promisify(fs.readdir);
const existsAsync = util.promisify(fs.exists);
const mkdirAsync = util.promisify(fs.mkdir);

async function loadSnippets() {
  SNIPPETS_BY_LANGUAGE.clear();

  let snippetDir = getSnippetDir();
  if (!(await existsAsync(snippetDir))) {
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

  // Sort snippets by descending priority.
  for (let snippetList of SNIPPETS_BY_LANGUAGE.values()) {
    snippetList.sort((a, b) => b.priority - a.priority);
  }
}

export function expandSnippet(completion: CompletionInfo, editor: vscode.TextEditor) {
  let snippetInstance = new HSnippetInstance(
    completion.snippet,
    editor,
    completion.range.start,
    completion.groups
  );

  editor.insertSnippet(snippetInstance.snippetString, completion.range).then(() => {
    if (snippetInstance.selectedPlaceholder != 0) SNIPPET_STACK.unshift(snippetInstance);
  });
}

export function activate(context: vscode.ExtensionContext) {
  loadSnippets();

  context.subscriptions.push(
    vscode.commands.registerCommand('hsnips.openSnippetsDir', () => openExplorer(getSnippetDir()))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('hsnips.openSnippetFile', async () => {
      let snippetDir = getSnippetDir();
      let files = await readdirAsync(snippetDir);
      let selectedFile = await vscode.window.showQuickPick(files);

      if (selectedFile) {
        let document = await vscode.workspace.openTextDocument(path.join(snippetDir, selectedFile));
        vscode.window.showTextDocument(document);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('hsnips.reloadSnippets', () => loadSnippets())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('hsnips.leaveSnippet', () => {
      while (SNIPPET_STACK.length) SNIPPET_STACK.pop();
      vscode.commands.executeCommand('leaveSnippet');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('hsnips.nextPlaceholder', () => {
      if (SNIPPET_STACK[0] && !SNIPPET_STACK[0].nextPlaceholder()) {
        SNIPPET_STACK.shift();
      }
      vscode.commands.executeCommand('jumpToNextSnippetPlaceholder');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('hsnips.prevPlaceholder', () => {
      if (SNIPPET_STACK[0] && !SNIPPET_STACK[0].prevPlaceholder()) {
        SNIPPET_STACK.shift();
      }
      vscode.commands.executeCommand('jumpToPrevSnippetPlaceholder');
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.languageId == 'hsnips') {
        loadSnippets();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      'hsnips.expand',
      (editor, _, completion: CompletionInfo) => {
        expandSnippet(completion, editor);
      }
    )
  );

  // Forward all document changes so that the active snippet can update its related blocks.
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!SNIPPET_STACK.length || SNIPPET_STACK[0].editor.document != e.document) return;
      SNIPPET_STACK[0].update(e.contentChanges);
    })
  );

  // Remove any stale snippet instances.
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      while (SNIPPET_STACK.length) SNIPPET_STACK.pop();
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((e) => {
      while (SNIPPET_STACK.length) {
        if (e.selections.some((s) => SNIPPET_STACK[0].range.contains(s))) {
          break;
        }
        SNIPPET_STACK.shift();
      }
    })
  );

  // Trigger snippet on every reasonable ascii character.
  const triggers = [];
  for (let i = 32; i <= 126; i++) {
    triggers.push(String.fromCharCode(i));
  }

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      [{ scheme: 'untitled' }, { scheme: 'file' }],
      {
        provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
          let snippets = SNIPPETS_BY_LANGUAGE.get(document.languageId.toLowerCase());
          if (!snippets) snippets = SNIPPETS_BY_LANGUAGE.get('all');
          if (!snippets) return;

          let completions = getCompletions(document, position, snippets);

          if (!completions) return;

          if (Array.isArray(completions)) {
            return completions.map((c) => c.toCompletionItem());
          }

          let editor = vscode.window.activeTextEditor;
          if (editor && document == editor.document) {
            expandSnippet(completions, editor);
            return;
          }
        },
      },
      ...triggers
    )
  );
}
