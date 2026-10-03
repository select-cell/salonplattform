import type { TeamAuswertung } from '../../lib/auswertung'
import { einordnung, mittel, monatName, saeulenSchnitte, topFlop, vorzeichen, zahl } from '../../lib/auswertung'
import { Abschnitt, EinordnungBadge, Kennzahl, Leer, Monatswahl } from './Bausteine'
import { SbFbDiagramm, VerlaufDiagramm, type VerlaufDaten } from './Diagramme'
import { TopFlop } from './Listen'
import { SchnittTabelle } from './Tabellen'

/** Team-Ergebnisse für Mitarbeiterinnen: nur Durchschnittswerte, keine Einzelpersonen (Plan §2) */
export function TeamAnsicht({ daten, monat, onMonat }: { daten: TeamAuswertung; monat: string; onMonat: (m: string) => void }) {
  if (daten.monate.length === 0) {
    return <Leer titel="Noch keine Team-Ergebnisse" text="Sobald die ersten Umfragen abgegeben sind, siehst du hier, wie das Team insgesamt dasteht." />
  }

  const { schwellen } = daten
  const zeilen = daten.verhalten.filter((z) => z.monat === monat)
  const sb = mittel(zeilen.map((z) => z.sb))
  const fb = mittel(zeilen.map((z) => z.fb))
  const diff = sb !== null && fb !== null ? Math.round((sb - fb) * 100) / 100 : null
  const e = einordnung(diff, schwellen, true)
  const dauer = daten.dauer.find((d) => d.monat === monat)
  const { top, flop } = topFlop(zeilen, (z) => z.fb)
  const saeulen = saeulenSchnitte(zeilen)
  const skalen = daten.rituale_skalen.filter((r) => r.monat === monat)
  const phasen = daten.rituale_phasen.filter((r) => r.monat === monat)
  const genannt = daten.entwicklung.filter((n) => n.monat === monat)

  const verlauf: VerlaufDaten[] = [...daten.monate].reverse().map((m) => {
    const z = daten.verhalten.filter((x) => x.monat === m)
    return {
      monat: m,
      sb: mittel(z.map((x) => x.sb)),
      fb: mittel(z.map((x) => x.fb)),
      rituale: mittel(daten.rituale_skalen.filter((r) => r.monat === m).map((r) => r.schnitt)),
    }
  })

  return (
    <div className="stack stack-l">
      <Monatswahl monate={daten.monate} wert={monat} onChange={onMonat} />

      {zeilen.length === 0 ? (
        <Leer titel={`Keine Daten für ${monatName(monat)}`} text="Für diesen Monat liegen noch keine Team-Ergebnisse vor." />
      ) : (
        <>
          <div className="kennzahlen">
            <Kennzahl label="Team Ø Selbstbild" wert={zahl(sb)} farbe="sb" />
            <Kennzahl label="Team Ø Fremdbild" wert={zahl(fb)} farbe="fb" />
            <Kennzahl label="Differenz" wert={vorzeichen(diff)} ton={e.farbe} zusatz={<EinordnungBadge e={e} />} />
            <Kennzahl label="Ø Ausfülldauer" wert={dauer?.minuten == null ? '–' : `${zahl(dauer.minuten)} Min.`} zusatz={dauer ? `${dauer.abgaben} Abgaben` : undefined} />
          </div>

          <Abschnitt titel="Selbstbild und Fremdbild im Team" kurz="Durchschnitt je Säule.">
            <SbFbDiagramm
              daten={saeulen.map((s) => ({ name: s.kurz, voll: `${s.grundpfeiler} · ${s.saeule}`, sb: s.sb, fb: s.fb }))}
              beschreibung={`Team: Selbstbild und Fremdbild je Säule im ${monatName(monat)}`}
            />
          </Abschnitt>

          <Abschnitt titel="Stärken und Entwicklungsfelder des Teams">
            <TopFlop
              schwellen={schwellen}
              top={top.map((z) => ({ nr: z.nr, titel: z.titel, saeule: z.saeule, wert: z.fb }))}
              flop={flop.map((z) => ({ nr: z.nr, titel: z.titel, saeule: z.saeule, wert: z.fb }))}
            />
          </Abschnitt>

          <Abschnitt titel="Alle Verhalten im Team-Schnitt">
            <SchnittTabelle zeilen={zeilen} schwellen={schwellen} />
          </Abschnitt>

          {(skalen.length > 0 || phasen.length > 0) && (
            <Abschnitt titel="Rituale">
              {skalen.length > 0 && (
                <div className="tabelle-scroll">
                  <table className="tabelle">
                    <thead>
                      <tr>
                        <th>Ritual</th>
                        <th>Frage</th>
                        <th className="zahl">Ø Team</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skalen.map((r) => (
                        <tr key={`${r.ritual}-${r.frage_nr}`}>
                          <td>{r.ritual}</td>
                          <td>{r.frage}</td>
                          <td className="zahl">{zahl(r.schnitt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {phasen.length > 0 && (
                <p className="klein muted">
                  Am wenigsten stabile Phase: {phasen.map((p) => `${p.ritual}: ${p.phase} (${p.nennungen}×)`).join(' · ')}
                </p>
              )}
            </Abschnitt>
          )}

          {genannt.length > 0 && (
            <Abschnitt titel="Entwicklung des Monats" kurz="Wie oft jemand genannt wurde.">
              <ul className="zeilen">
                {genannt.map((n) => (
                  <li key={n.person} className="zeile">
                    <span>{n.person}</span>
                    <strong>{n.nennungen}×</strong>
                  </li>
                ))}
              </ul>
            </Abschnitt>
          )}

          <Abschnitt titel="Verlauf des Teams" kurz="Durchschnitt über alle Monate.">
            <VerlaufDiagramm daten={verlauf} />
          </Abschnitt>
        </>
      )}
    </div>
  )
}
