import { useState } from 'react'
import { Icon } from '../Icon'
import type { Entwurf, UmfrageInhalt, Verhalten } from '../../lib/umfrage'
import { SELBSTBILD_LABELS, bewertete, brauchtVideo, notenSchluessel } from '../../lib/umfrage'
import { LockedInDialog } from './LockedInDialog'
import { Skala } from './Skala'
import { VideoSperre } from './VideoSperre'

interface Props {
  verhalten: Verhalten
  nummer: number
  gesamt: number
  inhalt: UmfrageInhalt
  entwurf: Entwurf
  /** „Locked In“: Note und Kommentar sind bestätigt */
  onLockedIn: (schluessel: string, note: number, kommentar: string) => void
  /** Alle Personen dieses Verhaltens sind bestätigt: weiter zum nächsten Verhalten */
  onFertig: () => void
  onVideoGesehen: () => void
}

export function VerhaltenSchritt({
  verhalten,
  nummer,
  gesamt,
  inhalt,
  entwurf,
  onLockedIn,
  onFertig,
  onVideoGesehen,
}: Props) {
  const gesperrt = brauchtVideo(verhalten.video_url) && !entwurf.videos[`v${verhalten.nr}`]
  const stufen = new Map(verhalten.kriterien.map((k) => [k.stufe, k]))

  // Gewählte, aber noch nicht bestätigte Note: öffnet das Popup
  const [auswahl, setAuswahl] = useState<{ personId: string; note: number } | null>(null)
  const personen = bewertete(inhalt)

  const lockedIn = (kommentar: string) => {
    if (!auswahl) return
    const schluessel = notenSchluessel(verhalten.nr, auswahl.personId)
    onLockedIn(schluessel, auswahl.note, kommentar)
    setAuswahl(null)
    // Weiter zur nächsten noch offenen Person, nach der letzten zum nächsten Verhalten
    const naechste = personen.find(
      (p) => p.id !== auswahl.personId && !entwurf.noten[notenSchluessel(verhalten.nr, p.id)],
    )
    window.setTimeout(() => {
      if (!naechste) return onFertig()
      const feld = document.getElementById(`bewertung-${verhalten.nr}-${naechste.id}`)
      feld?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      feld?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
    }, 0)
  }

  const beschreibung = (note: number): string | null => {
    const k = stufen.get(note)
    if (!k) return null
    return [k.bezeichnung, k.prozent].filter(Boolean).join(' · ') || null
  }

  return (
    <article className="stack" aria-labelledby="schritt-titel">
      <header className="stack-s">
        <div className="umfrage__badges">
          {verhalten.grundpfeiler && <span className="badge">{verhalten.grundpfeiler}</span>}
          {verhalten.saeule && <span className="badge badge--akzent">{verhalten.saeule}</span>}
        </div>
        <h2 id="schritt-titel" className="umfrage__titel">
          {verhalten.titel}
        </h2>
        <p className="klein muted">
          Verhalten {nummer} von {gesamt}
        </p>
      </header>

      <VideoSperre
        url={verhalten.video_url}
        titel={verhalten.titel}
        gesehen={!!entwurf.videos[`v${verhalten.nr}`]}
        onGesehen={onVideoGesehen}
      />

      {gesperrt ? (
        <p className="hinweis">
          <span>Sobald das Video zu Ende ist, kannst du bewerten.</span>
        </p>
      ) : (
        <div className="stack">
          {personen.map((person) => {
            const schluessel = notenSchluessel(verhalten.nr, person.id)
            const note = entwurf.noten[schluessel]
            const kommentar = (entwurf.kommentare[schluessel] ?? '').trim()
            return (
              <Skala
                key={schluessel}
                id={`bewertung-${verhalten.nr}-${person.id}`}
                name={`note-${schluessel}`}
                variante={person.selbst ? 'selbst' : 'fremd'}
                legende={
                  <>
                    <span className="bewertung__name">{person.selbst ? 'Du selbst' : person.name}</span>
                    <span className="bewertung__art">{person.selbst ? 'Selbstbild' : 'Fremdbild'}</span>
                  </>
                }
                wert={note}
                gesperrt={!!note}
                onChange={(n) => setAuswahl({ personId: person.id, note: n })}
                beschreibung={beschreibung}
                feldLabels={person.selbst ? SELBSTBILD_LABELS : undefined}
              >
                {note && (
                  <p className="bewertung__gesperrt">
                    <span className="badge badge--gruen">
                      <Icon name="haken" groesse={14} /> Locked In
                    </span>
                    {kommentar && <span className="bewertung__kommentar">{kommentar}</span>}
                  </p>
                )}
              </Skala>
            )
          })}
        </div>
      )}

      {auswahl && (
        <LockedInDialog
          key={`${verhalten.nr}-${auswahl.personId}`}
          verhaltenNr={verhalten.nr}
          verhaltenTitel={verhalten.titel}
          personName={personen.find((p) => p.id === auswahl.personId)?.name ?? ''}
          selbst={personen.find((p) => p.id === auswahl.personId)?.selbst ?? false}
          note={auswahl.note}
          kriterium={stufen.get(auswahl.note) ?? null}
          kommentar={entwurf.kommentare[notenSchluessel(verhalten.nr, auswahl.personId)] ?? ''}
          onLockedIn={lockedIn}
          onAbbrechen={() => setAuswahl(null)}
        />
      )}
    </article>
  )
}
