// Gebündelter Datenzugriff: dünne Wrapper um supabase.rpc(...). Weitere Funktionen
// aus Plan §5.3 kommen hier mit den jeweiligen Phasen dazu.
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './konfiguration'
import { supabase } from './supabase'
import type { AbgabeStatus, Dashboard, PersonAuswertung, TeamAuswertung, Ueberfaellig, ZeitAuswertung, KommentarAuswertung } from './auswertung'
import type { AgendaDaten, AgendaZeile, FokusListe, Rhythmus, TerminListe } from './agenda'
import type { AbschlussInfo, AbschlussUebersicht, Analyse, AnalyseErgebnis } from './abschluss'
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

// ---- PDF-Export (Erweiterung C) -------------------------------------------------------

export async function holePdfMonatsbericht(monat: string): Promise<import('../pdf/Monatsbericht').MonatsberichtDaten> {
  const { data, error } = await supabase.rpc('pdf_monatsbericht', { p_monat: `${monat}-01` })
  if (error) throw new Error(error.message)
  return data as import('../pdf/Monatsbericht').MonatsberichtDaten
}

export async function holePdfPersonenbericht(personId: string, monat: string): Promise<import('../pdf/Personenbericht').PersonenberichtDaten> {
  const { data, error } = await supabase.rpc('pdf_personenbericht', { p_person: personId, p_monat: `${monat}-01` })
  if (error) throw new Error(error.message)
  return data as import('../pdf/Personenbericht').PersonenberichtDaten
}

export interface PdfProtokollZeile {
  erstellt_am: string
  von: string
  art: 'monatsbericht' | 'personenbericht'
  /** „2026-10“ */
  monat: string
  /** Name der Person beim Personenbericht, sonst null */
  ziel: string | null
}

export async function holePdfProtokoll(limit = 50): Promise<PdfProtokollZeile[]> {
  const { data, error } = await supabase.rpc('pdf_export_protokoll', { p_limit: limit })
  if (error) throw new Error(error.message)
  return (data ?? []) as PdfProtokollZeile[]
}

// ---- Monatsabschluss und Einzelanalyse (Erweiterung E) -------------------------------------------

export async function holeAbschlussUebersicht(monat?: string): Promise<AbschlussUebersicht> {
  const { data, error } = await supabase.rpc('abschluss_uebersicht', monat ? { p_monat: `${monat}-01` } : {})
  if (error) throw new Error(error.message)
  return data as AbschlussUebersicht
}

export async function schliesseMonatAb(monat: string): Promise<AbschlussInfo> {
  const { data, error } = await supabase.rpc('monat_abschliessen', { p_monat: `${monat}-01` })
  if (error) throw new Error(error.message)
  return data as AbschlussInfo
}

export async function holeAnalyse(personId: string, monat: string): Promise<Analyse | null> {
  const { data, error } = await supabase.rpc('analyse_lesen', { p_person: personId, p_monat: `${monat}-01` })
  if (error) throw new Error(error.message)
  return (data as Analyse | null) ?? null
}

export async function bearbeiteAnalyse(personId: string, monat: string, text: string): Promise<Analyse> {
  const { data, error } = await supabase.rpc('analyse_bearbeiten', { p_person: personId, p_monat: `${monat}-01`, p_text: text })
  if (error) throw new Error(error.message)
  return data as Analyse
}

export async function gibAnalyseFrei(personId: string, monat: string, frei = true): Promise<Analyse> {
  const { data, error } = await supabase.rpc('analyse_freigeben', { p_person: personId, p_monat: `${monat}-01`, p_freigeben: frei })
  if (error) throw new Error(error.message)
  return data as Analyse
}

/**
 * Lässt die KI eine Analyse formulieren (Edge Function `analyse-erstellen`, mit der Anmeldung der Leitung).
 * Gleiche Daten wie beim letzten Mal ergeben keinen neuen KI-Aufruf, außer `neu` ist gesetzt.
 */
