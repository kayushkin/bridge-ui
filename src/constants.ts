export const TRANSPORT_LABEL: Record<string, string> = {
  local: 'Local',
  ssh: 'SSH',
}

// Note: harness label/emoji/image/tint live on the server-side HarnessInfo
// (delivered via /harnesses). UIs read those fields directly — no client-side
// fallback maps. If a harness shows up unlabeled/uncolored, the fix is to
// register it server-side, not patch around it here.
