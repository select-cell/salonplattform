// Eigenständiger Build der Bestell-Seite (npm run build:bestellung → dist-bestellung/).
// Getrennt vom Build der Bewertungsplattform: eigener Einstieg, eigenes Ergebnis, eigene Seite bei Netlify.
//
// Zwei Ausführungen:
//   Produktiv:   npm run build:bestellung        → dist-bestellung/       (für die QR-Codes im Salon)
//   Testversion: npm run build:bestellung:test   → dist-bestellung-test/  (Startseite mit Platzauswahl,
//                                                  Hinweisband, kein QR-Code nötig)
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const hier = (pfad: string) => fileURLToPath(new URL(pfad, import.meta.url))

export default defineConfig(({ mode }) => {
  const testversion = mode === 'testversion'
  return {
    root: hier('./bestellung'),
    envDir: hier('.'), // liest dieselbe .env wie die Plattform
    publicDir: hier('./bestellung/public'),
    plugins: [react()],
    // Wird beim Bauen eingesetzt; im produktiven Build verschwindet der gesamte Test-Code
    define: { __TESTVERSION__: JSON.stringify(testversion) },
    build: { outDir: hier(testversion ? './dist-bestellung-test' : './dist-bestellung'), emptyOutDir: true },
    server: { port: 5174, strictPort: true, fs: { allow: [hier('.')] } },
  }
})
