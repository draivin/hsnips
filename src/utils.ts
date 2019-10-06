import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

export function lineRange(character: number, position: vscode.Position): vscode.Range {
  return new vscode.Range(position.line, character, position.line, position.character);
}

export function getSnippetDir(): string {
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

export function applyOffset(
  position: vscode.Position,
  text: string,
  indent: number
): vscode.Position {
  text = text.replace('\\$', '$');
  let lines = text.split('\n');
  let newLine = position.line + lines.length - 1;
  let charOffset = lines[lines.length - 1].length;

  let newChar = position.character + charOffset;
  if (lines.length > 1) newChar = indent + charOffset;

  return position.with(newLine, newChar);
}
