import { BridgeChat } from './BridgeChat'

/**
 * Visual variant: refined polish. Shares all logic with BridgeChat — only adds
 * a skin wrapper class so styles.css can layer overrides via `.bc-skin-2 …`.
 */
export function BridgeChat2() {
  return (
    <div className="bc-skin bc-skin-2">
      <BridgeChat />
    </div>
  )
}
