import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { holeAbgabeStatus, holeUeberfaellige } from '../lib/api'
import type { Ueberfaellig } from '../lib/auswertung'
import { aktuellerMonat, fristFuer, monatLabel, tagLabel, zeitpunktLabel } from '../lib/monat'
import { useDaten } from '../lib/useDaten'
import { Icon } from './Icon'

/** Abgabe-Status des laufenden Monats und Reminder-Popup für Verantwortliche und Admins (Plan §6). */
export function StatusKarte() {
  const status = useDaten(holeAbgabeStatus, [])
  const ueberfaellig = useDaten(holeUeberfaellige, [])
  const monat = aktuellerMonat()
  const frist = fristFuer(monat)

  return (
    <>
      <section className="karte" aria-labelledby="status-titel">
        <div className="karte__kopf">
          <div>
            <p className="overline">Abgabe-Status</p>
            <h2 id="status-titel" style={{ marginTop: 6 }}>
              {monatLabel(monat)}
            </h2>
            <p className="klein muted">Frist: {frist.label}</p>
          </div>
          {status.daten && status.daten.length > 0 && (
            <span className="badge badge--akzent">
              {status.daten.filter((s) => s.abgegeben).length} von {status.daten.length} abgegeben
            </span>
          )}
        </div>

        {status.laedt && !status.daten && <p className="muted" style={{ marginTop: 10 }}>Wird geladen …</p>}
        {status.fehler && <p className="hinweis hinweis--fehler" style={{ marginTop: 12 }}>{status.fehler}</p>}
        {status.daten && status.daten.length === 0 && (
          <p className="muted" style={{ marginTop: 10 }}>Es gibt noch keine Teilnehmerinnen an der Teamumfrage.</p>
        )}
        {status.daten && status.daten.length > 0 && (
          <ul className="statuszeilen">
            {status.daten.map((s) => (
              <li key={s.person_id} className="statuszeile">
                <span>{s.name}</span>
                {s.abgegeben ? (
                  <span className="badge badge--gruen">
                    <Icon name="haken" groesse={14} /> Abgegeben{s.abgegeben_am ? ` am ${zeitpunktLabel(s.abgegeben_am)}` : ''}
                  </span>
                ) : (
                  <span className="badge badge--gelb">Noch offen</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {ueberfaellig.daten && ueberfaellig.daten.length > 0 && (
          <div className="stack-s" style={{ marginTop: 16 }}>
            <h3 className="abschnitt-titel">Überfällig</h3>
            <ul className="statuszeilen">
              {ueberfaellig.daten.map((u) => (
                <li key={`${u.person_id}-${u.monat_key}`} className="statuszeile statuszeile--rot">
                  <span>
                    {u.name} · {monatLabel(u.monat_key)}
                  </span>
                  <span className="badge badge--rot">{tageText(u.tage_ueberfaellig)} (Frist {tagLabel(u.frist)})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {ueberfaellig.daten && ueberfaellig.daten.length > 0 && <ReminderPopup liste={ueberfaellig.daten} />}
    </>
  )
}

const tageText = (tage: number) => (tage === 1 ? '1 Tag überfällig' : `${tage} Tage überfällig`)

/**
 * Popup beim Öffnen von /app, solange etwas überfällig ist. Es lässt sich wegklicken und kommt
 * beim nächsten Besuch wieder (Plan §6).
 */
function ReminderPopup({ liste }: { liste: Ueberfaellig[] }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [offen, setOffen] = useState(true)

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (offen && !d.open) d.showModal()
    if (!offen && d.open) d.close()
  }, [offen])

  return (
    <dialog ref={dialog} className="popup" aria-labelledby="popup-titel" onClose={() => setOffen(false)}>
      <div className="popup__kopf">
        <div className="merkmal__icon">
          <Icon name="achtung" />
        </div>
        <h2 id="popup-titel" style={{ fontSize: '1.5rem' }}>
          Umfragen noch offen
        </h2>
      </div>
      <ul className="popup__liste">
        {liste.map((u) => (
          <li key={`${u.person_id}-${u.monat_key}`}>
            <strong>{u.name}</strong> hat die Umfrage für {monatName(u.monat_key)} noch nicht abgegeben ({tageText(u.tage_ueberfaellig)}).
          </li>
        ))}
      </ul>
      <div className="popup__aktionen">
        <button type="button" className="btn" onClick={() => setOffen(false)} autoFocus>
          Verstanden
        </button>
        <Link to="/app/mitglieder" className="btn btn--ghost" onClick={() => setOffen(false)}>
          Zu den Mitarbeiterinnen
        </Link>
      </div>
    </dialog>
  )
}

const monatName = (key: string) => monatLabel(key).split(' ')[0]
