/** The chat: sidebar + thread + panes, on the `@kayushkin/chat-core` data layer —
 *  it renders from an in-memory store and the network only reconciles.
 *
 *  ⚠️ This mounts ONE provider, and the absence of the second is deliberate.
 *  `BridgeProvider` comes from the host's `BridgeLayout`, which this page routes
 *  under. Mounting another here would still resolve every value — but
 *  `BridgeProvider` nests a `MinimalChromeProvider` unconditionally
 *  (`provider.tsx`), so the page would hold TWO: `useRegisterMinimalChrome`
 *  below would register its phone chrome with the inner one while the tab row
 *  reads the outer, which would never learn a surface had taken over and would
 *  draw its tabs on top of that chrome at narrow widths (bridge-ui `936ec04`).
 *
 *  `ChatProvider` is chat-core's data layer and nothing above supplies it. Its
 *  paths come from the same `BridgeConfig` every other page reads, so the chat
 *  reaches noteboard and the resolver through whatever the host proxies. */
export declare function BridgeChat(): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=BridgeChat.d.ts.map