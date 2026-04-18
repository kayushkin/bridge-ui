const registry = new Map();
export function registerToolRenderer(toolName, component) {
    registry.set(toolName, component);
}
export function getToolRenderer(toolName) {
    return registry.get(toolName);
}
//# sourceMappingURL=registry.js.map