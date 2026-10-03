import type { DashboardPerson, Schwellen } from '../../lib/auswertung'
import { niveau, zahl } from '../../lib/auswertung'

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

/** Matrix Verhalten × Person im Fremdbild, Farbe nach Score-Niveau, Zeilen nach Säule gruppiert */
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
  let letzte = ''
  return (
    <div className="tabelle-scroll">
      <table className="tabelle heatmap">
        <thead>
          <tr>
            <th>Verhalten</th>
            {personen.map((p) => (
              <th key={p.id} className="zahl">
                {p.name.split(' ')[0]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {verhalten.map((v) => {
            const gruppe = [v.grundpfeiler, v.saeule].filter(Boolean).join(' · ')
            const kopf = gruppe !== letzte ? gruppe : null
            letzte = gruppe
            return (
              <HeatZeile key={v.nr} kopf={kopf} spalten={personen.length + 1}>
                <td>
                  <span className="verhalten-nr">{v.nr}</span> {v.titel}
                </td>
                {personen.map((p) => {
                  const wert = matrix.find((m) => m.nr === v.nr && m.person_id === p.id)?.fb ?? null
                  return (
                    <td key={p.id} className={`zahl heat heat--${niveau(wert, schwellen) ?? 'leer'}`}>
                      {zahl(wert)}
                    </td>
                  )
                })}
              </HeatZeile>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function HeatZeile({ kopf, spalten, children }: { kopf: string | null; spalten: number; children: React.ReactNode }) {
  return (
    <>
      {kopf && (
        <tr className="gruppe">
          <th colSpan={spalten}>{kopf}</th>
        </tr>
      )}
      <tr>{children}</tr>
    </>
  )
}
