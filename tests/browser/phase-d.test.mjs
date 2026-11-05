// Phase D: Kommentar-Auswertung und Leitung-Navigation
import { BASE, neueSeite, pruefer } from './helfer.mjs'

const AUSW = {
  monat: '2026-09', monate: ['2026-09', '2026-08'], schwelle_pflicht: 4, kurz_unter_woerter: 5, eigene_analyse_nur_admin: false,
  team: {
    erwartet: 4, abgegeben: 3, nicht_abgegeben: 1, bewertungen: 14, kommentare: 8, quote: 57.1, pflicht: 7, pflicht_erfuellt: 7,
    freiwillig_bewertungen: 7, freiwillig_kommentare: 1, freiwillige_quote: 14.3, woerter_schnitt: 5.8, kurz: 1, kurz_anteil: 12.5,
    doppelt: 1, verhalten_ohne_kommentar: 1,
  },
  personen: [
    { id: 'a', name: 'Anna Test', bewertungen: 6, kommentare: 4, quote: 66.7, pflicht: 3, pflicht_erfuellt: 3, freiwillig_bewertungen: 3, freiwillig_kommentare: 1, freiwillige_quote: 33.3, woerter_schnitt: 4.8, kurz: 1, doppelt: 1, verhalten_ohne_kommentar: 0 },
    { id: 'b', name: 'Berta Test', bewertungen: 6, kommentare: 2, quote: 33.3, pflicht: 2, pflicht_erfuellt: 2, freiwillig_bewertungen: 4, freiwillig_kommentare: 0, freiwillige_quote: 0, woerter_schnitt: 6, kurz: 0, doppelt: 0, verhalten_ohne_kommentar: 1 },
  ],
  nicht_abgegeben: [{ id: 'c', name: 'Cora Test' }],
}

export default async function (browser) {
  const t = pruefer('Phase D: Leitung und Kommentar-Auswertung')
  const antworten = { kommentar_auswertung: (b) => ({ ...AUSW, monat: b.p_monat ? b.p_monat.slice(0, 7) : AUSW.monat }), abgabe_status: [], ueberfaellige_abgaben: [], meine_monate: [] }

  t.abschnitt('Menü und Zugriff')
  {
    const { page, context } = await neueSeite(browser, { rolle: 'chef', antworten })
    await page.goto(BASE + '/app')
    await page.getByRole('button', { name: 'Verstanden' }).click().catch(() => undefined)
    const menue = await page.locator('.nav').innerText()
    t.check(/Leitung/.test(menue), 'Verantwortlicher sieht den Menüpunkt „Leitung“')
    await page.getByRole('link', { name: 'Leitung', exact: true }).first().click()
    await page.waitForURL('**/app/leitung/kommentare')
    t.check(true, '/app/leitung führt auf Kommentare')
    t.check((await page.locator('.unternav__link').allInnerTexts()).join('|') === 'Kommentare', 'Unter-Navigation zeigt Kommentare')
    await context.close()
  }
  {
    const { page, context } = await neueSeite(browser, { rolle: 'ma', antworten })
    await page.goto(BASE + '/app')
    t.check(!/Leitung/.test(await page.locator('.nav').innerText()), 'Mitarbeiter sehen keinen Menüpunkt „Leitung“')
    await page.goto(BASE + '/app/leitung/kommentare')
    await page.waitForURL('**/app')
    t.check(true, 'Mitarbeiter werden von /app/leitung/kommentare auf /app umgeleitet')
    await context.close()
  }

  t.abschnitt('Kennzahlen und Tabelle')
  {
    const { page, context, aufrufe, konsole } = await neueSeite(browser, { rolle: 'chef', antworten })
    await page.goto(BASE + '/app/leitung/kommentare')
    await page.waitForSelector('[data-testid="kommentar-tabelle"]')
    const text = await page.locator('main').innerText()
    t.check(/57,1 %/.test(text) && /8 von 14 Bewertungen/.test(text), 'Team-Quote 57,1 % (8 von 14)')
    t.check(/7 von 7/.test(text), 'Pflicht: 7 von 7 mit Kommentar')
    t.check(/14,3 %/.test(text), 'Freiwillige Quote 14,3 %')
    const zeilen = await page.locator('[data-testid="kommentar-tabelle"] tbody tr').allInnerTexts()
    t.check(zeilen.length === 2 && /Anna Test/.test(zeilen[0]) && /66,7 %/.test(zeilen[0]), 'Je Person eine Zeile mit Quote')
    t.check(/Nicht abgegeben:\s*Cora Test/.test(await page.locator('[data-testid="nicht-abgegeben"]').innerText()), 'Nicht abgegeben: Cora Test')
    t.check(/nie die Texte/.test(text) || /nie die Texte selbst/.test(text), 'Hinweis: nie die Texte')
    await page.selectOption('#monatswahl', '2026-08')
    await page.waitForTimeout(200)
    t.check(aufrufe.some((a) => a.rpc === 'kommentar_auswertung' && a.body.p_monat === '2026-08-01'), 'Monatswechsel fragt den anderen Monat ab')
    t.check(konsole.length === 0, `keine Konsolenfehler ${konsole.join(' | ')}`)
    await context.close()
  }

  t.abschnitt('Kopfzeile bleibt einzeilig')
  for (const breite of [960, 1040, 1100, 1280]) {
    const { page, context } = await neueSeite(browser, { rolle: 'chef', viewport: { width: breite, height: 700 }, antworten })
    await page.goto(BASE + '/app/leitung/kommentare')
    await page.waitForSelector('.kopf')
    const info = await page.evaluate(() => ({
      ueberlauf: document.documentElement.scrollWidth > window.innerWidth,
      hoehe: document.querySelector('.kopf__innen').getBoundingClientRect().height,
    }))
    t.check(!info.ueberlauf && info.hoehe <= 72, `Breite ${breite}: kein Überlauf, Kopf ${Math.round(info.hoehe)} px hoch`)
    await context.close()
  }

  return t.ende()
}
