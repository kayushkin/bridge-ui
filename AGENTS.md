# About bridge-ui

## What it owns

A React and TypeScript library, not a service: no port, no database, no deploy of its own. `@kayushkin/bridge-ui` is the whole user interface over an llm-bridge-server backend as one component — `<Bridge>` routes every page, draws the navigation, and mounts both providers: `BridgeProvider` for config and chat-core's `ChatProvider` for the session store, held above the router so switching tabs does not drop it. It is published source-only (`main` is `dist/index.js`, `files` ships `dist`, `styles.css` and `theme.css`) and consumed through a `file:` link; dash is the host that mounts it. `README.md` is the mounting guide: the props, the two stylesheets, and what a host wires.

llm-bridge-server contains no `go:embed` and does not serve this library; dash is the only surface that serves it today.

## Where this prompt lives

These sections are stored in agent-store as a project prompt collection and rendered, with identical text, to `AGENTS.md` and `CLAUDE.md` at the root of this repo, so that whichever file a harness reads it gets the same thing. Edit them on dash `/files`, or edit either rendered file: the 15-minute scan carries the edit back into the sections and out to the other file. The host prompt keeps one row for this repo with only what an agent elsewhere needs.

# How it works

## The page registry

**Every page this library ships is one row of `BRIDGE_PAGES` in `src/pages.ts`** — a `route` key into `BridgeRoutes`, a `label`, a navigation `group`, whether it is `listed`, and optionally `end` (the chat, which sits at the root and would otherwise look active everywhere), `routeSuffix` (`/:cardId`) and `available(config, flags)`. `<Bridge>` builds both the `<Route>`s and the navigation from that list, so **a page is added in one place**.

The pages, by group, with the config field that makes each available:

- **Work** — Chat (`end`), Sessions, Kanban (`kanbanStoreBasePath`), Board settings (routed, not listed), Card (`/:cardId`, routed, not listed), Email tickets (`kanbanStoreBasePath` and `mailBasePath`; each email ticket beside the email its `source_entity_ref` names), Orchestrator (`producerBasePath`).
- **Agents** — Instances, Agents, Files, Skills (`skillStoreBasePath`), Tools (`toolStoreBasePath`), Bundles (`bundleStoreBasePath`), Hooks, Inbound rules (`multichatBasePath`).
- **Access** — Principals (`principalStoreBasePath`), Grants (`grantStoreBasePath`), Permissions (`permissionStoreBasePath`), Auth.
- **System** — Settings, Usage, Effective config, Service inventory (`showServiceInventory`), Conformance (`showConformance`).

A page that is not available is **still routed**, so a stale link lands on a page that says what is missing rather than on nothing; it is only left out of the navigation. `PAGE_GROUPS` is the group order: Work, Agents, Access, System, Personal. Personal holds no page of this library's own — it is there for the host's pages.

## The two-row navigation and the host's slots

The navigation is two rows: `nav.bridge-nav-groups` holds the groups, `nav.bridge-nav-pages` the listed pages of the group the current path belongs to. `groupForPath(pathname, routes, hostPages)` picks that group by the **longest route that is a prefix of the path**, listed or not, so a sub-page such as a card lights up Work with no tab pointing at it. `navEntriesFor(config, flags, hostPages)` returns the entries: this library's listed and available pages in registry order, then the host's.

The group row sits in one `<header class="bridge-shell-bar">` with two host slots — **`<Bridge navStart navEnd>`**, the host's brand before the groups and its own controls after them — so **a host draws no header of its own**. **`<Bridge hostPages>`** takes the host's pages (`path`, `label`, `group`, `element`, optional `end`), routes them beside this library's and lists them in the same two rows, so a host has one navigation rather than two bars.

## Every setting is a SettingsSection

`src/components/settings/SettingsSection.tsx` is the one frame for a stored setting, exported from the package index. It draws a **scope badge** — `SettingsScope` is `global` | `harness` | `instance` | `board` | `principal` | `session`, labelled by `SETTINGS_SCOPE_LABEL` — the service and record that store the value (`storedBy`), a one-line `precedence` note, a per-section save, and the store's refusal **verbatim** (`SaveResult` is `{ok:true}` or `{ok:false, error}`; `useSectionSave` and `saveResultOf` wrap a write).

A narrower scope overrides a wider one: session over board over instance over harness over global. `SETTINGS_SCOPE_INDEX` says where each scope is edited and opens the Settings page, so a person looking for a per-board setting is sent to the board settings page instead of hunting. The kanban board settings page uses the same frame, section by section. A new setting goes in a `SettingsSection` on the page of the thing it applies to — not in a form of its own.

