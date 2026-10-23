import { useEffect, useId, useRef, useState } from 'react'
import type { Kriterium } from '../../lib/umfrage'
import { KOMMENTAR_PFLICHT_AB, stufenName } from '../../lib/umfrage'
import { Icon } from '../Icon'

interface Props {
  verhaltenNr: number
  verhaltenTitel: string
  personName: string
  selbst: boolean
  note: number
  /** Beschreibung der gewählten Stufe; fehlt sie, zeigt das Popup nur die Note */
  kriterium: Kriterium | null
  kommentar: string
  /** „Locked In“: Note und Kommentar sind bestätigt */
  onLockedIn: (kommentar: string) => void
  /** Schließen ohne Bestätigung: es wird nichts gespeichert */
  onAbbrechen: () => void
}

/**
 * Popup zu einer gewählten Note: zeigt die Stufe vollständig an und verlangt „Locked In“.
 * Natives <dialog> mit showModal(): Fokus bleibt im Popup, Esc bricht ab.
 */
export function LockedInDialog({
  verhaltenNr,
  verhaltenTitel,
  personName,
  selbst,
  note,
  kriterium,
  kommentar,
  onLockedIn,
  onAbbrechen,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const lockedIn = useRef<HTMLButtonElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(kommentar)
  const titelId = useId()
  const pflicht = note >= KOMMENTAR_PFLICHT_AB
  const fehlt = pflicht && !text.trim()

  const abbrechenRef = useRef(onAbbrechen)
  useEffect(() => {
    abbrechenRef.current = onAbbrechen
  })

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (!d.open) d.showModal()
    // Bei Pflicht-Kommentar ins Textfeld, sonst direkt auf „Locked In“
    ;(pflicht ? textarea.current : lockedIn.current)?.focus()
    const bestaetigt = () => abbrechenRef.current()
    d.addEventListener('cancel', bestaetigt)
    return () => {
      d.removeEventListener('cancel', bestaetigt)
      if (d.open) d.close()
    }
  }, [pflicht])

  const stufe = [kriterium?.bezeichnung ? stufenName(kriterium.bezeichnung) : null, kriterium?.prozent].filter(Boolean).join(' · ')

  return (
    <dialog
      ref={dialog}
      className="lockin"
      aria-labelledby={titelId}
      onClick={(e) => {
        // Klick auf den abgedunkelten Hintergrund
        if (e.target === dialog.current) onAbbrechen()
      }}
    >
      <form
        method="dialog"
        className="lockin__innen stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!fehlt) onLockedIn(text.trim())
        }}
      >
        <header className="stack-s">
          <div className="umfrage__badges">
            <span className={`badge ${selbst ? 'badge--akzent' : 'badge--blau'}`}>
              {selbst ? 'Selbstbild · du selbst' : `Fremdbild · ${personName}`}
            </span>
            <span className="badge">Verhalten {verhaltenNr}</span>
          </div>
          <p className="klein muted lockin__verhalten">{verhaltenTitel}</p>
          <h2 id={titelId} className="lockin__titel">
            Bewertung {note}
            {stufe && <span className="lockin__stufe"> · {stufe}</span>}
          </h2>
        </header>

        {kriterium && (kriterium.leitsatz || kriterium.punkte.length > 0) && (
          <div className="lockin__kriterium stack-s">
            {kriterium.leitsatz && <p>{kriterium.leitsatz}</p>}
            {kriterium.punkte.length > 0 && (
              <ul className="platzhalter__liste">
                {kriterium.punkte.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="feld">
          <label className="feld__label" htmlFor={`lockin-kommentar-${verhaltenNr}`}>
            Kommentar <span className="muted">{pflicht ? `(Pflicht ab Bewertung ${KOMMENTAR_PFLICHT_AB})` : '(freiwillig)'}</span>
          </label>
          <textarea
            ref={textarea}
            id={`lockin-kommentar-${verhaltenNr}`}
            className="feld__eingabe"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            required={pflicht}
            aria-required={pflicht}
          />
        </div>

        <p className="klein muted">
          Mit „Locked In“ bestätigst du diese Bewertung. Danach lässt sich die Bewertung nicht mehr ändern.
        </p>

        <div className="lockin__aktionen">
          <button type="button" className="btn btn--ghost" onClick={onAbbrechen}>
            Abbrechen
          </button>
          <button ref={lockedIn} type="submit" className="btn" disabled={fehlt}>
            <Icon name="haken" groesse={18} /> Locked In
          </button>
        </div>
      </form>
    </dialog>
  )
}
