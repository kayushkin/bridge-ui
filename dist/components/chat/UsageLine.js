import { jsx as _jsx } from "react/jsx-runtime";
import { formatTokens } from '../../utils';
export function UsageLine({ usage }) {
    const parts = [];
    if (usage.input_tokens)
        parts.push(`in ${formatTokens(usage.input_tokens)}`);
    if (usage.output_tokens)
        parts.push(`out ${formatTokens(usage.output_tokens)}`);
    if (usage.cache_read_tokens)
        parts.push(`cache-read ${formatTokens(usage.cache_read_tokens)}`);
    if (usage.cache_write_tokens)
        parts.push(`cache-write ${formatTokens(usage.cache_write_tokens)}`);
    if (parts.length === 0)
        return null;
    return _jsx("div", { className: "bc-row-usage", children: parts.join(' · ') });
}
//# sourceMappingURL=UsageLine.js.map