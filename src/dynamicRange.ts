import * as vscode from 'vscode';

type PositionDelta = { characterDelta: number; lineDelta: number };

export enum GrowthType {
  Grow,
  FixLeft,
  FixRight
}

export interface IChangeInfo {
  change: vscode.TextDocumentContentChangeEvent;
  growth: GrowthType;
}

function getRangeDelta(
  range: vscode.Range,
  change: vscode.TextDocumentContentChangeEvent,
  growth: GrowthType
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

  if (change.range.end.line == range.start.line)
    if (
      (growth == GrowthType.FixRight && range.start.isEqual(change.range.end)) ||
      range.start.isAfter(change.range.end)
    ) {
      deltaStart.characterDelta = charDelta;
    }

  if (change.range.end.line == range.end.line)
    if (
      (growth != GrowthType.FixLeft && range.end.isEqual(change.range.end)) ||
      range.end.isAfter(change.range.end)
    ) {
      deltaEnd.characterDelta = charDelta;
    }

  return [deltaStart, deltaEnd];
}

export class DynamicRange {
  range: vscode.Range;

  constructor(start: vscode.Position, end: vscode.Position) {
    this.range = new vscode.Range(start, end);
  }

  static fromRange(range: vscode.Range) {
    return new DynamicRange(range.start, range.end);
  }

  update(changes: IChangeInfo[]) {
    let deltaStart = { characterDelta: 0, lineDelta: 0 };
    let deltaEnd = { characterDelta: 0, lineDelta: 0 };

    for (let { change, growth } of changes) {
      let deltaChange = getRangeDelta(this.range, change, growth);

      deltaStart.characterDelta += deltaChange[0].characterDelta;
      deltaStart.lineDelta += deltaChange[0].lineDelta;
      deltaEnd.characterDelta += deltaChange[1].characterDelta;
      deltaEnd.lineDelta += deltaChange[1].lineDelta;
    }

    let [newStart, newEnd] = [this.range.start, this.range.end];
    newStart = newStart.translate(deltaStart);
    newEnd = newEnd.translate(deltaEnd);
    this.range = this.range.with(newStart, newEnd);
  }

  contains(range: vscode.Range): boolean {
    return this.range.contains(range);
  }
}
