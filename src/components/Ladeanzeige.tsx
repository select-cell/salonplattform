export function Ladeanzeige({ text = 'Einen Moment …', kompakt = false }: { text?: string; kompakt?: boolean }) {
  return (
    <div className={kompakt ? 'lade lade--kompakt' : 'lade'} role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>{text}</p>
    </div>
  )
}
