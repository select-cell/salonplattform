// Bestellsystem „Jetzt anfordern“: Typen, Texte und Logik ohne Oberfläche und ohne Netzwerk
// (docs/bestellsystem.md). Gäste wählen am Platz aus und senden einmal ab; die Anfrage geht an
// den n8n-Webhook, nie direkt an Telegram.

/** Text des Hauptbuttons */
export const HAUPTBUTTON_TEXT = 'Jetzt anfordern'

export const MENGE_MAX = 10
/** Sperre nach einer Anfrage, solange n8n keine eigene Zahl mitschickt (n8n-Variable SPERRE_SEKUNDEN) */
export const SPERRE_SEKUNDEN_STANDARD = 60
export const ZEITLIMIT_SENDEN_MS = 10_000
export const ZEITLIMIT_KARTE_MS = 5_000

export const TEXTE = {
  platzUngueltig: 'Bitte scanne den QR-Code an deinem Platz erneut.',
  fehler: 'Das hat gerade nicht geklappt. Bitte sprich kurz das Team an.',
  gesperrt: 'Deine letzte Anfrage ist gerade angekommen. Bitte einen Moment warten.',
  leereKarte: 'Gerade ist nichts verfügbar. Bitte sprich kurz das Team an.',
  nichtEingerichtet: 'Anfragen sind gerade nicht möglich. Bitte sprich kurz das Team an.',
  bestaetigung:
    'Dein Team ist informiert, es kommt gleich jemand vorbei. Für Änderungen sprich kurz das Team an.',
} as const

export interface Artikel {
  id: string
  name: string
  kategorie: string
}

/**
 * Notkarte: gilt, wenn Supabase nicht antwortet (Gratisprojekte pausieren). n8n kennt dieselbe
 * Karte, damit die Anfrage trotzdem ankommt. Beim Ändern der Artikel beide Stellen anpassen.
 */
export const NOTKARTE: readonly Artikel[] = [
  { id: 'wasser', name: 'Wasser', kategorie: 'getraenk' },
  { id: 'apfelschorle', name: 'Apfelschorle', kategorie: 'getraenk' },
]

/** Plätze, die ohne Supabase als gültig gelten */
export const NOTFALL_PLAETZE: readonly number[] = [1, 2, 3, 4, 5, 6, 7]

/** Menge je Artikel-ID. Artikel ohne Menge fehlen im Objekt, so entsteht je Artikel eine Position. */
export type Auswahl = Readonly<Record<string, number>>

export interface Position {
  artikel: string
  menge: number
}

export interface Nutzdaten {
  anfrage_id: string
  typ: 'anfrage'
  platz: number
  positionen: Position[]
}

/** Platznummer aus dem Link (/p/4 oder ?platz=4); null bei allem, was keine Platznummer ist */
export function platzAusUrl(roh: string | null | undefined): number | null {
  if (!roh || !/^[1-9]\d{0,2}$/.test(roh)) return null
  return Number(roh)
}

/**
 * Ist der Platz gültig? `bekannt` kommt aus der Tabelle `plaetze`: true = steht drin,
 * false = Tabelle erreichbar, Platz fehlt, null = Tabelle nicht erreichbar (dann die Notfall-Plätze).
 */
export function istPlatzGueltig(platz: number, bekannt: boolean | null): boolean {
  return bekannt ?? NOTFALL_PLAETZE.includes(platz)
}

/** Menge um `schritt` ändern, begrenzt auf 0 bis MENGE_MAX; bei 0 verschwindet der Artikel */
export function aendereMenge(auswahl: Auswahl, artikelId: string, schritt: number): Auswahl {
  const neu = Math.min(MENGE_MAX, Math.max(0, (auswahl[artikelId] ?? 0) + schritt))
  const { [artikelId]: _alt, ...rest } = auswahl
  return neu === 0 ? rest : { ...rest, [artikelId]: neu }
}

/** Anzahl aller gewählten Stücke („3 Artikel“) */
export function anzahlStuecke(auswahl: Auswahl): number {
  return Object.values(auswahl).reduce((summe, menge) => summe + menge, 0)
}

/** Positionen in der Reihenfolge der Karte; unbekannte Artikel und Mengen unter 1 fallen weg */
export function positionenAusAuswahl(auswahl: Auswahl, karte: readonly Artikel[]): Position[] {
  return karte
    .filter((artikel) => (auswahl[artikel.id] ?? 0) > 0)
    .map((artikel) => ({ artikel: artikel.id, menge: Math.min(MENGE_MAX, auswahl[artikel.id]) }))
}

export function neueAnfrageId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // Ältere Browser ohne randomUUID: Version-4-UUID aus Zufallsbytes
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export interface IdMerker {
  id: string
  schluessel: string
}

/**
 * Dieselbe anfrage_id für Wiederholungen derselben Anfrage (Netzwerkfehler, Doppelklick), damit n8n
 * keine zweite Nachricht schickt. Ändert der Gast die Auswahl, ist es eine neue Anfrage mit neuer ID:
 * sonst würde eine angekommene, aber unbeantwortete Anfrage die geänderte verschlucken.
 */
export function anfrageIdFuer(
  vorher: IdMerker | null,
  platz: number,
  positionen: readonly Position[],
  erzeuge: () => string = neueAnfrageId,
): IdMerker {
  const schluessel = JSON.stringify([platz, positionen])
  return vorher?.schluessel === schluessel ? vorher : { id: erzeuge(), schluessel }
}

export type Antwort =
  | { art: 'ok'; sperreSekunden: number }
  | { art: 'gesperrt'; warteSekunden: number }
  | { art: 'fehler'; grund: string }

function sekunden(wert: unknown): number | null {
  return typeof wert === 'number' && Number.isFinite(wert) && wert > 0 ? Math.min(3600, Math.ceil(wert)) : null
}

/** Antwort des Webhooks (Plan §6) lesen; null, wenn sie nicht wie eine Antwort aussieht */
export function leseAntwort(body: unknown): Antwort | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  if (b.ok === true) {
    return { art: 'ok', sperreSekunden: sekunden(b.sperre_sekunden) ?? SPERRE_SEKUNDEN_STANDARD }
  }
  if (b.ok === false) {
    if (b.grund === 'gesperrt') {
      return { art: 'gesperrt', warteSekunden: sekunden(b.warte_sekunden) ?? SPERRE_SEKUNDEN_STANDARD }
    }
    return { art: 'fehler', grund: typeof b.grund === 'string' ? b.grund : 'unbekannt' }
  }
  return null
}

/** Restzeit als „0:45“ */
export function formatiereRest(sekundenRest: number): string {
  const s = Math.max(0, Math.ceil(sekundenRest))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
