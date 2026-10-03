import type { DashboardPerson, Schwellen } from '../../lib/auswertung'
import { mittel, niveau, zahl } from '../../lib/auswertung'

interface Eintrag {
  nr: number
  titel: string
  saeule: string | null
  wert: number | null
}

function Liste({ titel, ton, eintraege, schwellen }: { titel: string; ton: 'top' | 'flop'; eintraege: Eintrag[]; schwellen: Schwellen }) {
  return (
    <div className={`topflop topflop--${ton}`}>
      <h3 className="topflop__titel">{titel}</h3>
      {eintraege.length === 0 ? (
        <p className="muted klein">Noch keine Werte.</p>
      ) : (
        <ol className="topflop__liste">
          {eintraege.map((e) => (
            <li key={e.nr}>
              <span className={`topflop__wert wert wert--${niveau(e.wert, schwellen) ?? 'mittel'}`}>{zahl(e.wert)}</span>
              <span>
                <span className="topflop__text">{e.titel}</span>
                {e.saeule && <span className="topflop__saeule">{e.saeule}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** Höchste und niedrigste Verhalten nach Fremdbild (Plan §5.6: Top 4 / Flop 4) */
export function TopFlop({ top, flop, schwellen }: { top: Eintrag[]; flop: Eintrag[]; schwellen: Schwellen }) {
  return (
    <div className="topflop-paar">
      <Liste titel="Top 4" ton="top" eintraege={top} schwellen={schwellen} />
      <Liste titel="Flop 4" ton="flop" eintraege={flop} schwellen={schwellen} />
    </div>
  )
}

/** Rangliste nach Fremdbild, Platz 1 bis 3 hervorgehoben, gewählte Person markiert */
export function Rangliste({
  personen,
  aktivId,
  schwellen,
  onWahl,
}: {
  personen: DashboardPerson[]
  aktivId: string | null
  schwellen: Schwellen
  onWahl: (id: string) => void
}) {
  return (
    <ol className="rangliste">
      {personen.map((p) => (
        <li key={p.id} className={`${p.rang !== null && p.rang <= 3 ? `rang rang--${p.rang}` : 'rang'}${aktivId === p.id ? ' aktiv' : ''}`}>
          <span className="rang__platz">{p.rang ?? '–'}</span>
          <button type="button" className="rang__name textlink" onClick={() => onWahl(p.id)}>
            {p.name}
          </button>
          <span className={`wert wert--${niveau(p.fb, schwellen) ?? 'mittel'}`}>{zahl(p.fb)}</span>
        </li>
      ))}
    </ol>
  )
}

/** Matrix Säule × Person im Fremdbild (Durchschnitt aller Verhalten der Säule), Farbe nach Score-Niveau, dazu Ø Team. */
export function Heatmap({
  verhalten,
  matrix,
  personen,
  schwellen,
}: {
  verhalten: { nr: number; grundpfeiler: string | null; saeule: string | null; titel: string }[]
  matrix: { nr: number; person_id: string; fb: number | null }[]
  personen: { id: string; name: string }[]
  schwellen: Schwellen
}) {
  const wertVon = (nr: number, personId: string) => matrix.find((m) => m.nr === nr && m.person_id === personId)?.fb ?? null
  const teamVon = (nrs: number[]) => mittel(nrs.flatMap((nr) => personen.map((p) => wertVon(nr, p.id))))
  const personVon = (nrs: number[], personId: string) => mittel(nrs.map((nr) => wertVon(nr, personId)))

  // Gruppen in der Reihenfolge der Verhalten (Grundpfeiler · Säule)
  const gruppen: { name: string; grundpfeiler: string | null; saeule: string | null; verhalten: typeof verhalten }[] = []
  for (const v of verhalten) {
    const name = [v.grundpfeiler, v.saeule].filter(Boolean).join(' · ')
    const letzte = gruppen[gruppen.length - 1]
    if (letzte && letzte.name === name) letzte.verhalten.push(v)
    else gruppen.push({ name, grundpfeiler: v.grundpfeiler, saeule: v.saeule, verhalten: [v] })
  }

  const zelle = (wert: number | null, key: string, fett = false) => (
    <td key={key} className={`zahl heat heat--${niveau(wert, schwellen) ?? 'leer'}${fett ? ' heat--summe' : ''}`}>
      {zahl(wert)}
    </td>
  )

  const alle = verhalten.map((v) => v.nr)

  return (
    <div className="tabelle-scroll">
      <table className="tabelle heatmap">
        <thead>
          <tr>
            <th>Säule</th>
            {personen.map((p) => (
              <th key={p.id} className="zahl">
                {p.name.split(' ')[0]}
              </th>
            ))}
            <th className="zahl hervor">Ø Team</th>
          </tr>
        </thead>
        <tbody>
          {gruppen.map((g) => {
            const nrs = g.verhalten.map((v) => v.nr)
            return (
              <tr key={g.name}>
                <td>
                  <span className="heat__saeule">{g.saeule ?? 'Ohne Säule'}</span>
                  {g.grundpfeiler && <span className="heat__pfeiler muted klein">{g.grundpfeiler}</span>}
                </td>
                {personen.map((p) => zelle(personVon(nrs, p.id), p.id))}
                {zelle(teamVon(nrs), 'team', true)}
              </tr>
            )
          })}
          <tr className="gruppe gruppe--summe gruppe--gesamt">
            <th>Gesamt (alle Säulen)</th>
            {personen.map((p) => zelle(personVon(alle, p.id), p.id, true))}
            {zelle(teamVon(alle), 'team', true)}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