**A service's own configuration is not one of those: it is drawn, not written.** `/service-settings` (System group, `BridgeServiceSettings`) asks every backend the host proxies for `GET {base}/settings` — llm-bridge's `msg.ServiceSettings`, served by its `servicesettings.Handler` — and draws whatever answers: each setting with its environment variable, the value in force, and whether the environment, the service's stored record or a built-in default decided it. A behaviour setting the service stores gets a Change button (`PUT {base}/settings/{key}`, the refusal verbatim, the page redrawn from the service's answer); wiring, paths and secrets are read-only, and a secret shows only `set` or `not set` because the service never sends its value. A backend that answers anything else is listed as *does not describe its settings* — that list is what is left to convert. The page hardcodes no setting of any service; `src/serviceSettings.ts` holds its pure rules (which base paths to ask, grouping by the kinds the service served), tested. To make a service appear, give it a `/settings` route; nothing changes here.

## The Files page and the prompt source

`BridgeFiles` (`/files`) lists every file agent-store's scan tracks, and carries `PromptSourcePanel` (`src/components/PromptSourcePanel.tsx`) above it: the prompt collections, their sections, the files they render to, the drifts waiting to be carried back, and each harness's delivery. It reads `{basePath}/prompt-collections` and `{basePath}/prompt-delivery-options`.

**A file that a collection renders is read-only in the file list.** The panel hands the page its collections through `onViews`, `renderedOutputsByPath` turns them into a lookup by path, and a file found there is drawn with a `rendered from …` tag, its content in a `<pre>` rather than a textarea, and an **Open its sections** button that scrolls the panel to that collection (`openCollection`, with a `nonce` so asking twice counts). The note beside it says the file is changed in its sections, and that an edit made to the file itself is still picked up by the next scan.

`src/promptSource.ts` holds the wire types and the pure rules — `promptOutputState`, `collectionNeedsRender`, `groupSections`, `filterSectionGroups`, `describeDriftOperation`, `sectionWriteBody`, `renderedOutputsByPath`, `collectionsForTabs`. **Nothing there names a prompt file or a harness**: file names and delivery kinds come from `GET /prompt-delivery-options` and harness ids from `GET /prompt-harness-deliveries`, because a copy here would go stale the day a harness is added.

## Pure form-to-wire rules live in their own modules

**The rule that turns a form into a request body, or a store's answer into what the page shows, goes in a plain module under `src/`, not in the component** — because `npm test` covers `test/**/*.test.ts` and nothing renders a component there. Put the logic in the module, keep the component to rendering and fetching, and the rule gets a test.

The ones that exist: `bundleDraft.ts`, `hookDraft.ts`, `inboundRuleDraft.ts`, `kanbanBoardSettings.ts`, `kanbanTagRules.ts`, `messageTriggers.ts`, `effectiveConfigQuery.ts` (the effective-config dry run whose inputs live in the URL), `promptSource.ts`, `grantResources.ts`, `principalAvailability.ts`, `sessionSummaryPages.ts`, `toolPayloadPreview.ts`, `agentDispatch.ts`, `servicesClient.ts` and `kanbanStoreClient.ts`. `test/pages.test.ts` covers the registry itself — `navEntriesFor` and `groupForPath` — and `test/settingsSection.test.ts` the save frame.

## Generated store types, never hand copies

**Every store wire type comes from that store's own generated package**, all `file:` links to the store's main clone: `@kayushkin/kanban-store-types`, `noteboard-types`, `principal-store-types`, `grant-store-types`, `bundle-store-types`, `tool-store-types`, `repo-store-types`, `multichat-types` and `llm-bridge-types`, plus `@kayushkin/chat-core` itself. Do not restate a store's record as a local interface; if a field is missing, fix the Go struct and re-run that repo's `./generate-ts.sh`.

A vocabulary the store serves is **derived from the record field**, not written out as a union: `GrantResourceType = Grant['resource_type']`, `PrincipalKind` the same way.

