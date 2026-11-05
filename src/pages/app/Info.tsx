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
    </div>
  )
}
