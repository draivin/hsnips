import * as vscode from 'vscode';
import { DynamicRange, GrowthType, IChangeInfo } from './dynamicRange';
import { applyOffset, getWorkspaceUri } from './utils';
import { HSnippet, GeneratorResult } from './hsnippet';


// listen to the selection text
let selectedText = "";
let lastTimeOfselectedTextChanged = new Date().getTime();
vscode.window.onDidChangeTextEditorSelection((e) => {
    const newSelectedText = e.textEditor.document.getText(e.selections[0]);
    if (newSelectedText) {
        selectedText = newSelectedText;
        lastTimeOfselectedTextChanged = new Date().getTime();
    }
});

enum HSnippetPartType {
  Placeholder,
  Block,
}

class HSnippetPart {
  type: HSnippetPartType;
  range: DynamicRange;
  content: string;
  id?: number;
  updates: IChangeInfo[];

  constructor(type: HSnippetPartType, range: DynamicRange, content: string, id?: number) {
    this.type = type;
    this.range = range;
    this.content = content;
    this.id = id;
    this.updates = [];
  }

  updateRange() {
    if (this.updates.length == 0) return;
    this.range.update(this.updates);
    this.updates = [];
  }
}

export class HSnippetInstance {
  type: HSnippet;
  matchGroups: string[];
  editor: vscode.TextEditor;
  range: DynamicRange;
  placeholderIds: number[];
  selectedPlaceholder: number;
  parts: HSnippetPart[];
  blockParts: HSnippetPart[];
  blockChanged: boolean;
  snippetString: vscode.SnippetString;

  constructor(
    type: HSnippet,
    editor: vscode.TextEditor,
    position: vscode.Position,
    matchGroups: string[]
  ) {
    this.type = type;
    this.editor = editor;
    this.matchGroups = matchGroups;
    this.selectedPlaceholder = 0;
    this.placeholderIds = [];
    this.blockChanged = false;

    // TODO, update parser so only the block that threw the error does not expand, perhaps replace
    // the block with the error message.
    let generatorResult: GeneratorResult = [[], []];
    try {
      generatorResult = type.generator(
        new Array(this.type.placeholders).fill(''),
        this.matchGroups,
        getWorkspaceUri(),
        editor.document.uri.toString()
      );
    } catch (e) {
      vscode.window.showWarningMessage(
        `Snippet ${this.type.description} failed to expand with error: ${e.message}`
      );
    }

    // For a lack of creativity, I'm referring to the parts of the array that are returned by the
    // snippet function as 'sections', and the result of the interpolated javascript in the snippets
    // are referred to as 'blocks', as in code blocks.
    let [sections, blocks] = generatorResult;
    blocks = blocks.map(String);

    this.parts = [];
    this.blockParts = [];

    let start = position;
    let snippetString = '';
    const indentLevel = editor.document.lineAt(position.line).firstNonWhitespaceCharacterIndex;

    for (let section of sections) {

      if (typeof(section) == 'string') {
        // Replace ${VISUAL} with selected text
        if (new Date().getTime() - lastTimeOfselectedTextChanged < 5000) {
          section = section.replace(/\${VISUAL}/g, selectedText);
        } else {
          section = section.replace(/\${VISUAL}/g, '');
        }
      }

      let rawSection = section;

      if (typeof rawSection != 'string') {
        let block = blocks[rawSection.block];
        let endPosition = applyOffset(position, block, indentLevel);
        let range = new DynamicRange(position, endPosition);

        let part = new HSnippetPart(HSnippetPartType.Block, range, block);
        this.parts.push(part);
        this.blockParts.push(part);

        snippetString += block;
        position = endPosition;
        continue;
      }

      snippetString += rawSection;

      // TODO: Handle snippets with default content in a placeholder.
      let PLACEHOLDER_REGEX = /\$(\d+)|\$\{(\d+)\}/;
      let match;
      while ((match = PLACEHOLDER_REGEX.exec(rawSection))) {
        let text = rawSection.substring(0, match.index);
        position = applyOffset(position, text, indentLevel);
        let range = new DynamicRange(position, position);

        let placeholderId = Number(match[1] || match[2]);
        if (!this.placeholderIds.includes(placeholderId)) this.placeholderIds.push(placeholderId);
        this.parts.push(new HSnippetPart(HSnippetPartType.Placeholder, range, '', placeholderId));

        rawSection = rawSection.substring(match.index + match[0].length);
      }

      position = applyOffset(position, rawSection, indentLevel);
    }

    this.snippetString = new vscode.SnippetString(snippetString);
    this.range = new DynamicRange(start, position);

    this.placeholderIds.sort();
    if (this.placeholderIds[0] == 0) this.placeholderIds.shift();
    this.placeholderIds.push(0);
    this.selectedPlaceholder = this.placeholderIds[0];
  }

