// MUSS das erste Modul sein, das main.tsx importiert.
//
// Wenn ein Magic Link abgelaufen ist, hängt Supabase den Fehler an die URL
// (#error=access_denied&error_code=otp_expired&…). Der Supabase-Client liest die
// URL beim Start und kann sie danach bereinigen. Deshalb halten wir den Fehler
// hier fest, bevor der Client geladen wird.

export interface UrlFehler {
  code: string
  beschreibung: string
}

function lese(): UrlFehler | null {
  if (typeof window === 'undefined') return null
  const parameter = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  for (const [schluessel, wert] of new URLSearchParams(window.location.search)) {
    if (!parameter.has(schluessel)) parameter.set(schluessel, wert)
  }
  if (!parameter.has('error') && !parameter.has('error_code')) return null
  return {
    code: parameter.get('error_code') ?? parameter.get('error') ?? 'unbekannt',
    beschreibung: parameter.get('error_description') ?? '',
  }
}

export const urlFehlerBeimStart: UrlFehler | null = lese()
