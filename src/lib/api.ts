// Gebündelter Datenzugriff: dünne Wrapper um supabase.rpc(...). Weitere Funktionen
// aus Plan §5.3 kommen hier mit den jeweiligen Phasen dazu.
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './konfiguration'
import { supabase } from './supabase'
import type { AbgabeStatus, Dashboard, PersonAuswertung, TeamAuswertung, Ueberfaellig, ZeitAuswertung, KommentarAuswertung } from './auswertung'
import type { Person } from './types'
import type { MonatStatus, UmfrageInhalt, UmfrageNutzdaten } from './umfrage'

/** Eigene Zeile aus `personen`; null, wenn der Login keiner Person zugeordnet ist. */
export async function holeIch(): Promise<Person | null> {
  const { data, error } = await supabase.rpc('ich').maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Person | null) ?? null
}

/** Alle Umfrage-Monate des eingeloggten Teilnehmers, neuester zuerst. Leer, wenn er nicht teilnimmt. */
export async function holeMeineMonate(): Promise<MonatStatus[]> {
  const { data, error } = await supabase.rpc('meine_monate')
  if (error) throw new Error(error.message)
  return (data ?? []) as MonatStatus[]
}

export async function holeUmfrageInhalt(): Promise<UmfrageInhalt> {
  const { data, error } = await supabase.rpc('umfrage_inhalt')
  if (error) throw new Error(error.message)
  return data as UmfrageInhalt
}

/**
 * Gibt die Umfrage ab (mit der Zeit-Sitzung, falls es eine gibt). Die Fehlermeldungen der Datenbank sind
 * bereits auf Deutsch und für Nutzer gedacht.
 */
export async function sendeUmfrage(
  nutzdaten: UmfrageNutzdaten,
  zeit?: { sitzung: string | null; aktiveSek: number; schritte: Record<string, number> },
): Promise<string> {
  const { data, error } = await supabase.rpc('umfrage_einreichen_v3', {
    payload: nutzdaten,
    p_sitzung: zeit?.sitzung ?? null,
    p_aktive_sek: zeit?.sitzung ? zeit.aktiveSek : null,
    p_schritte: zeit?.sitzung ? zeit.schritte : null,
  })
  if (error) throw new Error(error.message)
  return data as string
}

// ---- Auswertungen (Phase 3) und Abgabe-Status (Phase 4) -----------------------------

export async function holeMeineErgebnisse(): Promise<PersonAuswertung> {
  const { data, error } = await supabase.rpc('meine_ergebnisse')
  if (error) throw new Error(error.message)
  return data as PersonAuswertung
}

export async function holePersonErgebnisse(personId: string): Promise<PersonAuswertung> {
  const { data, error } = await supabase.rpc('person_ergebnisse', { p_person: personId })
  if (error) throw new Error(error.message)
  return data as PersonAuswertung
}

export async function holeTeamErgebnisse(): Promise<TeamAuswertung> {
  const { data, error } = await supabase.rpc('team_ergebnisse')
  if (error) throw new Error(error.message)
  return data as TeamAuswertung
}

/** monat = 2026-10-01; ohne Monat liefert die Datenbank den neuesten Monat mit Daten. */
export async function holeTeamDashboard(monat?: string): Promise<Dashboard> {
  const { data, error } = await supabase.rpc('team_dashboard', monat ? { p_monat: `${monat}-01` } : {})
  if (error) throw new Error(error.message)
  return data as Dashboard
}

export async function holeAbgabeStatus(): Promise<AbgabeStatus[]> {
  const { data, error } = await supabase.rpc('abgabe_status')
  if (error) throw new Error(error.message)
  return (data ?? []) as AbgabeStatus[]
}

export async function holeUeberfaellige(): Promise<Ueberfaellig[]> {
  const { data, error } = await supabase.rpc('ueberfaellige_abgaben')
  if (error) throw new Error(error.message)
  return (data ?? []) as Ueberfaellig[]
}

// ---- Zeiterfassung (Erweiterung B) --------------------------------------------------

export interface SitzungStart {
  sitzung: string
  aktive_sek: number
  schritte: Record<string, number>
  wiederaufgenommen: boolean
}

/** Beginnt oder setzt die Zeit-Sitzung fort. neu = true beendet eine laufende und beginnt eine neue. */
export async function starteUmfrageSitzung(monat: string, neu = false): Promise<SitzungStart> {
  const { data, error } = await supabase.rpc('umfrage_starten', { p_monat: `${monat}-01`, p_neu: neu })
  if (error) throw new Error(error.message)
  return data as SitzungStart
}

export async function sendeHerzschlag(sitzung: string, aktiveSek: number, schritte: Record<string, number>) {
  const { data, error } = await supabase.rpc('umfrage_heartbeat', {
    p_sitzung: sitzung,
    p_aktive_sek: aktiveSek,
    p_schritte: schritte,
  })
  if (error) throw new Error(error.message)
  return data as { aktive_sek: number; status: string }
}

/** Letzter Herzschlag beim Ausblenden oder Schließen: überlebt das Schließen der Seite (fetch mit keepalive). */
export function sendeHerzschlagBeimSchliessen(
  zugangstoken: string,
  sitzung: string,
  aktiveSek: number,
  schritte: Record<string, number>,
): void {
  try {
    void fetch(`${SUPABASE_URL}/rest/v1/rpc/umfrage_heartbeat`, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${zugangstoken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_sitzung: sitzung, p_aktive_sek: aktiveSek, p_schritte: schritte }),
    }).catch(() => undefined)
  } catch {
    // ohne Netz bleibt der Zählerstand im Browser und wird beim nächsten Herzschlag nachgeholt
  }
}

export async function holeMeineAusfuellzeit(monat: string): Promise<{ aktive_sek: number } | null> {
  const { data, error } = await supabase.rpc('meine_ausfuellzeit', { p_monat: `${monat}-01` })
  if (error) throw new Error(error.message)
  return (data as { aktive_sek: number } | null) ?? null
}

export async function holeZeitAuswertung(monat?: string): Promise<ZeitAuswertung> {
  const { data, error } = await supabase.rpc('zeit_auswertung', monat ? { p_monat: `${monat}-01` } : {})
  if (error) throw new Error(error.message)
  return data as ZeitAuswertung
}

// ---- Kommentar-Auswertung (Erweiterung D) -------------------------------------------

export async function holeKommentarAuswertung(monat?: string): Promise<KommentarAuswertung> {
  const { data, error } = await supabase.rpc('kommentar_auswertung', monat ? { p_monat: `${monat}-01` } : {})
  if (error) throw new Error(error.message)
  return data as KommentarAuswertung
}
