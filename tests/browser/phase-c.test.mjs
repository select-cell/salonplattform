// Phase C: PDF-Export (Monatsbericht, Personenbericht, Protokoll). Die PDFs werden im Browser wirklich erzeugt,
// heruntergeladen und mit poppler (pdfinfo, pdffonts, pdftotext) geprüft.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { BASE, neueSeite, pruefer } from './helfer.mjs'

const ZIEL = 'out/pdf-test'
mkdirSync(ZIEL, { recursive: true })
const poppler = (programm, ...args) => execFileSync(programm, args, { encoding: 'utf8' })

const SCHWELLEN = { ausgewogen: 0.3, niedrig: 2.5, hoch: 3.5 }
const VERHALTEN = Array.from({ length: 30 }, (_, i) => ({
  nr: i + 1,
  grundpfeiler: `Grundpfeiler ${Math.floor(i / 10) + 1}`,
  saeule: `Säule ${Math.floor(i / 5) + 1}`,
  titel: i === 0 ? 'Begrüßt Gäste freundlich und überzeugend' : `Testverhalten Nummer ${i + 1} mit längerem Titel für den Umbruch`,
  sb: i % 7 === 3 ? null : 2 + (i % 4),
  fb: 1.5 + (i % 5) * 0.75,
}))

const DASH = {
  schwellen: SCHWELLEN, monate: ['2026-10', '2026-09'], monat: '2026-10',
  personen: [
    { id: '11111111-0000-0000-0000-0000000000b1', name: 'Anna Müller-Öztürk', sb: 3.4, fb: 3.1, differenz: 0.3, minuten: 6, rang: 1 },
    { id: '11111111-0000-0000-0000-0000000000b2', name: 'Berta Test', sb: 2.9, fb: 3.5, differenz: -0.6, minuten: 8, rang: 2 },
  ],
  verhalten: VERHALTEN.map(({ nr, grundpfeiler, saeule, titel, sb, fb }) => ({ nr, grundpfeiler, saeule, titel, sb, fb })),
  matrix: [], rituale_skalen: [], rituale_phasen: [], entwicklung: [],
}
const TEAM = { schwellen: SCHWELLEN, monate: ['2026-10'], verhalten: [], rituale_skalen: [], rituale_phasen: [], entwicklung: [], dauer: [] }
const ZEIT = {
  monat: '2026-10', monate: ['2026-10'], abgaben_ohne_zeit: 0,
  einstellungen: { min_sek_pro_verhalten: 5, sehr_lang_sek: 14400, pausen_quote: 0.3, heartbeat_luecke_sek: 180 },
  personen: [], zusammenfassung: { abgegeben: 2, zaehlt: 2, median_sek: 400, min_sek: 300, max_sek: 500 }, verhalten: [], heatmap: [],
}

const MONATSBERICHT = {
  salon: 'DAWIID', monat: '2026-10', erstellt_am: '2026-11-05T09:30:00Z', schwellen: SCHWELLEN,
  beteiligung: { erwartet: 3, abgegeben: 2 },
  kennzahlen: { sb: 3.2, fb: 3.3, differenz: -0.1 },
  verhalten: VERHALTEN.map(({ nr, grundpfeiler, saeule, titel, sb, fb }) => ({ nr, grundpfeiler, saeule, titel, sb, fb })),
  kommentare: {
    team: { quote: 57.1, kommentare: 8, bewertungen: 14, pflicht: 7, pflicht_erfuellt: 7, freiwillige_quote: 14.3, woerter_schnitt: 5.8 },
    personen: [
      { id: 'a', name: 'Anna Müller-Öztürk', quote: 66.7, pflicht: 3, pflicht_erfuellt: 3, freiwillige_quote: 33.3, woerter_schnitt: 4.8 },
      { id: 'b', name: 'Berta Test', quote: 33.3, pflicht: 2, pflicht_erfuellt: 2, freiwillige_quote: 0, woerter_schnitt: 6 },
    ],
  },
  zeit: { abgegeben: 2, zaehlt: 2, median_sek: 400 },
  agenda: null,
}

