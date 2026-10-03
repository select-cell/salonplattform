import { useState } from 'react'
import type { Schwellen, Sortierung, VerhaltenZeile } from '../../lib/auswertung'
import { einordnung, niveau, sortiere, vorzeichen, zahl } from '../../lib/auswertung'
import { EinordnungBadge, Tabs } from './Bausteine'

type Basis = 'sb' | 'fb' | 'rituale'

const SORTIERUNGEN: { id: Sortierung; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'hoechste', label: 'Höchste' },
  { id: 'niedrigste', label: 'Niedrigste' },
]

function Wert({ wert, schwellen }: { wert: number | null; schwellen: Schwellen }) {
  const n = niveau(wert, schwellen)
  return <span className={`wert${n ? ` wert--${n}` : ''}`}>{zahl(wert)}</span>
}

function SortWahl({ wert, onChange }: { wert: Sortierung; onChange: (s: Sortierung) => void }) {
  return (
    <div className="feld ausw-sort">
      <label className="feld__label" htmlFor="sortierung">
        Sortierung
      </label>
      <select id="sortierung" className="feld__eingabe" value={wert} onChange={(e) => onChange(e.target.value as Sortierung)}>
        {SORTIERUNGEN.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Überschriftszeile, wenn „Standard“ nach Säulen gruppiert */
function gruppenKopf(z: { grundpfeiler: string | null; saeule: string | null }, davor: { grundpfeiler: string | null; saeule: string | null } | undefined) {
  if (davor && davor.grundpfeiler === z.grundpfeiler && davor.saeule === z.saeule) return null
  return [z.grundpfeiler, z.saeule].filter(Boolean).join(' · ')
}

// ---------------------------------------------------------------------------------
// Personen-Sicht: Selbstbild · Fremdbild · Differenz, dazu die Rituale
// ---------------------------------------------------------------------------------
export function PersonenTabelle({
  zeilen,
  rituale,
  schwellen,
}: {
  zeilen: VerhaltenZeile[]
  rituale: { ritual: string; frage_nr: number; frage: string; antwort: number }[]
  schwellen: Schwellen
}) {
  const [basis, setBasis] = useState<Basis>('fb')
  const [modus, setModus] = useState<Sortierung>('standard')

  const sortiert = sortiere(zeilen, (z) => (basis === 'sb' ? z.sb : z.fb), basis === 'rituale' ? 'standard' : modus)

  return (
    <div className="stack">
      <div className="ausw-werkzeuge">
        <Tabs
          label="Ansicht der Tabelle"
          aktiv={basis}
          onChange={setBasis}
          tabs={[
            { id: 'sb', label: 'Selbstbild' },
            { id: 'fb', label: 'Fremdbild' },
            { id: 'rituale', label: 'Rituale' },
          ]}
        />
        {basis !== 'rituale' && <SortWahl wert={modus} onChange={setModus} />}
      </div>

      {basis === 'rituale' ? (
        rituale.length === 0 ? (
          <p className="muted">Zu diesem Monat gibt es keine Ritual-Antworten.</p>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Ritual</th>
                  <th>Frage</th>
                  <th className="zahl">Antwort</th>
                </tr>
              </thead>
              <tbody>
                {rituale.map((r) => (
                  <tr key={`${r.ritual}-${r.frage_nr}`}>
                    <td>{r.ritual}</td>
                    <td>{r.frage}</td>
                    <td className="zahl">
                      <Wert wert={r.antwort} schwellen={schwellen} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="tabelle-scroll">
          <table className="tabelle">
            <thead>
              <tr>
                <th>Verhalten</th>
                <th className={`zahl${basis === 'sb' ? ' hervor' : ''}`}>Selbstbild</th>
                <th className={`zahl${basis === 'fb' ? ' hervor' : ''}`}>Fremdbild</th>
                <th className="zahl">Differenz</th>
              </tr>
            </thead>
            <tbody>
              {sortiert.map((z, i) => {
                const kopf = modus === 'standard' ? gruppenKopf(z, sortiert[i - 1]) : null
                const diff = z.sb !== null && z.fb !== null ? Math.round((z.sb - z.fb) * 100) / 100 : null
                return (
                  <FragmentZeile key={z.nr} kopf={kopf} spalten={4}>
                    <td>
                      <span className="verhalten-nr">{z.nr}</span> {z.titel}
                    </td>
                    <td className="zahl">
                      <Wert wert={z.sb} schwellen={schwellen} />
                    </td>
                    <td className="zahl">
                      <Wert wert={z.fb} schwellen={schwellen} />
                    </td>
                    <td className="zahl">
                      <span className={`diff diff--${einordnung(diff, schwellen).farbe}`}>{vorzeichen(diff)}</span>
                    </td>
                  </FragmentZeile>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FragmentZeile({ kopf, spalten, children }: { kopf: string | null; spalten: number; children: React.ReactNode }) {
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

// ---------------------------------------------------------------------------------
// Team-Sicht der Leitung: eine Spalte je Person plus Ø Team
// ---------------------------------------------------------------------------------
export function TeamTabelle({
  verhalten,
  matrix,
  personen,
  rituale,
  schwellen,
}: {
  verhalten: { nr: number; grundpfeiler: string | null; saeule: string | null; titel: string; sb: number | null; fb: number | null }[]
  matrix: { nr: number; person_id: string; sb: number | null; fb: number | null }[]
  personen: { id: string; name: string }[]
  rituale: { ritual: string; frage_nr: number; frage: string; schnitt: number; anzahl: number }[]
  schwellen: Schwellen
}) {
  const [basis, setBasis] = useState<Basis>('fb')
  const [modus, setModus] = useState<Sortierung>('standard')
  const sortiert = sortiere(verhalten, (z) => (basis === 'sb' ? z.sb : z.fb), modus)
  const feld = basis === 'sb' ? 'sb' : 'fb'
  const spalten = personen.length + 2

  return (
    <div className="stack">
      <div className="ausw-werkzeuge">
        <Tabs
          label="Ansicht der Tabelle"
          aktiv={basis}
          onChange={setBasis}
          tabs={[
            { id: 'sb', label: 'Selbstbild' },
            { id: 'fb', label: 'Fremdbild' },
            { id: 'rituale', label: 'Rituale' },
          ]}
        />
        {basis !== 'rituale' && <SortWahl wert={modus} onChange={setModus} />}
      </div>

      {basis === 'rituale' ? (
        rituale.length === 0 ? (
          <p className="muted">Zu diesem Monat gibt es keine Ritual-Antworten.</p>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Ritual</th>
                  <th>Frage</th>
                  <th className="zahl">Ø Team</th>
                  <th className="zahl">Antworten</th>
                </tr>
              </thead>
              <tbody>
                {rituale.map((r) => (
                  <tr key={`${r.ritual}-${r.frage_nr}`}>
                    <td>{r.ritual}</td>
                    <td>{r.frage}</td>
                    <td className="zahl">
                      <Wert wert={r.schnitt} schwellen={schwellen} />
                    </td>
                    <td className="zahl">{r.anzahl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="tabelle-scroll">
          <table className="tabelle">
            <thead>
              <tr>
                <th>Verhalten</th>
                {personen.map((p) => (
                  <th key={p.id} className="zahl">
                    {p.name.split(' ')[0]}
                  </th>
                ))}
                <th className="zahl hervor">Ø Team</th>
              </tr>
            </thead>
            <tbody>
              {sortiert.map((z, i) => {
                const kopf = modus === 'standard' ? gruppenKopf(z, sortiert[i - 1]) : null
                return (
                  <FragmentZeile key={z.nr} kopf={kopf} spalten={spalten}>
                    <td>
                      <span className="verhalten-nr">{z.nr}</span> {z.titel}
                    </td>
                    {personen.map((p) => {
                      const m = matrix.find((x) => x.nr === z.nr && x.person_id === p.id)
                      return (
                        <td key={p.id} className="zahl">
                          <Wert wert={m ? m[feld] : null} schwellen={schwellen} />
                        </td>
                      )
                    })}
                    <td className="zahl hervor">
                      <Wert wert={z[feld]} schwellen={schwellen} />
                    </td>
                  </FragmentZeile>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------
// Team-Sicht der Mitarbeiterin: nur Schnitte
// ---------------------------------------------------------------------------------
export function SchnittTabelle({ zeilen, schwellen }: { zeilen: VerhaltenZeile[]; schwellen: Schwellen }) {
  const [modus, setModus] = useState<Sortierung>('standard')
  const sortiert = sortiere(zeilen, (z) => z.fb, modus)
  return (
    <div className="stack">
      <div className="ausw-werkzeuge">
        <SortWahl wert={modus} onChange={setModus} />
      </div>
      <div className="tabelle-scroll">
        <table className="tabelle">
          <thead>
            <tr>
              <th>Verhalten</th>
              <th className="zahl">Ø Selbstbild</th>
              <th className="zahl hervor">Ø Fremdbild</th>
              <th className="zahl">Differenz</th>
            </tr>
          </thead>
          <tbody>
            {sortiert.map((z, i) => {
              const kopf = modus === 'standard' ? gruppenKopf(z, sortiert[i - 1]) : null
              const diff = z.sb !== null && z.fb !== null ? Math.round((z.sb - z.fb) * 100) / 100 : null
              return (
                <FragmentZeile key={z.nr} kopf={kopf} spalten={4}>
                  <td>
                    <span className="verhalten-nr">{z.nr}</span> {z.titel}
                  </td>
                  <td className="zahl">
                    <Wert wert={z.sb} schwellen={schwellen} />
                  </td>
                  <td className="zahl hervor">
                    <Wert wert={z.fb} schwellen={schwellen} />
                  </td>
                  <td className="zahl">
                    <EinordnungBadge e={einordnung(diff, schwellen, true)} />
                  </td>
                </FragmentZeile>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
