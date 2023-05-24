import * as vscode from 'vscode';
import * as os from 'os';

export function lineRange(character: number, position: vscode.Position): vscode.Range {
  return new vscode.Range(position.line, character, position.line, position.character);
}

function RegReplace(text: string, reg: RegExp, replaceFn: (match: RegExpExecArray) => string): string {
    let result = '';
    let last = 0;
    while (true) {
        let match = reg.exec(text);
        if (!match) break;
        result += text.slice(last, match.index) + replaceFn(match);
        last = match.index + match[0].length;
    }
    result += text.slice(last);
    return result;
}

export function getSnippetDir(): string {
  let platform = os.platform();

  function parse_path(path: string) {
    // replace all %VAR% with their respective env vars
    if (platform == 'win32') {
        path = RegReplace(path, /\%(\w+)\%/g, (match) => process.env[match[1]] || '');
    } else {
        path = RegReplace(path, /\$(\w+)/g, (match) => process.env[match[1]] || '');
    }
    if (platform == 'win32') {
        // replace all / with \ for windows
        path = path.replace(/\//g, '\\');
    }
    return path;
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
