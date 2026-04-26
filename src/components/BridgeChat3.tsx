import { BridgeChat } from './BridgeChat'

/**
 * Visual variant: editorial/terminal. Shares all logic with BridgeChat — only
 * adds a skin wrapper class so styles.css can layer overrides via `.bc-skin-3 …`.
 */
export function BridgeChat3() {
  return (
    <div className="bc-skin bc-skin-3">
      <BridgeChat />
    </div>
  )
}
