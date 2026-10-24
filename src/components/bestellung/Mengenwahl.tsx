import { MENGE_MAX } from '../../lib/bestellung'
import { Icon } from '../Icon'

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
        <Icon name="minus" groesse={20} />
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
        <Icon name="plus" groesse={20} />
      </button>
    </div>
  )
}
