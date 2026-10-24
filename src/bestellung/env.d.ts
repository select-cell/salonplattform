// Umgebungsvariablen des Bestellsystems. Ergänzt die Typen aus src/vite-env.d.ts,
// ohne diese Datei der Bewertungsplattform anzufassen.
interface ImportMetaEnv {
  readonly VITE_BESTELL_WEBHOOK_URL?: string
  readonly VITE_IMPRESSUM_URL?: string
  readonly VITE_DATENSCHUTZ_URL?: string
}
