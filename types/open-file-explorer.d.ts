declare module 'open-file-explorer' {
  function openExplorer(path: string, callback?: (err: Error) => void): void;
  export = openExplorer;
}
