// Tests für den n8n-Code-Node. Ausführen: node --test n8n/*.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'
import vm from 'node:vm'

const { entscheide, EINSTELLUNGEN } = createRequire(import.meta.url)('./anfrage-entscheiden.cjs')

const ID = '0b9a6f0e-3c1d-4e0a-9f55-2a1c7d8e4b10'
const JETZT = Date.parse('2026-10-24T18:00:00Z')

const PLAETZE = [1, 2, 3, 4, 5, 6, 7].map((platz) => ({ platz }))
const ARTIKEL = [
  { id: 'wasser', name: 'Wasser', kategorie: 'getraenk' },
  { id: 'apfelschorle', name: 'Apfelschorle', kategorie: 'getraenk' },
  { id: 'decke', name: 'Decke', kategorie: 'decke' },
  { id: 'kuchen', name: 'Kuchen', kategorie: 'essen' },
]

const anfrage = (aenderung = {}) => ({
  anfrage_id: ID,
  typ: 'anfrage',
  platz: 4,
  positionen: [
    { artikel: 'wasser', menge: 2 },
    { artikel: 'apfelschorle', menge: 1 },
  ],
  ...aenderung,
})

/** Alles gut, Supabase erreichbar, keine Sperre, keine Doppelung */
const lauf = (body, rest = {}) =>
  entscheide({ body, plaetze: PLAETZE, artikel: ARTIKEL, letzte: [], doppelt: [], jetzt: JETZT, ...rest })

describe('Absenden', () => {
  it('Beispiel aus dem Vertrag: Text, Antwort und Speicherdaten', () => {
    const r = lauf(anfrage())
    assert.equal(r.senden, true)
    assert.equal(r.status, 200)
    assert.equal(r.text, 'Platz 4: 2× Wasser, 1× Apfelschorle')
    assert.deepEqual(r.antwort, { ok: true, sperre_sekunden: 60 })
    assert.deepEqual(r.speichern.anfrage, { id: ID, platz: 4, typ: 'anfrage' })
    assert.deepEqual(r.speichern.positionen, [
      { anfrage_id: ID, artikel_id: 'wasser', menge: 2 },
      { anfrage_id: ID, artikel_id: 'apfelschorle', menge: 1 },
    ])
  })

  it('gleiche Artikel in mehreren Positionen werden zusammengeführt', () => {
    const r = lauf(anfrage({ positionen: [{ artikel: 'wasser', menge: 2 }, { artikel: 'wasser', menge: 3 }] }))
    assert.equal(r.text, 'Platz 4: 5× Wasser')
    assert.deepEqual(r.speichern.positionen, [{ anfrage_id: ID, artikel_id: 'wasser', menge: 5 }])
  })

  it('Reihenfolge der Karte, nicht der Anfrage', () => {
    const r = lauf(anfrage({ positionen: [{ artikel: 'apfelschorle', menge: 1 }, { artikel: 'wasser', menge: 1 }] }))
    assert.equal(r.text, 'Platz 4: 1× Wasser, 1× Apfelschorle')
  })

  it('anfrage_id in Großbuchstaben wird kleingeschrieben gespeichert', () => {
    assert.equal(lauf(anfrage({ anfrage_id: ID.toUpperCase() })).speichern.anfrage.id, ID)
  })

  it('unbekannte Zusatzfelder stören nicht', () => {
    assert.equal(lauf({ ...anfrage(), irgendwas: 'x' }).senden, true)
  })
})

describe('Nachrichtenformat bei gemischten Kategorien', () => {
  it('zeilenweise je Kategorie, in fester Reihenfolge', () => {
    const r = lauf(
      anfrage({
        positionen: [
          { artikel: 'kuchen', menge: 1 },
          { artikel: 'decke', menge: 1 },
          { artikel: 'apfelschorle', menge: 1 },
          { artikel: 'wasser', menge: 2 },
        ],
      }),
    )
    assert.equal(r.text, 'Platz 4 wünscht:\nGetränke: 2× Wasser, 1× Apfelschorle\nDecke: 1× Decke\nEssen: 1× Kuchen')
  })

  it('unbekannte Kategorie kommt am Ende, mit großem Anfangsbuchstaben', () => {
    const artikel = [...ARTIKEL, { id: 'kerze', name: 'Kerze', kategorie: 'extras' }]
    const r = lauf(anfrage({ positionen: [{ artikel: 'kerze', menge: 1 }, { artikel: 'wasser', menge: 1 }] }), { artikel })
    assert.equal(r.text, 'Platz 4 wünscht:\nGetränke: 1× Wasser\nExtras: 1× Kerze')
  })
})

