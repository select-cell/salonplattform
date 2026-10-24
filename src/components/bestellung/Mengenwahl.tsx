import { MENGE_MAX } from '../../lib/bestellung'

// Plus und Minus als eigene Zeichen, damit die gemeinsame Icon-Datei der Plattform unberührt bleibt
const zeichen = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
}

const Minus = () => (
  <svg {...zeichen}>
    <path d="M5 12h14" />
  </svg>
)

const Plus = () => (
  <svg {...zeichen}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
)

/** Minus, Menge, Plus für einen Artikel (0 bis MENGE_MAX) */
export function Mengenwahl({
  name,
  menge,
  onAendern,
}: {
  name: string
  menge: number
  onAendern: (schritt: number) => void
}) {
  return (
    <div className="menge" role="group" aria-label={name}>
      <button
        type="button"
        className="menge__btn"
        onClick={() => onAendern(-1)}
        disabled={menge <= 0}
        aria-label={`${name}: eine weniger`}
      >
        <Minus />
      </button>
      <span className="menge__zahl" aria-live="polite">
        {menge}
      </span>
      <button
        type="button"
        className="menge__btn"
        onClick={() => onAendern(1)}
        disabled={menge >= MENGE_MAX}
        aria-label={`${name}: eine mehr`}
      >
        <Plus />
      </button>
    </div>
  )
}
