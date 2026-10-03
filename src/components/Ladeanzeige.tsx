export function Ladeanzeige({ text = 'Einen Moment …' }: { text?: string }) {
  return (
    <div className="lade" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>{text}</p>
    </div>
  )
}
