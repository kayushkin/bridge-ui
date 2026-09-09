import type { NewSessionOpts } from '@kayushkin/chat-core';
import type { HarnessDefaults } from '../../types';
/** A fully-resolved new-chat target: where the session is created, plus the settings it
 *  should come up with. The two halves reach the server on two different calls —
 *  `POST /sessions` takes the target, `POST /sessions/{id}/config` takes the rest — so
 *  chat-core keeps them in one record and splits them at the wire. */
export type NewChatOpts = NewSessionOpts & {
    instanceId: string;
    harness: string;
};
/** Where a new chat should be started, resolved from the user's recorded prefs. */
export interface NewSessionTarget {
    /** Options for chat-core's `newSession(opts)`, or undefined when nothing is
     *  recorded. Undefined is a real answer: it opens a chat with no target rather
     *  than inventing one the user never chose. */
    opts: NewChatOpts | undefined;
    /** True once BOTH prefs and the instance list have resolved. A decision taken
     *  before this flag flips reads an empty prefs snapshot and picks nothing. */
    ready: boolean;
    /** Record a deliberate instance pick, so the next bare "+ New" lands on it. */
    remember: (instanceId: string) => void;
    /** The same resolution for an instance the user picked from the menu rather than one
     *  read out of prefs. The picker knows which instance; only this hook knows the saved
     *  defaults, so the merge lives here and not in the menu — otherwise the "+ New"
     *  button and the picker would each carry their own copy of the rule and could drift. */
    optsFor: (instanceId: string, harness: string) => NewChatOpts;
    /** Persist a pick the user just made in the controls bar as that harness's saved
     *  default, so the next new chat comes up on it.
     *
     *  ⚠️ This MERGES, and the merge is the whole point. `PUT /bridge-prefs` and
     *  `useBridgePrefs.updatePrefs` both do `Defaults[harness] = value` — a whole-record
     *  replace — so writing a bare `{ model }` deletes that harness's saved `max_budget`
     *  and `disabled_tools`. Picking a model would silently uncap the spend ceiling and
     *  re-enable every tool the user had turned off. bridge-ui had exactly this bug at
     *  both of its write sites (fixed in `eb0cc05`); this is the fixed shape.
     *
     *  Clearing a field is still expressible — an empty `model` is written as an empty
     *  model, which every reader here treats as "no default" — and the Settings editor
     *  remains the place that writes the whole record deliberately. */
    rememberDefaults: (harness: string, override: HarnessDefaults) => void;
}
/** The instance and harness a new chat targets on this page — the "+ New" button and
 *  the cold-load bootstrap both ask this, so they cannot disagree.
 *
 *  The ladder is bridge-ui's (`BridgeChat.tsx`), and it resolves from RECORDED prefs
 *  only, never a first-enabled guess:
 *    1. the exact recorded last instance (`last_instance_id`), if it is still enabled;
 *    2. else an enabled instance of the recorded last harness (`last_harness`),
 *       preferring one that has actually been used (it has a `last_session` entry), so
 *       the harness shown is the user's real last one rather than an invented pick;
 *    3. else undefined — nothing is recorded, so nothing is targeted.
 *
 *  Onto whichever instance that ladder finds, the harness's saved defaults are merged
 *  (`prefs.defaults[harness]` — the record the Settings page writes and the original
 *  chat applies at `Workspace.tsx`). Without them a new chat came up on the harness's
 *  own fallback model however many times the user had set a default, and its spend
 *  ceiling and disabled-tool list were dropped outright.
 *
 *  Prefs are the same server-side record the original chat at `/` reads and writes
 *  (`GET/PUT {basePath}/bridge-prefs`), so a choice made on either surface is honoured
 *  by the other. `basePath` comes from the BridgeProvider context rather than a literal
 *  so both pages resolve one endpoint. */
export declare function useNewSessionTarget(): NewSessionTarget;
//# sourceMappingURL=useNewSessionTarget.d.ts.map