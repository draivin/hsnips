declare module 'open-file-explorer' {
    function openExplorer(path: string, callback?: (err: Error) => any): void;
    export = openExplorer;
}