const PERSON_ID = DASH.personen[0].id
const PERSONENBERICHT = {
  salon: 'DAWIID', monat: '2026-10', erstellt_am: '2026-11-05T09:30:00Z',
  person: { id: PERSON_ID, name: 'Anna Müller-Öztürk' }, schwellen: SCHWELLEN,
  verhalten: [
    ...VERHALTEN.map((v) => ({ monat: '2026-10', ...v })),
    ...VERHALTEN.slice(0, 6).map((v) => ({ monat: '2026-09', ...v, fb: 2.5 })),
  ],
  kommentare: [
    { monat: '2026-10', nr: 1, kommentar: 'Sehr aufmerksam – grüßt jeden Gast beim Namen.', note: 5 },
    { monat: '2026-10', nr: 1, kommentar: 'Könnte etwas ruhiger auftreten.', note: 2 },
    { monat: '2026-10', nr: 4, kommentar: 'Größte Stärke: Übersicht in stressigen Momenten.', note: 4 },
  ],
  selbst_kommentare: [{ monat: '2026-10', nr: 1, kommentar: 'Ich bemühe mich, jeden Gast zu begrüßen.', note: 4 }],
  entwicklung: [{ begruendung: 'Kann mehr Verantwortung übernehmen.' }, { begruendung: null }],
  analyse: null,
}

const PROTOKOLL = [
  { erstellt_am: '2026-11-05T09:31:00Z', von: 'Dawid Chef', art: 'personenbericht', monat: '2026-10', ziel: 'Anna Müller-Öztürk' },
  { erstellt_am: '2026-11-05T09:30:00Z', von: 'Dawid Chef', art: 'monatsbericht', monat: '2026-10', ziel: null },
]

const antworten = (extra = {}) => ({
  team_dashboard: DASH, team_ergebnisse: TEAM, zeit_auswertung: ZEIT, abgabe_status: [], ueberfaellige_abgaben: [],
  pdf_monatsbericht: MONATSBERICHT, pdf_personenbericht: PERSONENBERICHT, pdf_export_protokoll: PROTOKOLL, ...extra,
})

async function lade(page, knopf, name) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByRole('button', { name: knopf }).click()])
  const pfad = `${ZIEL}/${name}`
  await download.saveAs(pfad)
  return { dateiname: download.suggestedFilename(), pfad }
}

