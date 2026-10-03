import type { ReactNode } from 'react'
import { Icon } from '../Icon'
import { Ladeanzeige } from '../Ladeanzeige'
import type { Einordnung } from '../../lib/auswertung'
import { monatName } from '../../lib/auswertung'

/** Zeigt Laden, Fehler oder den Inhalt. */
export function DatenZustand({
  laedt,
  fehler,
  onNeu,
  children,
}: {
  laedt: boolean
  fehler: string | null
  onNeu: () => void
  children: ReactNode
}) {
  if (laedt) return <Ladeanzeige kompakt text="Wird geladen …" />
  if (fehler) {
    return (
      <div className="karte stack" role="alert">
        <p className="hinweis hinweis--fehler">
          <Icon name="achtung" groesse={18} />
          <span>{fehler}</span>
        </p>
        <button type="button" className="btn" onClick={onNeu} style={{ justifySelf: 'start' }}>
          Erneut versuchen
        </button>
      </div>
    )
  }
  return <>{children}</>
}

export function Leer({ titel, text }: { titel: string; text: string }) {
  return (
    <section className="karte ausw-leer">
      <div className="merkmal__icon">
        <Icon name="ergebnisse" />
      </div>
      <h2 style={{ fontSize: '1.4rem' }}>{titel}</h2>
      <p className="muted">{text}</p>
    </section>
  )
}

export function Monatswahl({
  monate,
  wert,
  onChange,
}: {
  monate: string[]
  wert: string
  onChange: (monat: string) => void
}) {
  return (
    <div className="feld ausw-monat">
      <label className="feld__label" htmlFor="monatswahl">
        Monat
      </label>
      <select id="monatswahl" className="feld__eingabe" value={wert} onChange={(e) => onChange(e.target.value)}>
        {monate.map((m) => (
          <option key={m} value={m}>
            {monatName(m)}
          </option>
        ))}
      </select>
    </div>
  )
}

export function Kennzahl({
  label,
  wert,
  zusatz,
  ton = 'neutral',
  farbe,
}: {
  label: string
  wert: string
  zusatz?: ReactNode
  ton?: Einordnung['farbe']
  farbe?: 'sb' | 'fb'
}) {
  return (
    <div className={`kennzahl kennzahl--${ton}${farbe ? ` kennzahl--${farbe}` : ''}`}>
      <span className="kennzahl__label">{label}</span>
      <span className="kennzahl__wert">{wert}</span>
      {zusatz && <span className="kennzahl__zusatz">{zusatz}</span>}
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  aktiv,
  onChange,
  label,
}: {
  tabs: { id: T; label: string }[]
  aktiv: T
  onChange: (id: T) => void
  label: string
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={aktiv === t.id}
          className={`tabs__tab${aktiv === t.id ? ' aktiv' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Abschnitt({ titel, kurz, children }: { titel: string; kurz?: string; children: ReactNode }) {
  return (
    <section className="karte stack" aria-label={titel}>
      <div>
        <h2 className="ausw-titel">{titel}</h2>
        {kurz && <p className="klein muted">{kurz}</p>}
      </div>
      {children}
    </section>
  )
}

export function EinordnungBadge({ e }: { e: Einordnung }) {
  const klasse = e.farbe === 'gruen' ? 'badge--gruen' : e.farbe === 'rot' ? 'badge--rot' : ''
  return <span className={`badge ${klasse}`}>{e.text}</span>
}