export async function erstelleAnalyse(personId: string, monat: string, neu = false): Promise<AnalyseErgebnis> {
  const { data, error } = await supabase.functions.invoke('analyse-erstellen', { body: { person_id: personId, monat, neu } })
  if (error) {
    let meldung = 'Die Analyse konnte nicht erstellt werden.'
    const antwort = (error as { context?: unknown }).context
    if (antwort instanceof Response) {
      try {
        const j = (await antwort.json()) as { fehler?: unknown }
        if (typeof j.fehler === 'string' && j.fehler) meldung = j.fehler
      } catch {
        // Antwort ohne lesbaren Inhalt: bei der allgemeinen Meldung bleiben
      }
    }
    throw new Error(meldung)
  }
  const r = data as { ok?: boolean; fehler?: string } & Partial<AnalyseErgebnis>
  if (!r?.ok || !r.analyse) throw new Error(r?.fehler ?? 'Die Analyse konnte nicht erstellt werden.')
  return { uebersprungen: !!r.uebersprungen, versuche: r.versuche ?? 0, analyse: r.analyse }
}

// ---- Fokus, Agenda und Termine (Erweiterung F) --------------------------------------------------

export async function holeFokus(): Promise<FokusListe> {
  const { data, error } = await supabase.rpc('fokus_liste')
  if (error) throw new Error(error.message)
  return data as FokusListe
}

export async function schalteFokus(verhaltenId: string, an: boolean, begruendung?: string, bis?: string | null): Promise<FokusListe> {
  const { data, error } = await supabase.rpc('fokus_umschalten', {
    p_verhalten: verhaltenId,
    p_an: an,
    p_begruendung: begruendung ?? null,
    p_bis: bis || null,
  })
  if (error) throw new Error(error.message)
  return data as FokusListe
}

export async function holeAgenda(monat: string): Promise<AgendaZeile | null> {
  const { data, error } = await supabase.rpc('agenda_lesen', { p_monat: `${monat}-01` })
  if (error) throw new Error(error.message)
  return (data as AgendaZeile | null) ?? null
}

export async function erzeugeAgenda(monat: string, neu = false): Promise<AgendaZeile> {
  const { data, error } = await supabase.rpc('agenda_erzeugen', { p_monat: `${monat}-01`, p_neu: neu })
  if (error) throw new Error(error.message)
  return data as AgendaZeile
}

export async function bearbeiteAgenda(monat: string, agenda: AgendaDaten): Promise<AgendaZeile> {
  const { data, error } = await supabase.rpc('agenda_bearbeiten', { p_monat: `${monat}-01`, p_agenda: agenda })
  if (error) throw new Error(error.message)
  return data as AgendaZeile
}

export async function gibAgendaFrei(monat: string, frei = true): Promise<AgendaZeile> {
  const { data, error } = await supabase.rpc('agenda_freigeben', { p_monat: `${monat}-01`, p_freigeben: frei })
  if (error) throw new Error(error.message)
  return data as AgendaZeile
}

export async function holeTermine(): Promise<TerminListe> {
  const { data, error } = await supabase.rpc('termine_liste')
  if (error) throw new Error(error.message)
  return data as TerminListe
}

export interface TerminEingabe {
  id: string | null
  startetLokal: string
  titel: string
  /** „2026-09“ oder leer = Monat vor dem Termin */
  bezugsmonat: string
  vorlaufTage: number[]
  erinnerungStunden: number[]
  adminInKopie: boolean
  mailsPausiert: boolean
}

export async function speichereTermin(t: TerminEingabe): Promise<void> {
  const { error } = await supabase.rpc('termin_speichern', {
    p_id: t.id,
    p_startet_lokal: t.startetLokal,
    p_titel: t.titel,
    p_bezugsmonat: t.bezugsmonat ? `${t.bezugsmonat}-01` : null,
    p_vorlauf_tage: t.vorlaufTage,
    p_erinnerung_stunden: t.erinnerungStunden,
    p_admin_in_kopie: t.adminInKopie,
    p_mails_pausiert: t.mailsPausiert,
  })
  if (error) throw new Error(error.message)
}

export async function speichereSerie(
  t: Omit<TerminEingabe, 'id' | 'bezugsmonat' | 'mailsPausiert'> & { rhythmus: Rhythmus; anzahl: number },
): Promise<void> {
  const { error } = await supabase.rpc('termine_serie', {
    p_startet_lokal: t.startetLokal,
    p_rhythmus: t.rhythmus,
    p_anzahl: t.anzahl,
    p_titel: t.titel,
    p_vorlauf_tage: t.vorlaufTage,
    p_erinnerung_stunden: t.erinnerungStunden,
    p_admin_in_kopie: t.adminInKopie,
  })
  if (error) throw new Error(error.message)
}

export async function entferneTermin(id: string): Promise<void> {
  const { error } = await supabase.rpc('termin_entfernen', { p_id: id })
  if (error) throw new Error(error.message)
}
