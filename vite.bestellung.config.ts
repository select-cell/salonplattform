// Eigenständiger Build der Bestell-Seite (npm run build:bestellung → dist-bestellung/).
// Getrennt vom Build der Bewertungsplattform: eigener Einstieg, eigenes Ergebnis, eigene Seite bei Netlify.
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const hier = (pfad: string) => fileURLToPath(new URL(pfad, import.meta.url))

export default defineConfig({
  root: hier('./bestellung'),
  envDir: hier('.'), // liest dieselbe .env wie die Plattform
  publicDir: hier('./bestellung/public'),
  plugins: [react()],
  build: { outDir: hier('./dist-bestellung'), emptyOutDir: true },
  server: { port: 5174, strictPort: true, fs: { allow: [hier('.')] } },
})
