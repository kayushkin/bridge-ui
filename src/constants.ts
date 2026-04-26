export const HARNESS_LABEL: Record<string, string> = {
  claude_code: 'Claude Code',
  codex: 'Codex',
  openclaw: 'OpenClaw',
  inber: 'Inber',
  hermes: 'Hermes',
  aider: 'Aider',
  goose: 'Goose',
  autohand: 'Autohand',
  jig: 'Jig',
  dexto: 'Dexto',
  commander: 'Commander',
  nanoclaw: 'NanoClaw',
  cline: 'Cline',
  roo_code: 'Roo Code',
  kilo_code: 'Kilo Code',
}

export const HARNESS_EMOJI: Record<string, string> = {
  claude_code: '\u{1F4BB}',
  codex: '\u{1F4D6}',
  openclaw: '\u{1F980}',
  inber: '\u{1F33F}',
  hermes: '\u{1F4E8}',
  aider: '\u{1F6E0}\u{FE0F}',
  goose: '\u{1FABF}',
  autohand: '\u{1F916}',
  jig: '\u{1F9E9}',
  dexto: '\u{1F3AF}',
  commander: '\u{1F396}\u{FE0F}',
  nanoclaw: '\u{1F52C}',
  cline: '\u{1F4DD}',
  roo_code: '\u{1F998}',
  kilo_code: '\u{26A1}',
}

export const TRANSPORT_LABEL: Record<string, string> = {
  local: 'Local',
  ssh: 'SSH',
}

// Per-harness accent color used to tint the chat header. Falls back to the
// host theme's --accent when a harness has no entry. Hex sRGB so the UI can
// pass it straight into a CSS custom property and color-mix() it down.
export const HARNESS_TINT: Record<string, string> = {
  claude_code: '#d97757', // anthropic orange
  codex: '#10a37f',       // openai green
  openclaw: '#dc2626',    // crab red
  inber: '#22c55e',       // leaf green
  hermes: '#eab308',      // mailbox gold
  jig: '#a855f7',         // puzzle violet
  nanoclaw: '#06b6d4',    // microscope cyan
  aider: '#f97316',       // tools orange
  goose: '#84cc16',       // lime
  autohand: '#94a3b8',    // robot slate
  dexto: '#ec4899',       // dart pink
  commander: '#64748b',   // medal slate
  cline: '#3b82f6',       // pencil blue
  roo_code: '#fb7185',    // kangaroo rose
  kilo_code: '#f59e0b',   // bolt amber
}
