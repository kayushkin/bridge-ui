export interface SnapshotMeta {
    phase: 'before' | 'after';
    file_path: string;
    size: number;
    blob_sha?: string;
    blob_url?: string;
    is_binary?: boolean;
    too_large?: boolean;
    missing?: boolean;
}
export interface FileSnapshots {
    file_path: string;
    before: SnapshotMeta | null;
    after: SnapshotMeta | null;
}
export interface SnapshotsResponse {
    files: FileSnapshots[];
}
export interface LoadedSide {
    label: string;
    content: string;
    meta?: SnapshotMeta;
}
export interface LoadedFileDiff {
    filePath: string;
    before: LoadedSide;
    after: LoadedSide;
    hint: string;
}
export declare function loadSide(fetchFn: (url: string, opts?: RequestInit) => Promise<Response>, basePath: string, label: string, meta: SnapshotMeta | null, fallback: string | undefined): Promise<LoadedSide>;
export declare function sidesHint(before: SnapshotMeta | null, after: SnapshotMeta | null): string;
//# sourceMappingURL=snapshots.d.ts.map