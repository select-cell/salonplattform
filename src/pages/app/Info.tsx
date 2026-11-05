import type { ReactNode } from 'react'
import { usePerson } from '../../auth/kontext'
import { DatenZustand } from '../../components/auswertung/Bausteine'
import { MARKE } from '../../config/brand'
import { holePdfProtokoll } from '../../lib/api'
import { monatName } from '../../lib/auswertung'
import { useDaten } from '../../lib/useDaten'

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="karte stack-s" aria-label={titel}>
      <h2 className="abschnitt-titel">{titel}</h2>
      {children}
    </section>
  )
}

const ART_NAME = { monatsbericht: 'Monatsbericht', personenbericht: 'Personenbericht' } as const
const zeitFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' })

/** Nur für Admins: wer wann welchen PDF-Bericht abgerufen hat. */
function ExportProtokoll() {
  const { laedt, daten, fehler, neuLaden } = useDaten(() => holePdfProtokoll(50), [])
  return (
    <Abschnitt titel="Export-Protokoll (nur Admin)">
      <p className="klein muted">Die letzten 50 PDF-Berichte: wer wann welchen Bericht abgerufen hat.</p>
      <DatenZustand laedt={laedt && !daten} fehler={fehler} onNeu={neuLaden}>
        {daten && daten.length === 0 && <p className="muted">Noch kein Bericht abgerufen.</p>}
        {daten && daten.length > 0 && (
          <div className="tabelle-scroll">
            <table className="tabelle" aria-label="Export-Protokoll">
              <thead>
                <tr>
                  <th scope="col">Wann</th>
                  <th scope="col">Wer</th>
                  <th scope="col">Bericht</th>
                  <th scope="col">Monat</th>
                </tr>
              </thead>
              <tbody>
                {daten.map((z, i) => (
                  <tr key={`${z.erstellt_am}-${i}`}>
                    <td>{zeitFormat.format(new Date(z.erstellt_am))}</td>
                    <td>{z.von}</td>
                    <td>
                      {ART_NAME[z.art]}
                      {z.ziel ? `: ${z.ziel}` : ''}
                    </td>
                    <td>{monatName(z.monat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DatenZustand>
    </Abschnitt>
  )
}

/**
 * /app/info: „Info und Datenschutz“. Jede Erweiterung, die Daten anders nutzt, ergänzt hier einen Absatz.
 */
export default function Info() {
  const person = usePerson()
  return (
    <div className="stack stack-l" style={{ maxWidth: 760 }}>
      <header className="seitenkopf">
        <p className="overline">{MARKE.name} · {MARKE.zusatz}</p>
        <h1 style={{ marginTop: 8 }}>Info und Datenschutz</h1>
        <p>Was die Plattform mit deinen Angaben macht, in einfachen Worten.</p>
      </header>

      <Abschnitt titel="Anmeldung">
        <p>
          Die Plattform ist nur für eingeladene Personen. Du meldest dich mit deiner E-Mail-Adresse und deinem Passwort an.
          Das Passwort kannst du jederzeit selbst ändern (Link „Passwort ändern“ im Kopf der Seite). Eine Selbstregistrierung
          gibt es nicht.
        </p>
      </Abschnitt>

      <Abschnitt titel="Deine Angaben in der Umfrage">
        <p>
          Du bewertest dich selbst (Selbstbild) und deine Kollegen (Fremdbild). Zu jeder Bewertung kannst du einen Kommentar
          schreiben, ab Bewertung 4 ist er Pflicht. Bestätigte Bewertungen lassen sich nicht mehr ändern.
        </p>
        <ul className="platzhalter__liste">
          <li>
            <strong>Kollegen sehen:</strong> den Kommentar zu dir erfährst du <em>ohne</em> Namen des Absenders. In deinen eigenen
            Ergebnissen siehst du nur deine eigenen Selbstbild-Antworten.
          </li>
          <li>
            <strong>Verantwortliche und Admin sehen:</strong> alle Bewertungen und Kommentare mit Absender.
          </li>
          <li>
            Die Auswertungen des Teams zeigen Durchschnitte, Rangliste und Heatmap mit Namen, aber keine Kommentare.
          </li>
        </ul>
      </Abschnitt>

      <Abschnitt titel="Kommentare in der Umfrage">
        <p>
          Verantwortliche und Admin sehen, <strong>wie oft und wie ausführlich</strong> jede Person Kommentare schreibt: Quote, Anteil bei
          Pflicht und freiwillig, durchschnittliche Länge, sehr kurze Kommentare, Wiederholungen und Verhalten ohne Kommentar.
          Der <strong>Text</strong> eines Kommentars ist in dieser Auswertung nie zu sehen. Die Kennzahlen dienen dazu, das Feedback im Team
          besser zu machen, nicht dazu, Personen zu bewerten.
        </p>
        <p className="klein muted">
          Auf Wunsch lässt sich einstellen, dass Verantwortliche ihre eigenen Werte nicht sehen (nur der Admin).
        </p>
      </Abschnitt>

      <Abschnitt titel="Ausfüllzeit der Umfrage">
        <p>
          Wir messen, wie lange du <strong>aktiv</strong> an der Umfrage arbeitest. Aktiv heißt: Die Seite ist sichtbar und du hast in den
          letzten 45 Sekunden etwas getippt, geklickt, gescrollt oder ein Video läuft. Pausen, andere Tabs und ein gesperrter
          Bildschirm zählen nicht. Die Uhr ist die des Servers, deine Geräteuhr spielt keine Rolle.
        </p>
        <ul className="platzhalter__liste">
          <li>
            <strong>Du siehst:</strong> am Ende deine eigene aktive Zeit, sonst nichts.
          </li>
          <li>
            <strong>Verantwortliche und Admin sehen:</strong> Median und Spanne des Teams, die Zeit je Person und je Verhalten.
            Auffällige Abgaben (zu schnell, sehr lang, ohne Messung) werden gekennzeichnet und zählen nicht in Median und Spanne.
            Es wird nichts verworfen und niemand wird dadurch gesperrt.
          </li>
        </ul>
      </Abschnitt>

      <Abschnitt titel="PDF-Berichte">
        <p>
          Verantwortliche und Admin können den Monatsbericht des Teams und den Bericht einer Person als <strong>PDF</strong> herunterladen.
          Das PDF entsteht in deinem Browser, die Plattform speichert keine Kopie. Jeder Abruf wird mit Name, Bericht und Monat
          protokolliert; das Protokoll sehen nur Admins.
        </p>
        <p className="klein muted">
          Die Berichte enthalten Kommentare und Namen und sind als „vertraulich“ gekennzeichnet. Bitte gib sie nur weiter, wenn es sein muss.
        </p>
      </Abschnitt>

      <Abschnitt titel="KI-Analyse im Monatsabschluss">
        <p>
          Verantwortliche und Admin können nach dem Monatsabschluss für jede Person eine <strong>Gesprächsgrundlage</strong> erstellen lassen. Alle
          Zahlen kommen aus der Datenbank; die KI formuliert nur den Text. Jede Zahl im Text wird automatisch mit den Daten verglichen.
        </p>
        <ul className="platzhalter__liste">
          <li>
            <strong>Was an die KI geht:</strong> Kennzahlen und die Kommentare der Kollegen <strong>ohne Namen und ohne Absender</strong>. Die bewertete
            Person heißt dort „die bewertete Person“, alle anderen „Kollege A, B …“. E-Mail-Adressen und Kennungen werden nicht mitgeschickt.
          </li>
          <li>
            <strong>Was daraus wird:</strong> ein Entwurf. Die Leitung liest ihn, bearbeitet ihn und gibt ihn frei. Nur eine freigegebene Analyse
            kommt in den Personenbericht (PDF).
          </li>
          <li>
            <strong>Mitarbeiter</strong> bekommen keine Analysen. Auf Wunsch sehen Verantwortliche auch ihre eigene Analyse nicht (nur der Admin).
          </li>
        </ul>
      </Abschnitt>

      {person.rolle === 'admin' && <ExportProtokoll />}
    </div>
  )
}