describe('Ungültige Anfragen werden mit 400 abgewiesen', () => {
  const faelle = [
    ['kein Objekt', null, 'ungueltig'],
    ['Array statt Objekt', [], 'ungueltig'],
    ['anfrage_id fehlt', anfrage({ anfrage_id: undefined }), 'ungueltige_anfrage_id'],
    ['anfrage_id keine UUID', anfrage({ anfrage_id: 'abc' }), 'ungueltige_anfrage_id'],
    ['anfrage_id mit Anhängsel', anfrage({ anfrage_id: ID + "'; drop table x" }), 'ungueltige_anfrage_id'],
    ['typ unbekannt', anfrage({ typ: 'beratung' }), 'ungueltiger_typ'],
    ['Platz als Text', anfrage({ platz: '4' }), 'ungueltiger_platz'],
    ['Platz 0', anfrage({ platz: 0 }), 'ungueltiger_platz'],
    ['Platz mit Nachkommastelle', anfrage({ platz: 4.5 }), 'ungueltiger_platz'],
    ['Platz nicht auf der Karte', anfrage({ platz: 8 }), 'platz_unbekannt'],
    ['keine Positionen', anfrage({ positionen: [] }), 'keine_positionen'],
    ['Positionen kein Array', anfrage({ positionen: 'wasser' }), 'keine_positionen'],
    ['Position kein Objekt', anfrage({ positionen: [null] }), 'ungueltige_position'],
    ['Menge 0', anfrage({ positionen: [{ artikel: 'wasser', menge: 0 }] }), 'ungueltige_menge'],
    ['Menge 11', anfrage({ positionen: [{ artikel: 'wasser', menge: 11 }] }), 'ungueltige_menge'],
    ['Menge als Text', anfrage({ positionen: [{ artikel: 'wasser', menge: '2' }] }), 'ungueltige_menge'],
    ['Menge Nachkomma', anfrage({ positionen: [{ artikel: 'wasser', menge: 1.5 }] }), 'ungueltige_menge'],
    ['Summe gleicher Artikel über 10', anfrage({ positionen: [{ artikel: 'wasser', menge: 6 }, { artikel: 'wasser', menge: 5 }] }), 'ungueltige_menge'],
    ['Artikel-ID mit Sonderzeichen', anfrage({ positionen: [{ artikel: 'Wasser!', menge: 1 }] }), 'ungueltiger_artikel'],
    ['Artikel nicht auf der Karte', anfrage({ positionen: [{ artikel: 'sekt', menge: 1 }] }), 'artikel_unbekannt'],
    ['zu viele Positionen', anfrage({ positionen: Array.from({ length: 21 }, () => ({ artikel: 'wasser', menge: 1 })) }), 'zu_viele_positionen'],
  ]
  for (const [name, body, grund] of faelle) {
    it(`${name} → ${grund}`, () => {
      const r = lauf(body)
      assert.equal(r.senden, false)
      assert.equal(r.status, 400)
      assert.deepEqual(r.antwort, { ok: false, grund })
    })
  }

  it('ausgeblendeter Artikel (nicht in der aktiven Karte) wird abgelehnt', () => {
    const r = lauf(anfrage({ positionen: [{ artikel: 'kuchen', menge: 1 }] }), { artikel: ARTIKEL.slice(0, 2) })
    assert.equal(r.antwort.grund, 'artikel_unbekannt')
  })
})

describe('Sperre pro Platz', () => {
  const vorSekunden = (s) => [{ erstellt_am: new Date(JETZT - s * 1000).toISOString() }]

  it('Anfrage vor 18 Sekunden → gesperrt, noch 42 Sekunden', () => {
    const r = lauf(anfrage(), { letzte: vorSekunden(18) })
    assert.equal(r.senden, false)
    assert.deepEqual(r.antwort, { ok: false, grund: 'gesperrt', warte_sekunden: 42 })
    assert.equal(r.status, 200)
  })

  it('genau an der Grenze ist die Sperre vorbei', () => {
    assert.equal(lauf(anfrage(), { letzte: vorSekunden(60) }).senden, true)
  })

  it('knapp davor: mindestens 1 Sekunde Wartezeit', () => {
    const r = lauf(anfrage(), { letzte: [{ erstellt_am: new Date(JETZT - 59_900).toISOString() }] })
    assert.equal(r.antwort.warte_sekunden, 1)
  })

  it('alte Anfrage sperrt nicht', () => {
    assert.equal(lauf(anfrage(), { letzte: vorSekunden(3600) }).senden, true)
  })

  it('Zeitstempel unlesbar: keine Sperre (Anfrage kommt an)', () => {
    assert.equal(lauf(anfrage(), { letzte: [{ erstellt_am: 'kaputt' }] }).senden, true)
  })

  it('Sperrzeit kommt aus den Einstellungen', () => {
    const r = entscheide({ body: anfrage(), plaetze: PLAETZE, artikel: ARTIKEL, letzte: vorSekunden(18), doppelt: [], jetzt: JETZT }, { ...EINSTELLUNGEN, SPERRE_SEKUNDEN: 20 })
    assert.equal(r.antwort.warte_sekunden, 2)
    assert.equal(r.antwort.ok, false)
  })
})

