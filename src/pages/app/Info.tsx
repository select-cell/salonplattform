import type { ReactNode } from 'react'
import { MARKE } from '../../config/brand'

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="karte stack-s" aria-label={titel}>
      <h2 className="abschnitt-titel">{titel}</h2>
      {children}
    </section>
  )
}

/**
 * /app/info: „Info und Datenschutz“. Jede Erweiterung, die Daten anders nutzt, ergänzt hier einen Absatz.
 */
export default function Info() {
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
    </div>
  )
}
