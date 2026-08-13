export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}

export function formatCost(n: number): string {
  // Sub-cent amounts need the extra digits to say anything at all. Exactly
  // zero does not: it is not a small quantity, it is none, and "$0.0000"
  // reads as a measurement precise to four places rather than as nothing
  // spent.
  if (n > 0 && n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const rem = Math.round(s % 60)
  return `${m}m${rem}s`
}

// formatAgeCompact renders an elapsed time short enough to sit in a badge:
// "12m", "5h", "23d". timeAgo below says the same thing in prose, which is
// right in a sentence and too wide in a corner.
//
// Returns null rather than a placeholder when the timestamp cannot be read, so
// the caller renders nothing at all. A badge reading "NaN" or "0m" would be a
// measurement the data never supported.
export function formatAgeCompact(iso: string): string | null {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return null

  const ms = Date.now() - then
  // A future timestamp means clock skew between this box and whatever wrote the
  // row. Counting up from it would print a growing negative age.
  if (ms < 0) return 'now'

  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}
