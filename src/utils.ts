import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

export enum SnippetDirType {
  Global,
  Workspace,
}

export interface SnippetDirInfo {
  readonly type: SnippetDirType;
  readonly path: string;
}

/**
 * "Expanding" here means turning a prefix string like '~' into a string like '/home/foo'
 */
const pathPrefixExpanders: {
  readonly [prefix: string]: {
    readonly finalPathType: SnippetDirType;
    readonly prefixExpanderFunc: () => string | null;
  };
} = {
  '~': ({ finalPathType: SnippetDirType.Global, prefixExpanderFunc: os.homedir, }),
  '${workspaceFolder}': ({ finalPathType: SnippetDirType.Workspace, prefixExpanderFunc: getWorkspaceFolderPath, }),
};

function getWorkspaceFolderPath(): string | null {
  return vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || null;
}

export function lineRange(character: number, position: vscode.Position): vscode.Range {
  return new vscode.Range(position.line, character, position.line, position.character);
}

/**
 * The parameter `options`, can be removed after the function `getOldGlobalSnippetDir` is removed and migration from the
 * directory to the new one is not necessary anymore.
 */
export function getSnippetDirInfo(
  context: vscode.ExtensionContext,
  options: { ignoreWorkspace: boolean } = { ignoreWorkspace: false },
): SnippetDirInfo {
  let hsnipsPath = vscode.workspace.getConfiguration('hsnips').get('hsnipsPath') as string | null;

  // only non-empty strings are taken, anything else is discarded
  if (typeof hsnipsPath === 'string' && hsnipsPath.length > 0) {
    // normalize to ensure that the correct platform-specific file separators are used
    hsnipsPath = path.normalize(hsnipsPath);

    let type: SnippetDirType | null = null;

    // first some "preprocessing" is done on the configured path: expanding leading '~' and '${workspaceFolder}'
    for (const prefix in pathPrefixExpanders) {
      // a leading string like '~foo' is ignored, only '~' or '~/foo' values are taken
      if (hsnipsPath !== prefix && !hsnipsPath.startsWith(prefix + path.sep)) {
        continue;
      }

      const expandingInfo = pathPrefixExpanders[prefix];

      if (options.ignoreWorkspace && expandingInfo.finalPathType == SnippetDirType.Workspace) {
        // this expander would've resulted in a workspace folder path; skip it
        continue;
      }

      const expandedPrefix = expandingInfo.prefixExpanderFunc();

      if (expandedPrefix) {
        hsnipsPath = expandedPrefix + hsnipsPath.substring(prefix.length);
        type = expandingInfo.finalPathType;
      } else {
        // in case the prefix did match, but the expanded function wasn't able to properly expand, the entire path will
        // be invalidated
        // e.g.: given the string '~/foo', but the home directory could not be determined for some reason
        hsnipsPath = null;
        type = null;
      }

      break;
    }

    // this will only be falsy if the path was invalidated as a result of one of the expander functions failing to
    // properly expanding a prefix
    if (hsnipsPath) {
      if (!options.ignoreWorkspace) {
        const workspaceFolderPath = getWorkspaceFolderPath();
        if (!path.isAbsolute(hsnipsPath) && workspaceFolderPath) {
          hsnipsPath = path.join(workspaceFolderPath, hsnipsPath);
          type = SnippetDirType.Workspace;
        }
      }

      // at this point the path will only be relative in four cases:
      //  * an already relative path was configured without a matching prefix to expand
      //  * one of the expander functions messed up and returned a relative path
      //  * the function `getWorkspaceFolderPath` messed and returned a relative path
      //  * the path would've been a workspace path, but the parameter `ignoreWorkspace` is set to `true`
      if (path.isAbsolute(hsnipsPath)) {
        if (type === null) {
          type = SnippetDirType.Global;
        }

        return {
          type,
          path: hsnipsPath,
        };
      }
    }
  }

  const globalStoragePath = context.globalStorageUri.fsPath;
  return {
    type: SnippetDirType.Global,
    path: path.join(globalStoragePath, 'hsnips'),
  };
}

/**
 * @deprecated The paths here are hardcoded in. Only keep this function so that older users can migrate.
 */
export function getOldGlobalSnippetDir(): string {
  let hsnipsPath = vscode.workspace.getConfiguration('hsnips').get('hsnipsPath') as string | null;

  if (hsnipsPath && path.isAbsolute(hsnipsPath)) {
    return hsnipsPath;
  }

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

export function getWorkspaceUri(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri?.toString() ?? '';
}
