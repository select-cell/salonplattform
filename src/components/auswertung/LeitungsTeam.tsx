import { useState } from 'react'
import { holePersonErgebnisse, holeTeamDashboard, holeTeamErgebnisse } from '../../lib/api'
import type { Dashboard, TeamAuswertung } from '../../lib/auswertung'
import { einordnung, mittel, monatName, topFlop, vorzeichen, zahl } from '../../lib/auswertung'
import { useDaten } from '../../lib/useDaten'
import { Abschnitt, DatenZustand, EinordnungBadge, Kennzahl, Leer, Monatswahl } from './Bausteine'
import { DifferenzDiagramm, SbFbDiagramm, VerlaufDiagramm, type VerlaufDaten } from './Diagramme'
import { Heatmap, Rangliste, TopFlop } from './Listen'
import { PersonenAnsicht } from './PersonenAnsicht'
import { TeamTabelle } from './Tabellen'

/** Team-Dashboard für Verantwortliche und Admins (Plan §3, §5.6). Umschalter Team ↔ Person. */
export function LeitungsTeam() {
  const [gewaehlterMonat, setMonat] = useState<string | undefined>(undefined)
  const [ansicht, setAnsicht] = useState<string>('team')
  const dash = useDaten(() => holeTeamDashboard(gewaehlterMonat), [gewaehlterMonat])
  const verlauf = useDaten(holeTeamErgebnisse, [])

  const d = dash.daten
  if (!d) {
    return (
      <DatenZustand laedt={dash.laedt} fehler={dash.fehler} onNeu={dash.neuLaden}>
        {null}
      </DatenZustand>
    )
  }
  if (d.monate.length === 0) {
    return <Leer titel="Noch keine Ergebnisse" text="Sobald die ersten Umfragen abgegeben sind, erscheint hier das Team-Dashboard." />
  }

  const monat = d.monat
  const wechsleMonat = (m: string) => setMonat(m)

  return (
    <div className="stack stack-l" aria-busy={dash.laedt}>
      <div className="ausw-kopfzeile">
        <Monatswahl monate={d.monate} wert={monat} onChange={wechsleMonat} />
        <div className="umschalter" role="group" aria-label="Ansicht">
          <button type="button" className={`chip${ansicht === 'team' ? ' aktiv' : ''}`} onClick={() => setAnsicht('team')}>
            Team
          </button>
          {d.personen.map((p) => (
            <button key={p.id} type="button" className={`chip${ansicht === p.id ? ' aktiv' : ''}`} onClick={() => setAnsicht(p.id)}>
              {p.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {ansicht === 'team' ? (
        <TeamDashboard d={d} verlauf={verlauf.daten} onPerson={setAnsicht} />
      ) : (
        <PersonSicht key={ansicht} personId={ansicht} monat={monat} onMonat={wechsleMonat} />
      )}
    </div>
  )
}

function PersonSicht({ personId, monat, onMonat }: { personId: string; monat: string; onMonat: (m: string) => void }) {
  const person = useDaten(() => holePersonErgebnisse(personId), [personId])
  return (
    <DatenZustand laedt={person.laedt && !person.daten} fehler={person.fehler} onNeu={person.neuLaden}>
      {person.daten && (
        <>
          <h2 className="ausw-person">{person.daten.person.name}</h2>
          <PersonenAnsicht daten={person.daten} monat={monat} onMonat={onMonat} mitAbsender />
        </>
      )}
    </DatenZustand>
  )
}

function TeamDashboard({ d, verlauf, onPerson }: { d: Dashboard; verlauf: TeamAuswertung | null; onPerson: (id: string) => void }) {
  const { schwellen } = d
  if (d.personen.length === 0) {
    return <Leer titel={`Keine Daten für ${monatName(d.monat)}`} text="Für diesen Monat liegen noch keine Auswertungen vor." />
  }

  const sb = mittel(d.personen.map((p) => p.sb))
  const fb = mittel(d.personen.map((p) => p.fb))
  const diff = sb !== null && fb !== null ? Math.round((sb - fb) * 100) / 100 : null
  const e = einordnung(diff, schwellen, true)
  const dauer = mittel(d.personen.map((p) => p.minuten))
  const { top, flop } = topFlop(d.verhalten, (z) => z.fb)

  const verlaufDaten: VerlaufDaten[] = verlauf
    ? [...verlauf.monate].reverse().map((m) => {
        const z = verlauf.verhalten.filter((x) => x.monat === m)
        return {
          monat: m,
          sb: mittel(z.map((x) => x.sb)),
          fb: mittel(z.map((x) => x.fb)),
          rituale: mittel(verlauf.rituale_skalen.filter((r) => r.monat === m).map((r) => r.schnitt)),
        }
      })
    : []

  return (
    <>
      <div className="kennzahlen">
        <Kennzahl label="Team Ø Selbstbild" wert={zahl(sb)} farbe="sb" />
        <Kennzahl label="Team Ø Fremdbild" wert={zahl(fb)} farbe="fb" />
        <Kennzahl label="Differenz" wert={vorzeichen(diff)} ton={e.farbe} zusatz={<EinordnungBadge e={e} />} />
        <Kennzahl label="Ø Ausfülldauer" wert={dauer === null ? '–' : `${zahl(dauer)} Min.`} />
      </div>

      <div className="ausw-zweispaltig">
        <Abschnitt titel="Rangliste" kurz="Nach Fremdbild. Ein Klick öffnet die Person.">
          <Rangliste personen={d.personen} aktivId={null} schwellen={schwellen} onWahl={onPerson} />
        </Abschnitt>
        <Abschnitt titel="Differenz pro Person" kurz="Selbstbild minus Fremdbild. Grün = ausgewogen.">
          <DifferenzDiagramm daten={d.personen.map((p) => ({ name: p.name.split(' ')[0], differenz: p.differenz }))} schwelle={schwellen.ausgewogen} />
        </Abschnitt>
      </div>

      <Abschnitt titel="Selbstbild und Fremdbild" kurz="Kupfer = Selbstbild, Blau = Fremdbild.">
        <SbFbDiagramm
          daten={d.personen.map((p) => ({ name: p.name.split(' ')[0], voll: p.name, sb: p.sb, fb: p.fb }))}
          beschreibung={`Selbstbild und Fremdbild je Person im ${monatName(d.monat)}`}
        />
      </Abschnitt>

      <Abschnitt titel="Stärken und Entwicklungsfelder" kurz="Die vier höchsten und niedrigsten Verhalten im Team-Fremdbild.">
        <TopFlop
          schwellen={schwellen}
          top={top.map((z) => ({ nr: z.nr, titel: z.titel, saeule: z.saeule, wert: z.fb }))}
          flop={flop.map((z) => ({ nr: z.nr, titel: z.titel, saeule: z.saeule, wert: z.fb }))}
        />
      </Abschnitt>

      <Abschnitt titel="Heatmap" kurz="Fremdbild je Verhalten und Person. Grün hoch, Gelb mittel, Rot niedrig.">
        <Heatmap verhalten={d.verhalten} matrix={d.matrix} personen={d.personen} schwellen={schwellen} />
      </Abschnitt>

      <Abschnitt titel="Alle Verhalten im Detail">
        <TeamTabelle verhalten={d.verhalten} matrix={d.matrix} personen={d.personen} rituale={d.rituale_skalen} schwellen={schwellen} />
      </Abschnitt>

      {(d.entwicklung.length > 0 || d.rituale_phasen.length > 0) && (
        <Abschnitt titel="Entwicklung des Monats und Rituale">
          {d.entwicklung.map((n) => (
            <div key={n.person} className="karte karte--creme stack-s">
              <p>
                <strong>{n.person}</strong> wurde {n.nennungen}-mal genannt.
              </p>
              {n.nennungen_von.map((v, i) => (
                <p key={i} className="klein">
                  <strong>{v.von}:</strong> {v.begruendung || 'ohne Begründung'}
                </p>
              ))}
            </div>
          ))}
          {d.rituale_phasen.length > 0 && (
            <p className="klein muted">
              Am wenigsten stabile Phase: {d.rituale_phasen.map((p) => `${p.ritual}: ${p.phase} (${p.nennungen}×)`).join(' · ')}
            </p>
          )}
        </Abschnitt>
      )}

      {verlaufDaten.length > 0 && (
        <Abschnitt titel="Verlauf des Teams" kurz="Durchschnitt über alle Monate.">
          <VerlaufDiagramm daten={verlaufDaten} />
        </Abschnitt>
      )}
    </>
  )
}