export default async function (browser) {
  const t = pruefer('Phase C: PDF-Export')

  t.abschnitt('Monatsbericht')
  {
    const { page, context, aufrufe, konsole } = await neueSeite(browser, { rolle: 'chef', antworten: antworten() })
    await page.goto(BASE + '/app/team')
    await page.getByRole('button', { name: 'Verstanden' }).click().catch(() => undefined)
    await page.getByRole('button', { name: 'Monatsbericht als PDF' }).waitFor()
    t.check(true, 'Knopf „Monatsbericht als PDF“ ist im Team-Dashboard sichtbar')
    t.check(!aufrufe.some((a) => a.rpc === 'pdf_monatsbericht'), 'Vor dem Klick wird nichts abgerufen (und nichts protokolliert)')
    const { dateiname, pfad } = await lade(page, 'Monatsbericht als PDF', 'monat.pdf')
    t.check(dateiname === 'dawiid_2026-10_monatsbericht.pdf', `Dateiname dawiid_2026-10_monatsbericht.pdf (${dateiname})`)
    const aufruf = aufrufe.filter((a) => a.rpc === 'pdf_monatsbericht')
    t.check(aufruf.length === 1 && aufruf[0].body.p_monat === '2026-10-01', 'Genau ein Abruf pdf_monatsbericht für 2026-10-01')
    const info = poppler('pdfinfo', pfad)
    t.check(/Page size:\s+595\.\d+ x 841\.\d+ pts \(A4\)/.test(info), 'Format A4')
    const seiten = Number(/Pages:\s+(\d+)/.exec(info)?.[1])
    t.check(seiten >= 2, `Mehrere Seiten durch Umbruch (${seiten})`)
    const schriften = poppler('pdffonts', pfad)
    t.check(/DMSans/i.test(schriften) && /DMSerif/i.test(schriften), 'DM Sans und DM Serif Display sind eingebettet')
    t.check(!/\bno\b\s+no\s+no/.test(schriften.split('\n').slice(2).join('\n')), 'Alle Schriften eingebettet (emb = yes)')
    const text = poppler('pdftotext', '-layout', pfad, '-')
    t.check(/Monatsbericht Oktober 2026/.test(text), 'Titel „Monatsbericht Oktober 2026“')
    t.check(/2 von 3 Personen haben abgegeben \(67 %\)/.test(text), 'Beteiligung 2 von 3 (67 %)')
    t.check(/Begrüßt Gäste freundlich und überzeugend/.test(text), 'Umlaute im Verhaltenstitel')
    t.check(/−0,1/.test(text), 'Minuszeichen (−) bei negativer Differenz')
    t.check(/Kommentar-Quote 57,1 %/.test(text.replace(/\s+/g, ' ')), 'Kommentar-Quote 57,1 %')
    t.check(/Anna Müller-Öztürk/.test(text), 'Namen mit Umlauten in der Personentabelle')
    t.check((text.match(/Vertraulich – nur für Verantwortliche/g) ?? []).length === seiten, 'Fußzeile „Vertraulich“ auf jeder Seite')
    for (let i = 1; i <= seiten; i++) t.check(new RegExp(`Seite ${i} von ${seiten}`).test(text), `Seitenzahl „Seite ${i} von ${seiten}“`)
    t.check(/5\. November 2026/.test(text), 'Erstellungsdatum im Fuß (5. November 2026)')
    t.check(konsole.length === 0, `keine Konsolenfehler ${konsole.join(' | ')}`)
    await context.close()
  }

  t.abschnitt('Personenbericht')
  {
    const { page, context, aufrufe, konsole } = await neueSeite(browser, { rolle: 'chef', antworten: antworten({ person_ergebnisse: { person: { id: PERSON_ID, name: 'Anna Müller-Öztürk' }, schwellen: SCHWELLEN, monate: ['2026-10', '2026-09'], verhalten: PERSONENBERICHT.verhalten, kommentare: [], rituale: [], dauer: [], entwicklung: [], einzelwerte: [] } }) })
    await page.goto(BASE + '/app/team')
    await page.getByRole('button', { name: 'Verstanden' }).click().catch(() => undefined)
    await page.getByRole('button', { name: 'Anna', exact: true }).click()
    await page.getByRole('heading', { name: 'Anna Müller-Öztürk' }).waitFor()
    const { dateiname, pfad } = await lade(page, 'Personenbericht als PDF', 'person.pdf')
    t.check(dateiname === 'dawiid_2026-10_personenbericht-anna-mueller-oeztuerk.pdf', `Dateiname mit Umlaut-Umschrift (${dateiname})`)
    const aufruf = aufrufe.filter((a) => a.rpc === 'pdf_personenbericht')
    t.check(aufruf.length === 1 && aufruf[0].body.p_person === PERSON_ID && aufruf[0].body.p_monat === '2026-10-01', 'Abruf mit Person und Monat')
    const info = poppler('pdfinfo', pfad)
    t.check(/\(A4\)/.test(info), 'Format A4')
    const text = poppler('pdftotext', '-layout', pfad, '-')
    const flach = text.replace(/\s+/g, ' ')
    t.check(/Anna Müller-Öztürk/.test(text) && /Personenbericht Oktober 2026/.test(flach), 'Name und „Personenbericht Oktober 2026“')
    t.check(/Sehr aufmerksam – grüßt jeden Gast beim Namen\./.test(flach), 'Kommentar mit Gedankenstrich und Umlaut')
    t.check(/Größte Stärke: Übersicht in stressigen Momenten\./.test(flach), 'Kommentar mit ß und Ü')
    t.check(/Ich bemühe mich, jeden Gast zu begrüßen\./.test(flach), 'Eigener Kommentar')
    t.check(/Kann mehr Verantwortung übernehmen\./.test(flach), 'Begründung zur Entwicklung')
    t.check(!/Berta/.test(text) && /Ohne Absender/.test(text), 'Keine Absender-Namen im Personenbericht')
    t.check(/Vereinbarungen/.test(text) && /Datum, Unterschrift Mitarbeiter/.test(text) && /Datum, Unterschrift Verantwortlicher/.test(text), 'Vereinbarungen und beide Unterschriftszeilen')
    t.check(/Fremdbild gegenüber September 2026/.test(flach), 'Vergleich zum Vormonat (September 2026)')
    t.check(/Vertraulich – nur für Verantwortliche/.test(text), 'Fußzeile „Vertraulich“')
    await page.screenshot({ path: `${ZIEL}/person-seite.png` })
    t.check(konsole.length === 0, `keine Konsolenfehler ${konsole.join(' | ')}`)
    await context.close()
  }

  t.abschnitt('Fehler und Zugriff')
  {
    const { page, context } = await neueSeite(browser, {
      rolle: 'chef',
      antworten: antworten({ pdf_monatsbericht: { status: 400, body: { code: '22023', message: 'Für diesen Monat gibt es keine Auswertung.' } } }),
    })
    await page.goto(BASE + '/app/team')
    await page.getByRole('button', { name: 'Verstanden' }).click().catch(() => undefined)
    await page.getByRole('button', { name: 'Monatsbericht als PDF' }).click()
    await page.getByRole('alert').filter({ hasText: 'Für diesen Monat gibt es keine Auswertung.' }).waitFor()
    t.check(true, 'Fehlermeldung der Datenbank erscheint auf Deutsch')
    t.check(await page.getByRole('button', { name: 'Monatsbericht als PDF' }).isEnabled(), 'Knopf ist danach wieder bedienbar')
    await context.close()
  }
  {
    const { page, context } = await neueSeite(browser, { rolle: 'ma', antworten: { meine_monate: [], meine_ergebnisse: { person: { id: 'x', name: 'Oksana' }, schwellen: SCHWELLEN, monate: [], verhalten: [], kommentare: [], rituale: [], dauer: [], entwicklung: [], einzelwerte: null } } })
    await page.goto(BASE + '/app/ergebnisse')
    await page.waitForTimeout(800)
    t.check((await page.getByRole('button', { name: /als PDF/ }).count()) === 0, 'Mitarbeiter sehen keinen PDF-Knopf')
    await context.close()
  }

  t.abschnitt('Export-Protokoll auf der Info-Seite')
  {
    const { page, context, aufrufe } = await neueSeite(browser, { rolle: 'admin', antworten: antworten() })
    await page.goto(BASE + '/app/info')
    await page.getByRole('button', { name: 'Verstanden' }).click().catch(() => undefined)
    await page.locator('table[aria-label="Export-Protokoll"]').waitFor()
    const zeilen = await page.locator('table[aria-label="Export-Protokoll"] tbody tr').allInnerTexts()
    t.check(zeilen.length === 2, 'Admin sieht zwei Protokollzeilen')
    t.check(/Dawid Chef/.test(zeilen[0]) && /Personenbericht: Anna Müller-Öztürk/.test(zeilen[0]) && /Oktober 2026/.test(zeilen[0]), 'Zeile mit Wer, Bericht, Person und Monat')
    t.check(/Monatsbericht/.test(zeilen[1]), 'Monatsbericht in der zweiten Zeile')
    t.check(aufrufe.some((a) => a.rpc === 'pdf_export_protokoll'), 'Protokoll wird per RPC geladen')
    t.check(/PDF-Berichte/.test(await page.locator('main').innerText()), 'Info-Absatz „PDF-Berichte“')
    await context.close()
  }
  for (const rolle of ['chef', 'ma']) {
    const { page, context, aufrufe } = await neueSeite(browser, { rolle, antworten: antworten() })
    await page.goto(BASE + '/app/info')
    await page.getByRole('button', { name: 'Verstanden' }).click().catch(() => undefined)
    await page.getByRole('heading', { name: 'PDF-Berichte' }).waitFor()
    t.check(!(await page.locator('main').innerText()).includes('Export-Protokoll') && !aufrufe.some((a) => a.rpc === 'pdf_export_protokoll'), `${rolle === 'chef' ? 'Verantwortliche' : 'Mitarbeiter'} sehen kein Export-Protokoll`)
    await context.close()
  }

  return t.ende()
}
