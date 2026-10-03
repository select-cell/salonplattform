// Gebündelter Datenzugriff: dünne Wrapper um supabase.rpc(...). Weitere Funktionen
// aus Plan §5.3 kommen hier mit den jeweiligen Phasen dazu.
import { supabase } from './supabase'
import type { AbgabeStatus, Dashboard, PersonAuswertung, TeamAuswertung, Ueberfaellig } from './auswertung'
import type { Person } from './types'
import type { MonatStatus, UmfrageInhalt, UmfrageNutzdaten } from './umfrage'

/** Eigene Zeile aus `personen`; null, wenn der Login keiner Person zugeordnet ist. */
export async function holeIch(): Promise<Person | null> {
  const { data, error } = await supabase.rpc('ich').maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Person | null) ?? null
}

/** Alle Umfrage-Monate der eingeloggten Teilnehmerin, neuester zuerst. Leer, wenn sie nicht teilnimmt. */
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

/** Gibt die Umfrage ab. Die Fehlermeldungen der Datenbank sind bereits auf Deutsch und für Nutzer gedacht. */
export async function sendeUmfrage(nutzdaten: UmfrageNutzdaten): Promise<string> {
  const { data, error } = await supabase.rpc('umfrage_einreichen_v2', { payload: nutzdaten })
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
