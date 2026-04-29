export function splitModeAxis(mode) {
    switch (mode) {
        case 'split-left': return { axis: 'h', position: 'before' };
        case 'split-right': return { axis: 'h', position: 'after' };
        case 'split-up': return { axis: 'v', position: 'before' };
        case 'split-down': return { axis: 'v', position: 'after' };
        default: return null;
    }
}
//# sourceMappingURL=types.js.map