// Einstieg der eigenständigen Bestell-Seite (npm run build:bestellung).
// Enthält nur die Gäste-Seite: kein Login, keine Bewertungsplattform, keine Diagramme.
// Dieselben Dateien wie die Plattform nutzt sie nur für Design (Tokens, Basis-Styles) und die Speisekarte.
import '@fontsource/dm-serif-display/latin-400.css'
import '@fontsource-variable/dm-sans'
import '../styles/tokens.css'
import '../styles/base.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { pruefeKonfiguration } from '../lib/konfiguration'
import Bestellen from '../pages/Bestellen'

const wurzel = createRoot(document.getElementById('root')!)
const konfigFehler = pruefeKonfiguration()

if (konfigFehler) {
  wurzel.render(
    <main className="zentriert">
      <div className="zentriert__box">
        <section className="karte stack" role="alert">
          <h1 style={{ fontSize: '1.75rem' }}>Einrichtung unvollständig</h1>
          <p className="hinweis hinweis--fehler">{konfigFehler}</p>
        </section>
      </div>
    </main>,
  )
} else {
  wurzel.render(
    <StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="p" element={<Bestellen />} />
          <Route path="p/:platz" element={<Bestellen />} />
          {/* Alles andere (auch die Startseite): Hinweis, den QR-Code am Platz zu scannen */}
          <Route path="*" element={<Bestellen />} />
        </Routes>
      </BrowserRouter>
    </StrictMode>,
  )
}
