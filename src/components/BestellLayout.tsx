import type { ReactNode } from 'react'
import logo from '../assets/logo-dawiid.png'
import { DATENSCHUTZ_URL, IMPRESSUM_URL } from '../lib/bestellKonfiguration'
import { ThemaSchalter } from './ThemaSchalter'

/**
 * Rahmen der Gäste-Seite. Bewusst ohne „Anmelden“ und ohne Link in die Team-Plattform:
 * Gäste sollen nur anfordern, nicht in den Mitarbeiterbereich geraten.
 */
export function BestellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="seite">
      <header className="kopf">
        <div className="container kopf__innen">
          <img className="marke__logo" src={logo} alt="Dawiid" width={212} height={86} />
          <ThemaSchalter />
        </div>
      </header>
      <main className="seite__inhalt bestell">{children}</main>
      <footer className="fuss">
        <div className="container fuss__innen">
          <span>Dawiid</span>
          {(IMPRESSUM_URL || DATENSCHUTZ_URL) && (
            <span className="fuss__links">
              {IMPRESSUM_URL && <a href={IMPRESSUM_URL}>Impressum</a>}
              {DATENSCHUTZ_URL && <a href={DATENSCHUTZ_URL}>Datenschutz</a>}
            </span>
          )}
        </div>
      </footer>
    </div>
  )
}
