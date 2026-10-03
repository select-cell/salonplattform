import type { Entwurf, Ritual, RitualFrage } from '../../lib/umfrage'
import { brauchtVideo, ritualSchluessel } from '../../lib/umfrage'
import { Skala } from './Skala'
import { VideoSperre } from './VideoSperre'

interface Props {
  ritual: Ritual
  entwurf: Entwurf
  onAntwort: (schluessel: string, antwort: string) => void
  onVideoGesehen: () => void
}

export function RitualSchritt({ ritual, entwurf, onAntwort, onVideoGesehen }: Props) {
  const gesperrt = brauchtVideo(ritual.video_url) && !entwurf.videos[`r${ritual.nr}`]

  return (
    <article className="stack" aria-labelledby="schritt-titel">
      <header className="stack-s">
        <span className="badge badge--gruen">Ritual</span>
        <h2 id="schritt-titel" className="umfrage__titel">
          {ritual.titel}
        </h2>
      </header>

      <VideoSperre
        url={ritual.video_url}
        titel={ritual.titel}
        gesehen={!!entwurf.videos[`r${ritual.nr}`]}
        onGesehen={onVideoGesehen}
      />

      {gesperrt ? (
        <p className="hinweis">
          <span>Sobald du das Video bis zum Ende gesehen hast, kannst du die Fragen beantworten.</span>
        </p>
      ) : (
        <div className="stack">
          {ritual.fragen.map((frage) => (
            <FrageFeld
              key={frage.nr}
              ritualNr={ritual.nr}
              frage={frage}
              wert={entwurf.ritual[ritualSchluessel(ritual.nr, frage.nr)] ?? ''}
              onChange={(antwort) => onAntwort(ritualSchluessel(ritual.nr, frage.nr), antwort)}
            />
          ))}
        </div>
      )}
    </article>
  )
}

function FrageFeld({
  ritualNr,
  frage,
  wert,
  onChange,
}: {
  ritualNr: number
  frage: RitualFrage
  wert: string
  onChange: (antwort: string) => void
}) {
  const id = `ritual-${ritualNr}-${frage.nr}`
  const zusatz = frage.pflicht ? '' : ' (freiwillig)'

  if (frage.typ === 'skala') {
    return (
      <Skala
        name={id}
        variante="neutral"
        legende={
          <span className="bewertung__frage">
            {frage.frage}
            <span className="muted">{zusatz}</span>
          </span>
        }
        wert={wert ? Number(wert) : undefined}
        onChange={(n) => onChange(String(n))}
        labels={frage.labels}
      />
    )
  }

  if (frage.typ === 'auswahl') {
    return (
      <fieldset className="bewertung bewertung--neutral">
        <legend className="bewertung__legende">
          <span className="bewertung__frage">
            {frage.frage}
            <span className="muted">{zusatz}</span>
          </span>
        </legend>
        <div className="auswahl">
          {(frage.optionen ?? []).map((option) => (
            <label key={option} className="auswahl__option">
              <input type="radio" name={id} value={option} checked={wert === option} onChange={() => onChange(option)} />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </fieldset>
    )
  }

  return (
    <div className="feld bewertung bewertung--neutral">
      <label className="feld__label" htmlFor={id}>
        {frage.frage}
        <span className="muted">{zusatz}</span>
      </label>
      <textarea
        id={id}
        className="feld__eingabe"
        rows={3}
        value={wert}
        onChange={(e) => onChange(e.target.value)}
        required={frage.pflicht}
      />
    </div>
  )
}
