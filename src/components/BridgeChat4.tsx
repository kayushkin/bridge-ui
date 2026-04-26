import { BridgeChat } from './BridgeChat'

/**
 * Visual variant: soft glassmorphic. Shares all logic with BridgeChat — only
 * adds a skin wrapper class so styles.css can layer overrides via `.bc-skin-4 …`.
 */
export function BridgeChat4() {
  return (
    <div className="bc-skin bc-skin-4">
      <BridgeChat />
    </div>
  )
}
