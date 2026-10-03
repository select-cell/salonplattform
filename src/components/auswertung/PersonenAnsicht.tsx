import type { PersonAuswertung } from '../../lib/auswertung'
import { einordnung, mittel, monatName, saeulenSchnitte, topFlop, vorzeichen, zahl } from '../../lib/auswertung'
import { Abschnitt, EinordnungBadge, Kennzahl, Leer, Monatswahl } from './Bausteine'
import { SbFbDiagramm, VerlaufDiagramm, type VerlaufDaten } from './Diagramme'
import { TopFlop } from './Listen'
import { PersonenTabelle } from './Tabellen'

interface Props {
  daten: PersonAuswertung
  monat: string
  onMonat: (monat: string) => void
  /** Leitung sieht, wer wie bewertet hat; Mitarbeiterinnen nicht */
  mitAbsender: boolean
}

/** Auswertung einer Person: Kennzahlen, Diagramme, Tabelle, Verlauf und Monats-Detail (Plan §5.6) */
export function PersonenAnsicht({ daten, monat, onMonat, mitAbsender }: Props) {
  if (daten.monate.length === 0) {
    return (
      <Leer
        titel="Noch keine Ergebnisse"
        text="Sobald die erste Umfrage abgegeben ist und die Kolleginnen bewertet haben, erscheinen hier die Auswertungen."
      />
    )
  }

  const { schwellen } = daten
  const zeilen = daten.verhalten.filter((z) => z.monat === monat)
  const sb = mittel(zeilen.map((z) => z.sb))
  const fb = mittel(zeilen.map((z) => z.fb))
  const diff = sb !== null && fb !== null ? Math.round((sb - fb) * 100) / 100 : null
  const e = einordnung(diff, schwellen)
  const dauer = daten.dauer.find((d) => d.monat === monat)?.minuten ?? null
  const { top, flop } = topFlop(zeilen, (z) => z.fb)
  const saeulen = saeulenSchnitte(zeilen)

  const verlauf: VerlaufDaten[] = [...daten.monate].reverse().map((m) => {
    const z = daten.verhalten.filter((x) => x.monat === m)
    return {
      monat: m,
      sb: mittel(z.map((x) => x.sb)),
      fb: mittel(z.map((x) => x.fb)),
    }
  })

  const nennungen = daten.entwicklung.filter((n) => n.monat === monat)

  return (
    <div className="stack stack-l">
      <Monatswahl monate={daten.monate} wert={monat} onChange={onMonat} />

      {zeilen.length === 0 ? (
        <Leer titel={`Keine Daten für ${monatName(monat)}`} text="Für diesen Monat liegen für dich keine Bewertungen vor." />
      ) : (
        <>
          <div className="kennzahlen">
            <Kennzahl label="Ø Selbstbild" wert={zahl(sb)} farbe="sb" />
            <Kennzahl label="Ø Fremdbild" wert={zahl(fb)} farbe="fb" zusatz={fb === null ? 'Noch keine Fremdbilder' : undefined} />
            <Kennzahl label="Differenz" wert={vorzeichen(diff)} ton={e.farbe} zusatz={<EinordnungBadge e={e} />} />
            <Kennzahl label="Ausfülldauer" wert={dauer === null ? '–' : `${zahl(dauer)} Min.`} />
          </div>

          <Abschnitt titel="Selbstbild und Fremdbild" kurz="Durchschnitt je Säule. Kupfer = Selbstbild, Blau = Fremdbild.">
            <SbFbDiagramm
              daten={saeulen.map((s) => ({ name: s.kurz, voll: `${s.grundpfeiler} · ${s.saeule}`, sb: s.sb, fb: s.fb }))}
              beschreibung={`Selbstbild und Fremdbild je Säule im ${monatName(monat)}`}
            />
          </Abschnitt>

          <Abschnitt titel="Stärken und Entwicklungsfelder" kurz="Die vier höchsten und niedrigsten Verhalten nach Fremdbild.">
            <TopFlop
              schwellen={schwellen}
              top={top.map((z) => ({ nr: z.nr, titel: z.titel, saeule: z.saeule, wert: z.fb }))}
              flop={flop.map((z) => ({ nr: z.nr, titel: z.titel, saeule: z.saeule, wert: z.fb }))}
            />
          </Abschnitt>

          <Abschnitt titel="Alle Verhalten im Detail">
            <PersonenTabelle zeilen={zeilen} schwellen={schwellen} />
          </Abschnitt>

          <Abschnitt titel="Verlauf" kurz="Durchschnitt über alle Monate.">
            <VerlaufDiagramm daten={verlauf} />
          </Abschnitt>

          <Abschnitt
            titel="Rückmeldungen im Monat"
            kurz={
              mitAbsender
                ? 'Mit Absender. Nur für Verantwortliche und Admins sichtbar.'
                : 'Die Kolleginnen schreiben anonym. Absender werden nicht angezeigt.'
            }
          >
            <MonatsDetail daten={daten} monat={monat} zeilen={zeilen} mitAbsender={mitAbsender} />
            {nennungen.length > 0 && (
              <div className="karte karte--creme stack-s">
                <h3 className="abschnitt-titel">Entwicklung des Monats</h3>
                <p>
                  {mitAbsender
                    ? `${daten.person.name} wurde ${nennungen.length}-mal genannt.`
                    : `Du wurdest in diesem Monat ${nennungen.length}-mal genannt.`}
                </p>
                {mitAbsender &&
                  nennungen.map((n, i) => (
                    <p key={i} className="klein">
                      <strong>{n.von}:</strong> {n.begruendung || 'ohne Begründung'}
                    </p>
                  ))}
              </div>
            )}
          </Abschnitt>
        </>
      )}
    </div>
  )
}

function MonatsDetail({
  daten,
  monat,
  zeilen,
  mitAbsender,
}: {
  daten: PersonAuswertung
  monat: string
  zeilen: PersonAuswertung['verhalten']
  mitAbsender: boolean
}) {
  const mitText = zeilen.filter((z) =>
    mitAbsender
      ? (daten.einzelwerte ?? []).some((w) => w.monat === monat && w.nr === z.nr && w.kommentar)
      : daten.kommentare.some((k) => k.monat === monat && k.nr === z.nr),
  )
  if (mitText.length === 0) return <p className="muted">In diesem Monat gibt es keine Kommentare.</p>

  return (
    <ul className="kommentare">
      {mitText.map((z) => (
        <li key={z.nr} className="kommentar-gruppe">
          <p className="kommentar-gruppe__titel">
            <span className="verhalten-nr">{z.nr}</span> {z.titel}
          </p>
          <ul>
            {mitAbsender
              ? (daten.einzelwerte ?? [])
                  .filter((w) => w.monat === monat && w.nr === z.nr && w.kommentar)
                  .map((w, i) => (
                    <li key={i} className="kommentar">
                      <span className="badge badge--blau">{w.von} · Note {w.note}</span>
                      <span>{w.kommentar}</span>
                    </li>
                  ))
              : daten.kommentare
                  .filter((k) => k.monat === monat && k.nr === z.nr)
                  .map((k, i) => (
                    <li key={i} className="kommentar">
                      <span className="badge badge--blau">Note {k.note}</span>
                      <span>{k.kommentar}</span>
                    </li>
                  ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
