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

  function parse_path(path: string) {
    return path.replace(/\%APPDATA\%/g, APPDATA).replace(/\$HOME/g, HOME);
  }

  if (platform == 'win32') {
    let path: string | undefined = vscode.workspace.getConfiguration('hsnips').get('windows');
    return parse_path(path ? parse_path(path) : parse_path("%APPDATA%/Code/User/hsnips"));
  } else if (platform == 'darwin') {
    let path: string | undefined = vscode.workspace.getConfiguration('hsnips').get('mac');
    return parse_path(path ? parse_path(path) : parse_path("$HOME/Library/Application Support/Code/User/hsnips"));
  } else {
    let path: string | undefined = vscode.workspace.getConfiguration('hsnips').get('linux');
    return parse_path(path ? parse_path(path) : parse_path("$HOME/.config/Code/User/hsnips"));
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

export function getWorkspaceUri(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri?.toString() ?? "";
}
