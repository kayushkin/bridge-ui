/**
 * Types for the tool-store HTTP API. Hand-written to mirror Go structs in
 * `~/repos/tool-store` (tool.go, provision.go, server.go) — tool-store does
 * not yet ship to `@kayushkin/llm-bridge-types`. Keep in sync if either side
 * changes.
 */
export type ToolKind = 'mcp' | 'cli' | 'local';
export interface MCPSpec {
    transport: 'stdio' | 'http' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
}
export interface CLISpec {
    command: string;
    args_template?: string[];
    working_dir?: string;
    timeout_ms?: number;
}
export interface LocalSpec {
    symbol: string;
}
export interface Tool {
    id: number;
    name: string;
    display_name?: string;
    description: string;
    kind: ToolKind;
    /** JSON Schema for tool input. Opaque blob — render lazily. */
    input_schema?: unknown;
    env_keys?: string[];
    /** Map env-var name → auth-store provider name. */
    credentials?: Record<string, string>;
    tags?: string[];
    mcp?: MCPSpec;
    cli?: CLISpec;
    local?: LocalSpec;
    enabled: boolean;
    created_at: number;
    updated_at: number;
}
/** A discovered local impl that may not yet have a tools-row registered. */
export interface LocalDescriptor {
    name: string;
    description: string;
    input_schema?: unknown;
}
//# sourceMappingURL=types-tools.d.ts.map