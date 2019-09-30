import * as vscode from 'vscode';

type GeneratorResult = [(string | { block: number })[], string[]];
export type GeneratorFunction = (texts: string[], matchGroups: string[]) => GeneratorResult;

export class HSnippet {
  trigger: string;
  description: string;
  generator: GeneratorFunction;
  automatic = false;
  regexp?: RegExp;

  constructor(header: HSnippetHeader, generator: GeneratorFunction) {
    this.description = header.description;
    this.generator = generator;

    if (header.trigger instanceof RegExp) {
      this.regexp = header.trigger;
      this.trigger = '';
    } else {
      this.trigger = header.trigger;
    }

    if (header.flags.includes('A')) {
      this.automatic = true;
    }
  }
}

export interface HSnippetHeader {
  trigger: string | RegExp;
  description: string;
  flags: string;
}

export class HSnippetInstance {
  type: HSnippet;
  range: vscode.Range;
  editor: vscode.TextEditor;
  placeholderRanges: vscode.Range[];
  placeholderContents: string[];
  blockRanges: vscode.Range[];
  snippetString: vscode.SnippetString;
  matchGroups: string[];

  constructor(
    type: HSnippet,
    editor: vscode.TextEditor,
    position: vscode.Position,
    matchGroups: string[]
  ) {
    this.type = type;
    this.editor = editor;
    this.matchGroups = matchGroups;

    let generatorResult: GeneratorResult = [[], []];
    try {
      generatorResult = type.generator([], this.matchGroups);
    } catch (e) {
      vscode.window.showWarningMessage(
        `Snippet ${this.type.description} failed to expand with error: ${e.message}`
      );
    }

    // For a lack of creativity, I'm referring to the partes of the array that are returned by the
    // snippet function as 'sections', and the result of the interpolated javascript in the snippets
    // are referred to as 'blocks', as in code blocks.
    let [sections, blocks] = generatorResult;

    this.placeholderRanges = [];
    this.placeholderContents = [];
    this.blockRanges = [];

    let line = position.line;
    let character = position.character;
    let snippetString = '';
    let indentLevel = editor.document.lineAt(line).firstNonWhitespaceCharacterIndex;

    for (let section of sections) {
      let sectionStart = new vscode.Position(line, character);

      let sectionText = section;
      if (typeof sectionText != 'string') {
        sectionText = String(blocks[sectionText.block]);
      }

      snippetString += sectionText;
      // TODO: Handle snippets with default content in a placeholder.
      let sectionParts = sectionText.split(/\$\d+|\$\{\d+\}/g);

      while (sectionParts.length > 0) {
        let textPart = sectionParts.shift() as string;
        let partLines = textPart.split('\n');

        line += partLines.length - 1;
        if (partLines.length > 1) {
          character = indentLevel;
        }
        character += partLines[partLines.length - 1].length;

        let placeholderPosition = new vscode.Position(line, character);
        this.placeholderRanges.push(new vscode.Range(placeholderPosition, placeholderPosition));
        this.placeholderContents.push('');
      }

      // Remove extra placeholder at the end.
      this.placeholderContents.pop();
      this.placeholderRanges.pop();

      if (typeof section != 'string') {
        let sectionEnd = new vscode.Position(line, character);
        this.blockRanges.push(new vscode.Range(sectionStart, sectionEnd));
      }
    }

    let end = new vscode.Position(line, character);
    let range = new vscode.Range(position, end);

    this.range = range;
    this.snippetString = new vscode.SnippetString(snippetString);
  }

  // Updates the location of all the placeholder blocks and code blocks, and if any change happened
  // to the placeholder blocks run the snippet again with the update values so we can update the
  // code blocks.
  update(changes: readonly vscode.TextDocumentContentChangeEvent[]) {
    type PositionDelta = { characterDelta: number; lineDelta: number };
    function getRangeDelta(
      range: vscode.Range,
      change: vscode.TextDocumentContentChangeEvent
    ): [PositionDelta, PositionDelta] {
      let deltaStart = { characterDelta: 0, lineDelta: 0 };
      let deltaEnd = { characterDelta: 0, lineDelta: 0 };

      let textLines = change.text.split('\n');
      let lineDelta =
        change.text.split('\n').length - (change.range.end.line - change.range.start.line + 1);
      let charDelta = textLines[textLines.length - 1].length - change.range.end.character;
      if (lineDelta == 0) charDelta += change.range.start.character;

      if (range.start.isAfterOrEqual(change.range.end)) {
        deltaStart.lineDelta = lineDelta;
      }

      if (range.end.isAfterOrEqual(change.range.end)) {
        deltaEnd.lineDelta = lineDelta;
      }

      if (change.range.end.line == range.start.line && range.start.isAfter(change.range.end)) {
        deltaStart.characterDelta = charDelta;
      }

      if (change.range.end.line == range.end.line && range.end.isAfterOrEqual(change.range.end)) {
        deltaEnd.characterDelta = charDelta;
      }

      return [deltaStart, deltaEnd];
    }

    function updateRange(range: vscode.Range): vscode.Range {
      let deltaStart = { characterDelta: 0, lineDelta: 0 };
      let deltaEnd = { characterDelta: 0, lineDelta: 0 };
      for (let change of changes) {
        let deltaChange = getRangeDelta(range, change);
        deltaStart.characterDelta += deltaChange[0].characterDelta;
        deltaStart.lineDelta += deltaChange[0].lineDelta;
        deltaEnd.characterDelta += deltaChange[1].characterDelta;
        deltaEnd.lineDelta += deltaChange[1].lineDelta;
      }

      let [newStart, newEnd] = [range.start, range.end];
      newStart = newStart.translate(deltaStart);
      newEnd = newEnd.translate(deltaEnd);
      return range.with(newStart, newEnd);
    }

    let changedIndices = this.placeholderRanges
      .map((range, i) => [range, i] as [vscode.Range, number])
      .filter(([range, _]) => changes.some(change => range.contains(change.range)))
      .map(([_, i]) => i);

    this.placeholderRanges = this.placeholderRanges.map(updateRange);
    this.blockRanges = this.blockRanges.map(updateRange);
    this.range = updateRange(this.range);

    if (!changedIndices.length) return;

    for (let i of changedIndices) {
      this.placeholderContents[i] = this.editor.document.getText(this.placeholderRanges[i]);
    }

    let newBlocks = this.type.generator(this.placeholderContents, this.matchGroups)[1];

    this.editor.edit(edit => {
      for (let i = 0; i < newBlocks.length; i++) {
        let range = this.blockRanges[i];
        let oldContent = this.editor.document.getText(range);
        let content = String(newBlocks[i]);

        if (content != oldContent) edit.replace(range, content);
      }
    });
  }
}
