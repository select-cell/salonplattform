import type { ReactNode } from 'react'

interface Props {
  /** Gruppenname der Radio-Buttons, pro Frage eindeutig */
  name: string
  legende: ReactNode
  wert: number | undefined
  onChange: (note: number) => void
  /** Farbwelt: Selbstbild = Kupfer, Fremdbild = Blau (Plan §7.2) */
  variante?: 'selbst' | 'fremd' | 'neutral'
  /** Kurztext zur gewählten Note, z. B. die Bewertungsstufe */
  beschreibung?: (note: number) => string | null
  /** Beschriftung unter den Enden der Skala, falls vorhanden */
  labels?: (string | null)[] | null
  /** Beschriftung direkt unter jedem Feld (Selbstbild) */
  feldLabels?: readonly string[]
  children?: ReactNode
}

const NOTEN = [1, 2, 3, 4, 5] as const

/** Fünf Felder für die Noten 1 bis 5, als echte Radio-Buttons (Tastatur und Screenreader inklusive). */
export function Skala({ name, legende, wert, onChange, variante = 'neutral', beschreibung, labels, feldLabels, children }: Props) {
  const text = wert ? (beschreibung?.(wert) ?? labels?.[wert - 1] ?? null) : null

  return (
    <fieldset className={`bewertung bewertung--${variante}`}>
      <legend className="bewertung__legende">{legende}</legend>
      <div className="skala">
        {NOTEN.map((note) => (
          <label key={note} className="skala__feld">
            <input
              type="radio"
              className="nur-sr"
              name={name}
              value={note}
              checked={wert === note}
              onChange={() => onChange(note)}
            />
            <span aria-hidden="true">{note}</span>
            <span className="nur-sr">Note {note}</span>
            {feldLabels && <span className="skala__label">{feldLabels[note - 1]}</span>}
          </label>
        ))}
      </div>
      {text && <p className="bewertung__text">{text}</p>}
      {children}
    </fieldset>
  )
}
