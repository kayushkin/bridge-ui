import type { SplitMode } from './types';
interface SplitButtonsProps {
    onSplit: (mode: SplitMode) => void;
    active?: SplitMode | null;
    size?: 'sm' | 'md';
    autoTitle?: string;
    chooseTitle?: string;
}
export declare function SplitButtons({ onSplit, active, size, autoTitle, chooseTitle, }: SplitButtonsProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=SplitButtons.d.ts.map