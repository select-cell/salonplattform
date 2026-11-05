import { holeZeitAuswertung } from '../../lib/api'
import { KENNZEICHEN_LABEL } from '../../lib/auswertung'
import { useDaten } from '../../lib/useDaten'
import { formatDauer } from '../../lib/zeitmesser'
import { Abschnitt, DatenZustand, Kennzahl } from './Bausteine'

const mmss = (sek: number) => `${Math.floor(sek / 60)}:${String(Math.round(sek % 60)).padStart(2, '0')}`

/**
 * Ausfüllzeit der Umfrage (Erweiterung B) für Verantwortliche und Admin: Median und Spanne, Personenliste mit
 * Kennzeichen, Zeit je Verhalten als Balken und eine aufklappbare Heatmap.
 */
export function ZeitAbschnitt({ monat }: { monat: string }) {
  const { laedt, daten, fehler, neuLaden } = useDaten(() => holeZeitAuswertung(monat), [monat])

  return (
    <Abschnitt
      titel="Ausfüllzeit"
      kurz="Aktive Zeit an der Umfrage. Pausen und andere Tabs zählen nicht; die Uhr ist die des Servers."
    >
      <DatenZustand laedt={laedt && !daten} fehler={fehler} onNeu={neuLaden}>
        {daten && <Inhalt daten={daten} />}
      </DatenZustand>
    </Abschnitt>
  )
}

function Inhalt({ daten }: { daten: NonNullable<ReturnType<typeof useDaten<Awaited<ReturnType<typeof holeZeitAuswertung>>>>['daten']> }) {
  const z = daten.zusammenfassung
  if (z.abgegeben === 0) {
    return (
      <p className="muted">
        Für diesen Monat gibt es noch keine gemessene Ausfüllzeit.
        {daten.abgaben_ohne_zeit > 0 && ` ${daten.abgaben_ohne_zeit} Abgaben stammen aus der Zeit vor der Messung.`}
      </p>
    )
  }

  const maxBalken = Math.max(1, ...daten.verhalten.map((v) => v.median_sek))
  const schritte = ['entwicklung', ...daten.verhalten.map((v) => v.schritt)]
  const zeilen = daten.personen.map((p) => ({
    ...p,
    sek: Object.fromEntries(daten.heatmap.filter((h) => h.person_id === p.id).map((h) => [h.schritt, h.sek])),
  }))
  const maxZelle = Math.max(1, ...daten.heatmap.map((h) => h.sek))
  const e = daten.einstellungen

  return (
    <div className="stack">
      <div className="kennzahlen">
        <Kennzahl label="Median" wert={z.median_sek === null ? '–' : formatDauer(z.median_sek)} zusatz="aktive Zeit" />
        <Kennzahl
          label="Spanne"
          wert={z.min_sek === null || z.max_sek === null ? '–' : `${formatDauer(z.min_sek)} bis ${formatDauer(z.max_sek)}`}
        />
        <Kennzahl label="Zählt" wert={`${z.zaehlt} von ${z.abgegeben}`} zusatz="in Median und Spanne" />
      </div>

      <div className="tabelle-scroll">
        <table className="tabelle">
          <thead>
            <tr>
              <th>Person</th>
              <th className="zahl">Aktive Zeit</th>
              <th className="zahl">Gesamtdauer</th>
              <th>Hinweise</th>
            </tr>
          </thead>
          <tbody>
            {daten.personen.map((p) => (
              <tr key={p.id} className={p.zaehlt ? undefined : 'zeit-zeile--aus'}>
                <td>{p.name}</td>
                <td className="zahl">{p.kennzeichen.includes('ohne_sitzung') ? '–' : formatDauer(p.aktive_sek)}</td>
                <td className="zahl">{p.kennzeichen.includes('ohne_sitzung') ? '–' : formatDauer(p.gesamt_sek)}</td>
                <td>
                  <span className="zeit-kennzeichen">
                    {p.kennzeichen.map((k) => (
                      <span key={k} className={`badge${['zu_schnell', 'sehr_lang', 'ohne_sitzung'].includes(k) ? ' badge--gelb' : ''}`}>
                        {KENNZEICHEN_LABEL[k] ?? k}
                      </span>
                    ))}
                    {!p.zaehlt && <span className="klein muted">zählt nicht</span>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {daten.verhalten.length > 0 && (
        <div className="stack-s">
          <h3 className="abschnitt-titel">Zeit je Verhalten (Median)</h3>
          <ul className="zeit-balken">
            {daten.verhalten.map((v) => (
              <li key={v.nr}>
                <span className="zeit-balken__name">
                  <span className="verhalten-nr">{v.nr}</span> {v.titel ?? `Verhalten ${v.nr}`}
                </span>
                <span className="zeit-balken__spur" aria-hidden="true">
                  <span style={{ width: `${Math.max(2, (v.median_sek / maxBalken) * 100)}%` }} />
                </span>
                <span className="zeit-balken__wert">{mmss(v.median_sek)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {zeilen.length > 0 && daten.heatmap.length > 0 && (
        <details className="zeit-heatmap">
          <summary>Heatmap: Zeit je Verhalten und Person</summary>
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Person</th>
                  {schritte.map((s) => (
                    <th key={s} className="zahl">
                      {s === 'entwicklung' ? 'Entw.' : s.slice(1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zeilen.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name.split(' ')[0]}</td>
                    {schritte.map((s) => {
                      const sek = p.sek[s]
                      return (
                        <td
                          key={s}
                          className="zahl zeit-zelle"
                          style={sek === undefined ? undefined : { ['--intensitaet' as string]: `${Math.round((sek / maxZelle) * 70)}%` }}
                        >
                          {sek === undefined ? '–' : mmss(sek)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <p className="klein muted">
        Nicht in Median und Spanne zählen: „zu schnell“ (unter {e.min_sek_pro_verhalten} Sekunden aktiv je Verhalten), „sehr lang“
        (länger als {Math.round(e.sehr_lang_sek / 3600)} Stunden) und „ohne Zeitmessung“. Sichtbar bleiben sie trotzdem.
        {daten.abgaben_ohne_zeit > 0 && ` ${daten.abgaben_ohne_zeit} Abgaben stammen aus der Zeit vor der Messung.`}
      </p>
    </div>
  )
}
