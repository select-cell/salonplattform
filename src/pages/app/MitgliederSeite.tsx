import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { DatenZustand, EinordnungBadge, Leer } from '../../components/auswertung/Bausteine'
import { holeAbgabeStatus, holeTeamDashboard } from '../../lib/api'
import type { AbgabeStatus, Dashboard } from '../../lib/auswertung'
import { einordnung, monatName, vorzeichen, zahl } from '../../lib/auswertung'
import { aktuellerMonat, zeitpunktLabel } from '../../lib/monat'
import { useDaten } from '../../lib/useDaten'

/** /app/mitglieder: alle Mitarbeiterinnen mit Fremdbild, Differenz und Abgabe-Status (Plan §3). */
export default function MitgliederSeite() {
  const dash = useDaten(() => holeTeamDashboard(), [])
  const status = useDaten(holeAbgabeStatus, [])
  const laedt = dash.laedt || status.laedt
  const fehler = dash.fehler ?? status.fehler

  return (
    <div className="stack stack-l">
      <header className="seitenkopf">
        <p className="overline">Mitarbeiterinnen</p>
        <h1 style={{ marginTop: 8 }}>Jede Person im Detail</h1>
        <p>
          Werte aus {dash.daten?.monate.length ? monatName(dash.daten.monat) : 'dem neuesten Monat'}, Abgabe-Status für{' '}
          {monatName(aktuellerMonat())}.
        </p>
      </header>

      <DatenZustand laedt={laedt} fehler={fehler} onNeu={() => { dash.neuLaden(); status.neuLaden() }}>
        {dash.daten && status.daten && (
          <Liste dash={dash.daten} status={status.daten} />
        )}
      </DatenZustand>
    </div>
  )
}

function Liste({ dash, status }: { dash: Dashboard; status: AbgabeStatus[] }) {
  // Alle aktiven Teilnehmerinnen, auch wenn sie noch keine Auswertung haben
  const ids = new Set([...status.map((s) => s.person_id), ...dash.personen.map((p) => p.id)])
  const zeilen = [...ids]
    .map((id) => ({
      id,
      name: dash.personen.find((p) => p.id === id)?.name ?? status.find((s) => s.person_id === id)?.name ?? '',
      auswertung: dash.personen.find((p) => p.id === id) ?? null,
      status: status.find((s) => s.person_id === id) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))

  if (zeilen.length === 0) {
    return <Leer titel="Noch keine Mitarbeiterinnen" text="Sobald Personen mit Teilnahme an der Teamumfrage angelegt sind, erscheinen sie hier." />
  }

  return (
    <ul className="mitglieder">
      {zeilen.map((z) => {
        const e = einordnung(z.auswertung?.differenz ?? null, dash.schwellen)
        return (
          <li key={z.id}>
            <Link to={`/app/mitglieder/${z.id}`} className="mitglied">
              <span className="mitglied__name">{z.name}</span>
              <span className="mitglied__werte">
                <span>
                  <span className="mitglied__label">Ø Fremdbild</span> <strong>{zahl(z.auswertung?.fb)}</strong>
                </span>
                <span>
                  <span className="mitglied__label">Differenz</span> <strong>{vorzeichen(z.auswertung?.differenz)}</strong>
                </span>
                {z.auswertung && <EinordnungBadge e={e} />}
              </span>
              <span className="mitglied__status">
                {z.status ? (
                  z.status.abgegeben ? (
                    <span className="badge badge--gruen">
                      <Icon name="haken" groesse={14} /> Abgegeben{z.status.abgegeben_am ? ` am ${zeitpunktLabel(z.status.abgegeben_am)}` : ''}
                    </span>
                  ) : (
                    <span className="badge badge--gelb">Noch offen</span>
                  )
                ) : (
                  <span className="badge">Kein Status</span>
                )}
              </span>
              <Icon name="pfeil" groesse={18} />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
