// Einstellungen des Bestellsystems aus den Umgebungsvariablen (werden beim Bauen eingebacken).
// Bewusst getrennt von konfiguration.ts: Die Bewertungsplattform kennt diese Werte nicht.

/** Adresse des n8n-Webhooks; ohne sie zeigt die Seite beim Absenden eine freundliche Fehlermeldung */
export const BESTELL_WEBHOOK_URL = (import.meta.env.VITE_BESTELL_WEBHOOK_URL ?? '').trim()

function webLink(wert: string | undefined): string | null {
  const link = (wert ?? '').trim()
  return /^(https:\/\/|\/(?!\/))/.test(link) ? link : null
}

export const IMPRESSUM_URL = webLink(import.meta.env.VITE_IMPRESSUM_URL)
export const DATENSCHUTZ_URL = webLink(import.meta.env.VITE_DATENSCHUTZ_URL)
