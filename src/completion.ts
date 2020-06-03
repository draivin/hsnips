import * as vscode from 'vscode';
import { lineRange } from './utils';
import { HSnippet } from './hsnippet';

export class CompletionInfo {
  range: vscode.Range;
  snippet: HSnippet;
  label: string;
  groups: string[];

  constructor(snippet: HSnippet, label: string, range: vscode.Range, groups: string[]) {
    this.snippet = snippet;
    this.label = label;
    this.range = range;
    this.groups = groups;
  }

  toCompletionItem() {
    let completionItem = new vscode.CompletionItem(this.label);
    completionItem.range = new vscode.Range(this.range.end, this.range.end);
    completionItem.detail = this.snippet.description;
    completionItem.insertText = '';
    completionItem.command = {
      command: 'hsnips.expand',
      title: 'expand',
      arguments: [this],
    };

    return completionItem;
  }
}

function matchSuffixPrefix(context: string, trigger: string) {
  while (trigger.length) {
    if (context.endsWith(trigger)) return trigger;
    trigger = trigger.substring(0, trigger.length - 1);
  }

  return false;
}

export function getCompletions(
  document: vscode.TextDocument,
  position: vscode.Position,
  snippets: HSnippet[]
): CompletionInfo[] | CompletionInfo | undefined {
  let line = document.getText(lineRange(0, position));

  // Grab everything until previous whitespace as our matching context.
  let match = line.match(/\S*$/);
  let contextRange = lineRange((match as RegExpMatchArray).index || 0, position);
  let context = document.getText(contextRange);

  let longContext = null;

  let completions = [];
  for (let snippet of snippets) {
    let snippetMatches = snippet.trigger && context.endsWith(snippet.trigger);
    let snippetRange = contextRange;
    let prefixMatches = false;

    let matchGroups: string[] = [];
    let label = snippet.trigger;

    // TODO: Perhaps transform every trigger into a regexp and avoid the case analysis.
    if (snippet.trigger) {
      let matchingPrefix = snippetMatches
        ? snippet.trigger
        : matchSuffixPrefix(context, snippet.trigger);

      if (matchingPrefix) {
        snippetRange = new vscode.Range(position.translate(0, -matchingPrefix.length), position);
        prefixMatches = true;
      }
    } else if (snippet.regexp) {
      let regexContext = line;

      if (snippet.multiline) {
        if (!longContext)
          longContext = document
            .getText(
              new vscode.Range(new vscode.Position(Math.max(position.line - 20, 0), 0), position)
            )
            .replace(/\r/g, '');

        regexContext = longContext;
      }

      let match = snippet.regexp.exec(regexContext);
      if (match) {
        let charOffset = match.index - regexContext.lastIndexOf('\n', match.index) - 1;
        let lineOffset = match[0].split('\n').length - 1;

        snippetRange = new vscode.Range(
          new vscode.Position(position.line - lineOffset, charOffset),
          position
        );
        snippetMatches = true;
        matchGroups = match;
        label = match[0];
      }
    }

    let completion = new CompletionInfo(snippet, label, snippetRange, matchGroups);
    if (snippet.automatic && snippetMatches) {
      return completion;
    } else if (prefixMatches) {
      completions.push(completion);
    }
  }

  return completions;
}
