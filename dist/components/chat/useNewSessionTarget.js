import { useCallback, useMemo } from 'react';
import { useBridgeConfig } from '../../context';
import { useBridgeInstances } from '../../useBridgeInstances';
import { useBridgePrefs } from '../../useBridgePrefs';
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
export function useNewSessionTarget() {
    const { fetch: bridgeFetch, basePath } = useBridgeConfig();
    const { prefs, loaded, setLastInstanceId, getDefaults, setHarnessDefaults } = useBridgePrefs({
        fetch: bridgeFetch,
        endpoint: `${basePath}/bridge-prefs`,
    });
    const { instances, instanceMap, loading } = useBridgeInstances();
    const optsFor = useCallback((instanceId, harness) => {
        const defaults = getDefaults(harness);
        // Absent keys, not undefined ones, and `!== undefined` rather than truthiness for
        // the two whose falsy values are real instructions: `max_budget: 0` means NO
        // ceiling (not "halt now") and an empty `disabled_tools` means "disable nothing"
        // (not "inherit"). chat-core omits absent keys from the config body, so an unset
        // default leaves the server deciding — which is what unset means.
        //
        // `HarnessDefaults.permission_mode` is deliberately NOT carried: it is not part
        // of `POST /sessions/{id}/config` on any surface. The original chat does not
        // apply it here either — permission mode travels via the global
        // `/bridge/permission-mode` pref and the per-session `harnessConfig`, which
        // chat's own permission controls already write.
        return {
            instanceId,
            harness,
            ...(defaults.model ? { model: defaults.model } : {}),
            ...(defaults.effort ? { effort: defaults.effort } : {}),
            ...(defaults.max_budget !== undefined ? { maxBudget: defaults.max_budget } : {}),
            ...(defaults.disabled_tools !== undefined
                ? { disabledTools: defaults.disabled_tools }
                : {}),
        };
    }, [getDefaults]);
    const opts = useMemo(() => {
        const { last_instance_id, last_harness, last_session } = prefs;
        if (last_instance_id) {
            const inst = instanceMap.get(last_instance_id);
            if (inst?.enabled)
                return optsFor(inst.id, inst.harness_type);
        }
        if (last_harness) {
            const ofHarness = instances.filter((i) => i.enabled && i.harness_type === last_harness);
            const used = ofHarness.find((i) => last_session && i.id in last_session);
            const inst = used ?? ofHarness[0];
            if (inst)
                return optsFor(inst.id, inst.harness_type);
        }
        return undefined;
    }, [prefs, instances, instanceMap, optsFor]);
    const remember = useCallback((instanceId) => setLastInstanceId(instanceId), [setLastInstanceId]);
    const rememberDefaults = useCallback((harness, override) => {
        // No harness, nothing to key the record by. Writing under '' would file the pick
        // against a harness that does not exist and it would never be read back.
        if (!harness)
            return;
        setHarnessDefaults(harness, { ...getDefaults(harness), ...override });
    }, [getDefaults, setHarnessDefaults]);
    return useMemo(() => ({ opts, ready: loaded && !loading, remember, optsFor, rememberDefaults }), [opts, loaded, loading, remember, optsFor, rememberDefaults]);
}
//# sourceMappingURL=useNewSessionTarget.js.map