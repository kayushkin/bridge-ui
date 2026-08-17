import type { FetchFn } from '../types';
import type { CardView } from '../types-kanban';
type SessionLinkRef = {
    ref: string;
    dispatchedAt: string;
};
type OpenChatFn = (link: SessionLinkRef) => void;
/**
 * Kanban page. The header carries a board selector and a layout toggle so the
 * column flow can run side-by-side (landscape) or stacked (portrait). Card
 * click opens a drawer with body, status, links, and entity-link/tag editors.
 */
export declare function BridgeKanban(): import("react/jsx-runtime").JSX.Element;
/** What a card view needs to render and mutate one card, wherever it is mounted.
 *
 *  Named and exported because there are two mounts now — the board's drawer and
 *  the standalone card page — and an inline literal cannot be spread from one to
 *  the other without being written twice.
 *
 *  ⚠️ `boardID` is required but deliberately unused by the body (`_boardID`). It
 *  is the board a mutation applies to, and the drawer has always taken it; the
 *  page passes the placement it resolved. Dropping it would be a wider change
 *  than this split. */
export interface CardDetailProps {
    card: CardView;
    boardID: string;
    entityTypes: {
        type: string;
        service?: string;
        search?: string;
    }[];
    /** Dismiss. The drawer closes; the page navigates back. */
    onClose: () => void;
    onPatch: (patch: Record<string, unknown>) => Promise<boolean>;
    onDelete: (hard: boolean) => void | Promise<void>;
    onAddLink: (entity_type: string, entity_ref: string, label?: string) => Promise<boolean>;
    onDeleteLink: (linkID: string) => Promise<boolean>;
    onOpenChat: OpenChatFn;
    onOpenInMail: (accountID: string, messageID: string) => void;
    mailBasePath: string;
    fetchFn: FetchFn;
    /** Rendered in the header beside the close button. The drawer puts a link to
     *  the standalone card page here; the page itself passes nothing, because a
     *  link to where you already are is noise. */
    headerAction?: React.ReactNode;
}
export declare function CardDetail({ card, boardID: _boardID, entityTypes, onClose, onPatch, onDelete, onAddLink, onDeleteLink, onOpenChat, onOpenInMail, mailBasePath, fetchFn, headerAction, }: CardDetailProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=BridgeKanban.d.ts.map