Two types are still hand-written, each with the reason in its file: `src/types-mailstack.ts` (`MailMessage`, deliberately partial — `body_html` is left out so no caller here can render an attacker-controlled body) and `src/types-multichat.ts` (multichat's unified contact list, which its router assembles from unnamed types, so tygo has nothing to render).

Because each package is consumed through the store's main clone, **a store whose `ts/package.json` is missing breaks `tsc` here, loudly** — check the sibling repo before blaming this one.

# Access and operations

## What a host must proxy, and what it can switch off

The host passes a `fetch` that carries its own credentials and a base path per backend; `src/context.ts` is the list. `basePath` is llm-bridge-server and is always needed. The rest gate the pages named in the registry: `skillStoreBasePath`, `toolStoreBasePath`, `permissionStoreBasePath`, `kanbanStoreBasePath`, `principalStoreBasePath`, `grantStoreBasePath`, `bundleStoreBasePath`, `producerBasePath`, `multichatBasePath`, plus `repoStoreBasePath`, `noteboardBasePath`, `usageStoreBasePath`, `mailBasePath` and `bridgeAdapterBasePath` used inside pages. Seven more are read only by `/service-settings`: `schedulerBasePath`, `logStoreBasePath`, `jobStoreBasePath`, `quoteStoreBasePath`, `predictionStoreBasePath`, `eventStoreBasePath` and `authStoreBasePath`, and `hostBasePath` for the host's own settings (dash serves them at `/api/dash/settings`). An empty base path hides its page from the navigation and its panels from the pages that would use it.

Two switches are the host's, not a store's: `showConformance` and `showServiceInventory` (`ShellFlags`). **Service inventory reads `GET /services` on `basePath`**, the bridge server itself, so no store path gates it; a host whose server lacks the route turns the tab off instead.

# Working in this repo

## Build, packaging and how a change goes live

`npm run build` is plain `tsc` plus `node scripts/copy-css.mjs`, which copies every `.css` under `src/` into `dist/` at the same relative path — `tsc` emits no CSS, and without the copy a component's relative stylesheet import resolves to a file that is not there in the consumer's bundler. The package is ESM-only and ships `dist/`, `styles.css` (component styles, which only consume theme variables) and `theme.css` (an optional default theme; a host with its own palette skips it).

**`dist/` is not committed** — it is in `.gitignore`, `prepare` builds it on `npm install`, and every host's deploy rebuilds every linked library before bundling. **There is no deploy here.** A change goes live by deploying **dash**, whose `deploy.sh` runs `scripts/build-linked-libraries.mjs` and then `npm run build`. `standalone/` is a Vite launcher for local work (`npm start`), and its output is ignored too.

## Tests, the render check and the browser canaries

`npm test` is vitest over `test/**/*.test.ts` in the `node` environment. `vitest.config.ts` sets `resolve: { dedupe: ['react', 'react-dom'] }`, and that is load-bearing: `@kayushkin/chat-core` is a `file:` link with its own `node_modules`, so without it a context chat-core creates is built by *its* copy of React and read by ours — `useContext` on a null dispatcher. The hosts' Vite configs carry the same rule.

`npm run check` is the older render check: esbuild bundles `scripts/render-check.mjs` (which is why it can import `.ts`/`.tsx` from `src` directly) and node runs it, asserting on markup from `react-dom/server`. It proves what a component renders for a given input, not that the app wires that input up.

Three live browser canaries prove the wiring `tsc` cannot: `scripts/kanban-signal-canary.mjs` (signals in the card drawer, and that clicking an action posts the right verb), `scripts/sticky-bottom-canary.mjs` (the bottom pin across a session switch) and `scripts/timeline-window-canary.mjs`. They run against the standalone dev server or against dash with a token.

## Pruning orphaned CSS

`node scripts/prune-orphaned-css.mjs` reports every rule in `styles.css` whose classes nothing live references; `--write` rewrites the file. "Live" is this package's `src/`, `scripts/` and `test/`, dash's `src/` and `e2e/`, and chat-core's `src/`.

It parses the stylesheet with postcss rather than grepping, and that is the point: a class counts as referenced if its exact name appears, **or** if it begins with a prefix some template literal builds — the `bc-foo-${state}` sites would otherwise lose their styling silently. A rule with several selectors keeps the ones that survive; a rule with none goes, together with the comment that introduced it.

## Traps

- **Navigation tabs must stay `draggable={false}`.** A link is draggable by default. A tab pressed while the mouse moves starts a link drag, and a tab removed mid-drag — choosing a group replaces the second row — never gets its `dragend`, which on Chrome for Windows leaves the page taking no clicks while its timers still run. Both rows set `draggable={false}` in `BridgeLayout.tsx` and `-webkit-user-drag: none` plus `user-select: none` on `.bridge-tab`. Held by dash's `e2e/nav-tabs-are-not-draggable.spec.ts`.
- **The service inventory is not at `/services`.** dash's own Topology page owns that path and matches before the bridge's splat, which is how the first cut of that tab shipped unreachable.
- **The Sessions page shares chat-core's filter.** It reads chat-core's session store and its `FilterState` through `useFilters` and `useSessionList`, so filtering there filters the chat sidebar too, by design. Its dropdowns are single-select over multi-select axes.
- **A write must check `res.ok`.** `serverPrefsBackend.save` in `src/bridgePrefsStore.ts` throws on a non-OK `PUT`; a form that ignores the status reports a refusal as a success.
- **Two stylesheets, one theme.** `styles.css` defines no theme variable; a host either imports `theme.css` or sets the same variables at `:root`.
