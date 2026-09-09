/** The chat: sidebar + thread + panes, on the `@kayushkin/chat-core` data layer — it
 *  renders from an in-memory store and the network only reconciles.
 *
 *  Mounts no provider. `<Bridge>` supplies both: `BridgeProvider` (config, and the
 *  one `MinimalChromeProvider` the tab row and this page's phone chrome must share
 *  — bridge-ui `936ec04`) and chat-core's `ChatProvider`, held above the router so
 *  the session store survives a switch to another tab and back.
 *
 *  Plus the cold-load bootstrap.
 *
 *  Landing on `/` used to show an empty pane, because nothing ever opened a chat:
 *  `activeId` starts null (no session is restored across a reload) and no pending pane
 *  was opened either, so the composer typed into a draft that would be sent to whatever
 *  instance the server happened to default to. The bootstrap opens ONE pending chat,
 *  aimed at the same recorded instance the "+ New" button uses.
 *
 *  It fires once, and only after prefs and instances have both loaded — acting earlier
 *  reads an empty prefs snapshot and targets nothing. It re-checks `activeId` at fire
 *  time rather than trusting the value it was mounted with: a session clicked in the
 *  sidebar while prefs were still in flight must not be replaced by a new chat. */
export declare function BridgeChat(): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=BridgeChat.d.ts.map