  nextPlaceholder() {
    let currentIndex = this.placeholderIds.indexOf(this.selectedPlaceholder);
    this.selectedPlaceholder = this.placeholderIds[currentIndex + 1];
    return this.selectedPlaceholder != undefined && this.selectedPlaceholder != 0;
  }

  prevPlaceholder() {
    let currentIndex = this.placeholderIds.indexOf(this.selectedPlaceholder);
    this.selectedPlaceholder = this.placeholderIds[currentIndex - 1];
    return this.selectedPlaceholder != undefined && this.selectedPlaceholder != 0;
  }

  debugLog() {
    let parts = this.parts;
    for (let i = 0; i < parts.length; i++) {
      let range = parts[i].range.range;
      let start = range.start;
      let end = range.end;
      console.log(
        `Tabstop ${i}: "${parts[i].content}" (${start.line}, ${start.character})..(${end.line}, ${end.character})`
      );
    }
  }

  // Updates the location of all the placeholder blocks and code blocks, and if any change happened
  // to the placeholder blocks then run the generator function again with the updated values so the
  // code blocks are updated.
  update(changes: readonly vscode.TextDocumentContentChangeEvent[]) {
    let ordChanges = [...changes];
    ordChanges.sort((a, b) => {
      if (a.range.end.isBefore(b.range.end)) return -1;
      else if (a.range.end.isEqual(b.range.end)) return 0;
      else return 1;
    });

    let changedPlaceholders = [];
    let currentPart = 0;

    // Expand ranges from left to right, preserving relative part positions.
    for (let change of ordChanges) {
      let part = this.parts[currentPart];

      while (currentPart < this.parts.length) {
        if (part.range.range.end.isAfterOrEqual(change.range.end)) {
          break;
        }

        currentPart++;
        part = this.parts[currentPart];
      }

      if (currentPart >= this.parts.length) break;

      while (part.range.contains(change.range)) {
        if (
          (part.type == HSnippetPartType.Placeholder &&
            part.id == this.selectedPlaceholder &&
            !this.blockChanged) ||
          (part.type == HSnippetPartType.Block && this.blockChanged && part.content == change.text)
        ) {
          if (part.type == HSnippetPartType.Placeholder) changedPlaceholders.push(part);
          part.updates.push({ change, growth: GrowthType.Grow });
          currentPart++;
          part = this.parts[currentPart];
          break;
        }

        currentPart++;
        part = this.parts[currentPart];
      }

      for (let i = currentPart; i < this.parts.length; i++) {
        this.parts[i].updates.push({ change, growth: GrowthType.FixRight });
      }
    }

    this.range.update(ordChanges.map((c) => ({ change: c, growth: GrowthType.Grow })));
    this.parts.forEach((p) => p.updateRange());

    if (this.blockChanged) this.blockChanged = false;
    if (!changedPlaceholders.length) return;

    changedPlaceholders.forEach((p) => (p.content = this.editor.document.getText(p.range.range)));
    let placeholderContents = this.parts
      .filter((p) => p.type == HSnippetPartType.Placeholder)
      .map((p) => p.content);

    let blocks = this.type.generator(
      placeholderContents,
      this.matchGroups,
      getWorkspaceUri(),
      this.editor.document.uri.toString()
    )[1].map(String);

    this.editor.edit((edit) => {
      for (let i = 0; i < blocks.length; i++) {
        let range = this.blockParts[i].range;
        let oldContent = this.blockParts[i].content;
        let content = blocks[i];

        if (content != oldContent) {
          edit.replace(range.range, content);
          this.blockChanged = true;
        }
      }
    });

    this.blockParts.forEach((b, i) => (b.content = blocks[i]));
  }
}