describe('Doppelung', () => {
  it('bekannte anfrage_id: Bestätigung, aber keine zweite Nachricht', () => {
    const r = lauf(anfrage(), { doppelt: [{ id: ID }] })
    assert.equal(r.senden, false)
    assert.deepEqual(r.antwort, { ok: true, sperre_sekunden: 60 })
  })

  it('Doppelung gewinnt gegen die Sperre (Wiederholung nach verlorener Antwort)', () => {
    const r = lauf(anfrage(), { doppelt: [{ id: ID }], letzte: [{ erstellt_am: new Date(JETZT - 5000).toISOString() }] })
    assert.equal(r.senden, false)
    assert.equal(r.antwort.ok, true)
  })

  it('ungültige Anfrage wird nie als Doppelung bestätigt', () => {
    assert.equal(lauf(anfrage({ platz: 99 }), { doppelt: [{ id: ID }] }).status, 400)
  })
})

describe('Supabase fällt aus: die Nachricht geht trotzdem raus', () => {
  const aus = { plaetze: null, artikel: null, letzte: null, doppelt: null }

  it('Notkarte und Notfall-Plätze greifen, Sperre und Doppelung werden übersprungen', () => {
    const r = lauf(anfrage(), aus)
    assert.equal(r.senden, true)
    assert.equal(r.text, 'Platz 4: 2× Wasser, 1× Apfelschorle')
  })

  it('auch ohne Supabase: Platz 8 und Artikel außerhalb der Notkarte bleiben abgelehnt', () => {
    assert.equal(lauf(anfrage({ platz: 8 }), aus).antwort.grund, 'platz_unbekannt')
    assert.equal(lauf(anfrage({ positionen: [{ artikel: 'decke', menge: 1 }] }), aus).antwort.grund, 'artikel_unbekannt')
  })

  it('leere Antwort bei Plätzen und Artikeln zählt wie Ausfall', () => {
    assert.equal(lauf(anfrage(), { plaetze: [], artikel: [] }).senden, true)
  })

  it('nur die Sperr-Abfrage fällt aus: Karte aus Supabase gilt weiter', () => {
    const r = lauf(anfrage({ positionen: [{ artikel: 'decke', menge: 1 }] }), { letzte: null, doppelt: null })
    assert.equal(r.senden, true)
    assert.equal(r.text, 'Platz 4: 1× Decke')
  })

  it('Speicherdaten sind auch im Ausfall vollständig (Speicher-Zweig scheitert dann allein)', () => {
    const r = lauf(anfrage(), aus)
    assert.equal(r.speichern.positionen.length, 2)
  })
})

// So führt n8n den Code-Node aus: als Funktionskörper, mit $input und $('Node-Name').
describe('Code-Node in der n8n-Umgebung', () => {
  const quelle = readFileSync(new URL('./anfrage-entscheiden.cjs', import.meta.url), 'utf8')

  /** nodes: Name → Items (Array) oder Error, wenn der Node nicht gelaufen ist */
  const inN8n = (body, nodes) => {
    const dollar = (name) => ({
      all: () => {
        if (nodes[name] instanceof Error) throw nodes[name]
        return nodes[name]
      },
      first: () => ({ json: { body } }),
    })
    const umgebung = vm.createContext({ $input: { all: () => [] }, $: dollar, Date, Number, Math, Map, Object, Array })
    return vm.runInContext(`(function () {\n${quelle}\n})()`, umgebung)
  }
  const items = (...zeilen) => zeilen.map((json) => ({ json }))
  const alleDa = {
    'Plaetze laden': items(...PLAETZE),
    'Artikel laden': items(...ARTIKEL),
    'Letzte Anfrage am Platz': items({}), // „Always Output Data“: leere Abfrage = leeres Objekt
    'Doppelte Anfrage pruefen': items({}),
  }

  it('liest die Nodes und gibt genau ein Item mit der Entscheidung zurück', () => {
    const ergebnis = inN8n(anfrage(), alleDa)
    assert.equal(ergebnis.length, 1)
    assert.equal(ergebnis[0].json.senden, true)
    assert.equal(ergebnis[0].json.text, 'Platz 4: 2× Wasser, 1× Apfelschorle')
  })

  it('Supabase-Fehler („Continue On Fail“ liefert ein Item mit error) gilt als Ausfall', () => {
    const fehlerItem = items({ error: 'fetch failed' })
    const ergebnis = inN8n(anfrage(), { ...alleDa, 'Plaetze laden': fehlerItem, 'Artikel laden': fehlerItem })
    assert.equal(ergebnis[0].json.senden, true) // Notkarte greift
  })

  it('Node nicht gelaufen (wirft): ebenfalls Ausfall, Anfrage kommt trotzdem an', () => {
    const weg = new Error('Node did not execute')
    const ergebnis = inN8n(anfrage(), { ...alleDa, 'Letzte Anfrage am Platz': weg, 'Doppelte Anfrage pruefen': weg })
    assert.equal(ergebnis[0].json.senden, true)
  })

  it('erkennt die Sperre aus der Abfrage „Letzte Anfrage am Platz“', () => {
    const gerade = new Date().toISOString()
    const ergebnis = inN8n(anfrage(), { ...alleDa, 'Letzte Anfrage am Platz': items({ erstellt_am: gerade }) })
    assert.equal(ergebnis[0].json.antwort.grund, 'gesperrt')
  })
})
