// Muss zuerst kommen: hält URL-Fehler eines Magic Links fest, bevor Supabase die URL liest.
import './lib/urlFehler'

import '@fontsource/dm-serif-display/latin-400.css'
import '@fontsource-variable/dm-sans'
import './styles/tokens.css'
import './styles/base.css'
import './styles/umfrage.css'
import './styles/auswertung.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { pruefeKonfiguration } from './lib/konfiguration'

async function start() {
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
    return
  }

  // Erst jetzt laden: das Modul erzeugt den Supabase-Client.
  const { default: App } = await import('./App')
  wurzel.render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
}

void start()
