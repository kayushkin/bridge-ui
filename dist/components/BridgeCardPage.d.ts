/**
 * One card, as a page of its own.
 *
 * The board already opens a card in a drawer, and `?card=<id>` links to it
 * there. This is the same view without the board behind it — a card is a unit of
 * work in its own right, and a link to one should not require loading a board to
 * read it.
 *
 * ⚠️ It does NOT call `useKanban(boardId)` to find the card. That would fetch a
 * whole board's columns, cards and links to display one of them, and it cannot
 * even start until the card's board is known. kanban-store has no single-card
 * read — `cardByID` answers PATCH and DELETE and 405s everything else — but the
 * card's four parts are each separately addressable, so the page assembles it:
 *
 *   item        noteboard `/api/items/{id}`      — a card id IS a noteboard item id
 *   placements  kanban    `/api/cards/{id}/placements`
 *   links       kanban    `/api/cards/{id}/links`
 *   assignments kanban    `/api/cards/{id}/assignments`
 *
 * ⚠️ The assignments route EXISTS (kanban-store `internal/api/assignments.go`,
 * `cardAssignments`; measured live 2026-09-09). An earlier version of this
 * page said it did not, left `assignments` undefined, and CardDetail duly
 * reported them "not loaded" — for every card, forever.
 *
 * `useKanban(null)` is mounted only for its verbs. Its board-scoped calls
 * (`createCard`, `createColumn`, `moveCard`) refuse without a board, and this
 * page uses none of them; `patchCard`, `deleteCard` and the link verbs take a
 * card id and are board-independent.
 */
export declare function BridgeCardPage(): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=BridgeCardPage.d.ts.map