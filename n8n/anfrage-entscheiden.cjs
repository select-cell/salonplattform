// n8n · Code-Node „Entscheiden“ (Modus: Run Once for All Items, Sprache: JavaScript)
// Diese Datei komplett in den Code-Node kopieren. Anleitung: n8n/README.md
//
// Der Node bekommt die Anfrage vom Webhook und die Ergebnisse der vier Supabase-Abfragen und
// entscheidet: absenden, als Doppelung bestätigen, wegen Sperre ablehnen oder als ungültig abweisen.
// Er baut außerdem die Telegram-Nachricht und die Daten für den Speicher-Zweig.
// Eine Abfrage, die fehlschlug (Supabase nicht erreichbar), wird übersprungen: Die Anfrage läuft
// dann mit der Notkarte weiter, die Telegram-Nachricht geht immer raus.
//
// Getestet mit: node --test n8n/*.test.mjs

// ---- Einstellungen: hier ändern ---------------------------------------------------------------------
const EINSTELLUNGEN = {
  SPERRE_SEKUNDEN: 60, // Sperre pro Platz nach einer Anfrage
  MENGE_MAX: 10, // je Artikel
  POSITIONEN_MAX: 20, // Schutz gegen übergroße Anfragen
  // Notkarte: gilt, wenn Supabase nicht antwortet. Muss zur Notkarte im Frontend passen
  // (src/lib/bestellung.ts: NOTKARTE und NOTFALL_PLAETZE).
  NOTKARTE: [
    { id: 'wasser', name: 'Wasser', kategorie: 'getraenk' },
    { id: 'apfelschorle', name: 'Apfelschorle', kategorie: 'getraenk' },
  ],
  NOTFALL_PLAETZE: [1, 2, 3, 4, 5, 6, 7],
  // Reihenfolge und Anzeigenamen der Kategorien in der Nachricht. Unbekannte kommen danach.
  KATEGORIEN: { getraenk: 'Getränke', decke: 'Decke', essen: 'Essen' },
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const fehler = (grund) => ({ senden: false, status: 400, antwort: { ok: false, grund } })

/**
 * @param {object} eingabe
 * @param {unknown} eingabe.body      Body der Webhook-Anfrage
 * @param {object[]|null} eingabe.plaetze   aktive Plätze aus Supabase, null = Abfrage fehlgeschlagen
 * @param {object[]|null} eingabe.artikel   aktive Artikel (nach sortierung), null = fehlgeschlagen
 * @param {object[]|null} eingabe.letzte    neueste Anfrage dieses Platzes (höchstens eine Zeile), null = fehlgeschlagen
 * @param {object[]|null} eingabe.doppelt   Zeile mit dieser anfrage_id, falls vorhanden, null = fehlgeschlagen
 * @param {number} [eingabe.jetzt]    Zeitpunkt in ms (für Tests)
 */
function entscheide({ body, plaetze, artikel, letzte, doppelt, jetzt = Date.now() }, einst = EINSTELLUNGEN) {
  // ---- 1. Form der Anfrage ------------------------------------------------------------------------
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return fehler('ungueltig')
  if (typeof body.anfrage_id !== 'string' || !UUID.test(body.anfrage_id)) return fehler('ungueltige_anfrage_id')
  if (body.typ !== 'anfrage') return fehler('ungueltiger_typ')
  if (!Number.isInteger(body.platz) || body.platz < 1 || body.platz > 999) return fehler('ungueltiger_platz')
  if (!Array.isArray(body.positionen) || body.positionen.length === 0) return fehler('keine_positionen')
  if (body.positionen.length > einst.POSITIONEN_MAX) return fehler('zu_viele_positionen')

  // Gleiche Artikel zu einer Position zusammenführen (Mengen addieren)
  const mengen = new Map()
  for (const position of body.positionen) {
    if (typeof position !== 'object' || position === null) return fehler('ungueltige_position')
    if (typeof position.artikel !== 'string' || !/^[a-z0-9_]+$/.test(position.artikel)) return fehler('ungueltiger_artikel')
    if (!Number.isInteger(position.menge) || position.menge < 1 || position.menge > einst.MENGE_MAX) {
      return fehler('ungueltige_menge')
    }
    mengen.set(position.artikel, (mengen.get(position.artikel) ?? 0) + position.menge)
  }
  if ([...mengen.values()].some((menge) => menge > einst.MENGE_MAX)) return fehler('ungueltige_menge')

  const anfrageId = body.anfrage_id.toLowerCase()
  const platz = body.platz

  // ---- 2. Platz und Artikel gegen die Karte prüfen -------------------------------------------------
  // Leere Antwort zählt wie ein Ausfall: „keine aktiven Plätze/Artikel“ ist eine Fehleinstellung,
  // und die Anfrage soll trotzdem ankommen.
  const platzKarte = plaetze?.length ? plaetze.map((p) => Number(p.platz)) : einst.NOTFALL_PLAETZE
  const artikelKarte = artikel?.length ? artikel : einst.NOTKARTE
  if (!platzKarte.includes(platz)) return fehler('platz_unbekannt')

  const positionen = []
  for (const [artikelId, menge] of mengen) {
    const index = artikelKarte.findIndex((a) => a.id === artikelId)
    if (index === -1) return fehler('artikel_unbekannt')
    positionen.push({ ...artikelKarte[index], menge, index })
  }
  positionen.sort((a, b) => a.index - b.index) // Reihenfolge der Karte

  // ---- 3. Doppelung vor Sperre ----------------------------------------------------------------------
  // Kam die Antwort auf eine erste Anfrage nie an, wiederholt der Gast mit derselben ID. Dann soll er
  // die Bestätigung sehen statt „gesperrt“, und es geht keine zweite Nachricht raus.
  const ok = { ok: true, sperre_sekunden: einst.SPERRE_SEKUNDEN }
  if (doppelt?.length) return { senden: false, status: 200, antwort: ok }

  // ---- 4. Sperre pro Platz ---------------------------------------------------------------------------
  const zuletzt = letzte?.length ? Date.parse(letzte[0].erstellt_am) : NaN
  if (Number.isFinite(zuletzt)) {
    const vergangen = (jetzt - zuletzt) / 1000
    if (vergangen < einst.SPERRE_SEKUNDEN) {
      // Status 200, damit der Browser die Antwort auch bei fehlenden CORS-Kopfzeilen sicher liest
      const warte = Math.max(1, Math.ceil(einst.SPERRE_SEKUNDEN - vergangen))
      return { senden: false, status: 200, antwort: { ok: false, grund: 'gesperrt', warte_sekunden: warte } }
    }
  }

  // ---- 5. Absenden ---------------------------------------------------------------------------------------
  return {
    senden: true,
    status: 200,
    antwort: ok,
    text: baueText(platz, positionen, einst),
    speichern: {
      anfrage: { id: anfrageId, platz, typ: 'anfrage' },
      positionen: positionen.map((p) => ({ anfrage_id: anfrageId, artikel_id: p.id, menge: p.menge })),
    },
  }
}

/** „Platz 4: 2× Wasser, 1× Apfelschorle“, bei mehreren Kategorien zeilenweise je Kategorie */
function baueText(platz, positionen, einst) {
  const gruppen = new Map()
  for (const p of positionen) {
    const liste = gruppen.get(p.kategorie) ?? []
    liste.push(`${p.menge}× ${p.name}`)
    gruppen.set(p.kategorie, liste)
  }
  if (gruppen.size === 1) return `Platz ${platz}: ${[...gruppen.values()][0].join(', ')}`

  const bekannt = Object.keys(einst.KATEGORIEN)
  const reihenfolge = [
    ...bekannt.filter((k) => gruppen.has(k)),
    ...[...gruppen.keys()].filter((k) => !bekannt.includes(k)),
  ]
  const zeilen = reihenfolge.map((k) => `${einst.KATEGORIEN[k] ?? k.charAt(0).toUpperCase() + k.slice(1)}: ${gruppen.get(k).join(', ')}`)
  return [`Platz ${platz} wünscht:`, ...zeilen].join('\n')
}

// ---- n8n-Teil: nur aktiv, wenn der Code in n8n läuft ------------------------------------------------------
// Die Namen der Nodes müssen genau so heißen (siehe n8n/README.md).
if (typeof $input !== 'undefined') {
  // Ergebnis einer Supabase-Abfrage: null bei Fehler, sonst die Zeilen. Mit „Always Output Data“
  // liefert eine leere Abfrage ein leeres Objekt, das hier herausfällt.
  // Ein Fehler kommt als Item mit dem Schlüssel „error“, dessen Wert auch leer sein kann (Verbindungsabbruch):
  // deshalb zählt schon das Vorhandensein des Schlüssels.
  const lies = (node) => {
    try {
      const items = $(node).all()
      if (items.some((i) => i.json && 'error' in i.json)) return null
      return items.map((i) => i.json).filter((zeile) => zeile && Object.keys(zeile).length > 0)
    } catch (e) {
      return null // Node nicht gelaufen
    }
  }
  return [
    {
      json: entscheide({
        body: $('Webhook').first().json.body,
        plaetze: lies('Plaetze laden'),
        artikel: lies('Artikel laden'),
        letzte: lies('Letzte Anfrage am Platz'),
        doppelt: lies('Doppelte Anfrage pruefen'),
      }),
    },
  ]
}

if (typeof module !== 'undefined') module.exports = { entscheide, baueText, EINSTELLUNGEN }
