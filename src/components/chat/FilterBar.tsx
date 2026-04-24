export function FilterBar({ types, hidden, onToggle }: {
  types: string[]
  hidden: Set<string>
  onToggle: (t: string) => void
}) {
  if (types.length === 0) return null
  return (
    <div className="bc-filter-bar">
      <span className="bc-filter-label">show:</span>
      {types.map(t => {
        const on = !hidden.has(t)
        return (
          <button
            key={t}
            type="button"
            className={`bc-filter-chip${on ? ' bc-filter-chip-on' : ''}`}
            onClick={() => onToggle(t)}
          >
            {t}
          </button>
        )
      })}
    </div>
  )
}
