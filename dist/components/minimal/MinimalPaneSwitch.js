import { jsx as _jsx } from "react/jsx-runtime";
import { useMinimalChrome } from './MinimalChromeContext';
const PANES = [
    { key: 'turns', label: 'Turns' },
    { key: 'thread', label: 'Thread' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'git', label: 'Git' },
];
export function MinimalPaneSwitch() {
    const { mobilePane, setMobilePane } = useMinimalChrome();
    return (_jsx("div", { className: "bc-mc-paneswitch", role: "tablist", "aria-label": "Pane", children: PANES.map(p => (_jsx("button", { type: "button", role: "tab", "aria-selected": mobilePane === p.key, className: `bc-mc-paneswitch-btn ${mobilePane === p.key ? 'bc-mc-paneswitch-btn-active' : ''}`, onClick: () => setMobilePane(p.key), children: p.label }, p.key))) }));
}
//# sourceMappingURL=MinimalPaneSwitch.js.map