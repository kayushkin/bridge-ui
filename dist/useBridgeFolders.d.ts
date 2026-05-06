export declare const ARCHIVE_FOLDER = "Archive";
export interface UseBridgeFoldersReturn {
    folderOrder: string[];
    refresh: () => Promise<void>;
    createFolder: (name: string) => Promise<void>;
    deleteFolder: (name: string) => Promise<void>;
    renameFolder: (oldName: string, newName: string) => Promise<void>;
    setSessionFolder: (sessionId: string, folder: string) => Promise<void>;
    markSessionDone: (sessionId: string, done: boolean) => Promise<void>;
}
export declare function useBridgeFolders(): UseBridgeFoldersReturn;
//# sourceMappingURL=useBridgeFolders.d.ts.map