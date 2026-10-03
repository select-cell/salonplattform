// Prüft die Umgebungsvariablen, bevor der Supabase-Client erzeugt wird.
// So sieht man bei einer fehlenden .env eine verständliche Meldung statt einer weißen Seite.

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

function jwtRolle(token: string): string | null {
  const teile = token.split('.')
  if (teile.length !== 3) return null
  try {
    const json = atob(teile[1].replace(/-/g, '+').replace(/_/g, '/'))
    const nutzdaten = JSON.parse(json) as { role?: unknown }
    return typeof nutzdaten.role === 'string' ? nutzdaten.role : null
  } catch {
    return null
  }
}

/** Liefert eine verständliche Fehlermeldung oder null, wenn alles passt. */
export function pruefeKonfiguration(): string | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return 'VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY fehlen. Lege eine .env an (Vorlage: .env.example) bzw. hinterlege beide Variablen in Netlify und baue neu.'
  }
  if (!/^https?:\/\//.test(SUPABASE_URL)) {
    return 'VITE_SUPABASE_URL muss mit https:// beginnen.'
  }
  // Schutz vor dem schlimmsten Fehler: ein geheimer Schlüssel im Browser.
  if (SUPABASE_ANON_KEY.startsWith('sb_secret_') || jwtRolle(SUPABASE_ANON_KEY) === 'service_role') {
    return 'Achtung: Das ist der geheime service_role-Schlüssel. Er darf niemals ins Frontend. Trage den öffentlichen anon-/publishable-Key ein und tausche den service_role-Schlüssel in Supabase aus.'
  }
  return null
}

/** Projekt-Kennung aus der URL (https://<ref>.supabase.co), z. B. für Dashboard-Links. */
export function supabaseProjektRef(): string | null {
  const treffer = /^https:\/\/([a-z0-9]+)\.supabase\.(?:co|com)$/.exec(SUPABASE_URL)
  return treffer ? treffer[1] : null
}
