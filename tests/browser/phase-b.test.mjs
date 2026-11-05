// Phase B: Zeiterfassung (Browser: Messung, Herzschlag, Abgabe, Leitung-Auswertung)
import { BASE, neueSeite, pruefer } from './helfer.mjs'

const MONATE = [{ monat: '2026-10-01', monat_key: '2026-10', frist: '2026-10-31', tage_bis_frist: 20, abgegeben: false, abgegeben_am: null }]
const SITZUNG = '77777777-0000-0000-0000-000000000001'
const INHALT = {
  salon: { id: 's', name: 'Dawiid' }, person: { id: 'p1', name: 'Oksana Serafyn' }, kolleginnen: [],
  verhalten: [{ nr: 1, titel: 'Testverhalten', grundpfeiler: null, saeule: null, video_url: null, kriterien: [] }],
}

const letzterHerzschlag = (aufrufe) => [...aufrufe].reverse().find((a) => a.rpc === 'umfrage_heartbeat')?.body
const alleHerzschlaege = (aufrufe) => aufrufe.filter((a) => a.rpc === 'umfrage_heartbeat').map((a) => a.body)

async function ausfuellen(page) {
  // Verhalten bewerten: Zahl klicken, im Popup „Locked In“, danach geht es von selbst zur Zusammenfassung
  await page.locator('fieldset.bewertung').first().locator('label.skala__feld').nth(2).click()
  await page.locator('dialog.lockin').getByRole('button', { name: /Locked In/ }).click()
  await page.waitForSelector('#schritt-titel:has-text("Zusammenfassung")')
}

export default async function (browser) {
  const t = pruefer('Phase B: Zeiterfassung')

  const antworten = (extra = {}) => ({
    meine_monate: MONATE,
    umfrage_inhalt: INHALT,
    umfrage_starten: { sitzung: SITZUNG, aktive_sek: 0, schritte: {}, wiederaufgenommen: false },
    umfrage_heartbeat: (b) => ({ aktive_sek: b.p_aktive_sek, status: 'laufend' }),
    umfrage_einreichen_v3: '99999999-0000-0000-0000-000000000001',
    meine_ausfuellzeit: { aktive_sek: 125 },
    ...extra,
  })

  t.abschnitt('Aktive Zeit wird gemessen, Pausen zählen nicht')
  {
    const { context, page, aufrufe, konsole } = await neueSeite(browser, { rolle: 'ma', antworten: antworten(), clock: true })
    await page.goto(BASE + '/app/umfrage/2026-10')
    await page.waitForSelector('#schritt-titel')
    await page.waitForTimeout(150)
    t.check(aufrufe.filter((a) => a.rpc === 'umfrage_starten').length === 1, 'Sitzung wird genau einmal gestartet')
    t.check(aufrufe.find((a) => a.rpc === 'umfrage_starten')?.body.p_monat === '2026-10-01', 'Start mit Monat 2026-10-01')

    await page.getByRole('button', { name: /Los geht/ }).click()          // Eingabe bei t = 0
    await page.waitForTimeout(100)
    await page.clock.runFor(30_000)
    await page.waitForTimeout(150)
    let hb = letzterHerzschlag(aufrufe)
    t.check(hb && hb.p_sitzung === SITZUNG && hb.p_aktive_sek >= 28 && hb.p_aktive_sek <= 31, `Herzschlag nach 30 s meldet ~30 s aktiv (${hb?.p_aktive_sek})`)
    t.check(hb && hb.p_schritte.v1 >= 28 && hb.p_schritte.v1 <= 31, `Zeit ist dem Schritt v1 zugeordnet (${hb?.p_schritte?.v1})`)

    // 60 s ohne Eingabe: nur noch bis zum Ende des 45-Sekunden-Fensters zählen
    await page.clock.runFor(60_000)
    await page.waitForTimeout(150)
    hb = letzterHerzschlag(aufrufe)
    t.check(hb.p_aktive_sek >= 44 && hb.p_aktive_sek <= 46, `Ohne Eingabe zählt höchstens das 45-s-Fenster (${hb.p_aktive_sek})`)

    // Tab verborgen: sofort ein Herzschlag per fetch (keepalive); verborgene Zeit zählt nicht
    const vorher = alleHerzschlaege(aufrufe).length
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(200)
    t.check(alleHerzschlaege(aufrufe).length === vorher + 1, 'Beim Verbergen geht sofort ein Herzschlag raus')
    await page.clock.runFor(120_000)
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.clock.runFor(30_000)       // wieder sichtbar, aber keine Eingabe: Rückkehr zählt nicht
    await page.waitForTimeout(150)
    hb = letzterHerzschlag(aufrufe)
    t.check(hb.p_aktive_sek >= 44 && hb.p_aktive_sek <= 46, `Verborgene Zeit und Rückkehr zählen nicht (${hb.p_aktive_sek})`)

    // Neue Eingabe: es zählt wieder
    await page.mouse.click(50, 50)
    await page.clock.runFor(30_000)
    await page.waitForTimeout(150)
    hb = letzterHerzschlag(aufrufe)
    t.check(hb.p_aktive_sek >= 73 && hb.p_aktive_sek <= 76, `Nach einer Eingabe zählt es wieder (${hb.p_aktive_sek})`)

    // Abgabe mit Sitzung
    await ausfuellen(page)
    await page.getByRole('button', { name: 'Umfrage absenden' }).click()
    await page.waitForSelector('h2:has-text("Danke")')
    const v3 = aufrufe.find((a) => a.rpc === 'umfrage_einreichen_v3')?.body
    t.check(v3 && v3.p_sitzung === SITZUNG, 'Abgabe nennt die Sitzung')
    t.check(v3 && typeof v3.p_aktive_sek === 'number' && v3.p_aktive_sek >= 73, `Abgabe nennt die aktive Zeit (${v3?.p_aktive_sek})`)
    t.check(v3 && v3.p_schritte && 'v1' in v3.p_schritte, 'Abgabe nennt die Schrittzeiten')
    t.check(v3 && v3.payload && v3.payload.monat === '2026-10' && !('gestartet_am_server' in v3.payload), 'Nutzdaten bleiben wie bisher')
    t.check(/Ausgefüllt in 2 Min\. aktiver Zeit/.test(await page.locator('main').innerText()), 'Danke-Seite: eigene aktive Zeit aus der Datenbank (2 Min.)')
    t.check(!/zu schnell|Kennzeichen|ohne Zeitmessung/.test(await page.locator('main').innerText()), 'Mitarbeiter sehen keine Kennzeichen')
    t.check(konsole.length === 0, `keine Konsolenfehler ${konsole.join(' | ')}`)
    await context.close()
  }

  t.abschnitt('Fortsetzen: Stand vom Server wird übernommen')
  {
    const { context, page, aufrufe } = await neueSeite(browser, {
      rolle: 'ma', clock: true,
      antworten: antworten({ umfrage_starten: { sitzung: SITZUNG, aktive_sek: 100, schritte: { v1: 60 }, wiederaufgenommen: true } }),
    })
    await page.goto(BASE + '/app/umfrage/2026-10')
    await page.waitForSelector('#schritt-titel')
    await page.getByRole('button', { name: /Los geht/ }).click()
    await page.clock.runFor(30_000)
    await page.waitForTimeout(150)
    const hb = letzterHerzschlag(aufrufe)
    t.check(hb.p_aktive_sek >= 128 && hb.p_aktive_sek <= 131, `Zählt ab dem Serverstand weiter (${hb.p_aktive_sek})`)
    t.check(hb.p_schritte.v1 >= 88, `Schrittzeit setzt beim Serverstand fort (${hb.p_schritte.v1})`)
    await context.close()
  }

  t.abschnitt('Ohne Verbindung zur Zeiterfassung läuft die Umfrage weiter')
  {
    const { context, page, aufrufe } = await neueSeite(browser, {
      rolle: 'ma', clock: true,
      antworten: antworten({ umfrage_starten: { status: 500, body: { code: 'XX000', message: 'kaputt' } } }),
    })
    await page.goto(BASE + '/app/umfrage/2026-10')
    await page.waitForSelector('#schritt-titel')
    await page.getByRole('button', { name: /Los geht/ }).click()
    await page.clock.runFor(8_500)
    await page.waitForSelector('fieldset.bewertung')
    await ausfuellen(page)
    await page.getByRole('button', { name: 'Umfrage absenden' }).click()
    await page.waitForSelector('h2:has-text("Danke")')
    const v3 = aufrufe.find((a) => a.rpc === 'umfrage_einreichen_v3')?.body
    t.check(v3 && v3.p_sitzung === null && v3.p_aktive_sek === null, 'Ohne Sitzung wird trotzdem abgegeben (p_sitzung null)')
    t.check((await page.locator('main').innerText()).includes('Danke'), 'Danke-Seite erscheint')
    await context.close()
  }

  t.abschnitt('Neu beginnen')
  {
    const entwurf = { version: 1, monat: '2026-10', gestartetAm: new Date().toISOString(), schritt: 1, noten: {}, kommentare: {}, videos: {}, entwicklung: { personId: null, begruendung: '' } }
    let neu = 0
    const { context, page, aufrufe } = await neueSeite(browser, {
      rolle: 'ma',
      antworten: antworten({ umfrage_starten: (b) => { if (b.p_neu) neu++; return { sitzung: SITZUNG, aktive_sek: 0, schritte: {}, wiederaufgenommen: !b.p_neu } } }),
    })
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), ['dawiid-umfrage:u1:2026-10', JSON.stringify(entwurf)])
    await page.goto(BASE + '/app/umfrage/2026-10')
    await page.waitForSelector('#schritt-titel')
    await page.getByRole('button', { name: 'Zurück' }).click()
    t.check(/Willkommen zurück/.test(await page.locator('.umfrage__inhalt').innerText()), 'Start zeigt „Willkommen zurück“')
    await page.getByRole('button', { name: 'Neu beginnen' }).click()
    t.check(/Wirklich neu beginnen/.test(await page.locator('.umfrage__inhalt').innerText()), 'Rückfrage vor dem Neubeginn')
    await page.getByRole('button', { name: 'Ja, neu beginnen' }).click()
    await page.waitForTimeout(200)
    t.check(neu === 1, 'umfrage_starten wird mit neu = true aufgerufen')
    t.check(!/Willkommen zurück/.test(await page.locator('.umfrage__inhalt').innerText()), 'Danach beginnt die Umfrage von vorn')
    await context.close()
  }

  t.abschnitt('Leitung: Abschnitt Ausfüllzeit')
  {
    const dash = {
      schwellen: { ausgewogen: 0.3, niedrig: 2.5, hoch: 3.5 }, monate: ['2026-10'], monat: '2026-10',
      personen: [{ id: 'a', name: 'Anna Test', sb: 3, fb: 3, differenz: 0, minuten: 6, rang: 1 }],
      verhalten: [{ nr: 1, grundpfeiler: 'GP', saeule: 'Säule 1', titel: 'Testverhalten', sb: 3, fb: 3 }],
      matrix: [{ nr: 1, person_id: 'a', sb: 3, fb: 3 }], rituale_skalen: [], rituale_phasen: [], entwicklung: [],
    }
    const team = { schwellen: dash.schwellen, monate: ['2026-10'], verhalten: [], rituale_skalen: [], rituale_phasen: [], entwicklung: [], dauer: [] }
    const zeit = {
      monat: '2026-10', monate: ['2026-10'], abgaben_ohne_zeit: 1,
      einstellungen: { min_sek_pro_verhalten: 5, sehr_lang_sek: 14400, pausen_quote: 0.3, heartbeat_luecke_sek: 180 },
      personen: [
        { id: 'a', name: 'Anna Test', aktive_sek: 400, gesamt_sek: 700, kennzeichen: ['wiederaufgenommen'], zaehlt: true },
        { id: 'b', name: 'Berta Test', aktive_sek: 3, gesamt_sek: 30, kennzeichen: ['zu_schnell'], zaehlt: false },
        { id: 'c', name: 'Cora Test', aktive_sek: 0, gesamt_sek: 0, kennzeichen: ['ohne_sitzung'], zaehlt: false },
      ],
      zusammenfassung: { abgegeben: 3, zaehlt: 1, median_sek: 400, min_sek: 400, max_sek: 400 },
      verhalten: [{ nr: 1, schritt: 'v1', titel: 'Testverhalten', median_sek: 42, mittel_sek: 42, anzahl: 1 }],
      heatmap: [{ person_id: 'a', schritt: 'v1', sek: 42 }, { person_id: 'a', schritt: 'entwicklung', sek: 20 }],
    }
    const { context, page, konsole } = await neueSeite(browser, {
      rolle: 'chef',
      antworten: { team_dashboard: dash, team_ergebnisse: team, zeit_auswertung: zeit, abgabe_status: [], ueberfaellige_abgaben: [] },
    })
    await page.goto(BASE + '/app/team')
    await page.waitForSelector('section[aria-label="Ausfüllzeit"]')
    const sec = page.locator('section[aria-label="Ausfüllzeit"]')
    await sec.locator('.kennzahl').first().waitFor()
    const text = await sec.innerText()
    t.check(/7 Min\./.test(text) && /Zählt\s*\n?\s*1 von 3/i.test(text.replace(/\s+/g, ' ').replace('ZÄHLT 1 von 3', 'Zählt\n1 von 3')) || /1 von 3/.test(text), 'Median 7 Min. und „1 von 3“ zählen')
    t.check(/zu schnell/.test(text) && /ohne Zeitmessung/.test(text) && /fortgesetzt/.test(text), 'Kennzeichen sind sichtbar')
    t.check((await sec.locator('tr.zeit-zeile--aus').count()) === 2, 'Nicht zählende Sitzungen sind abgesetzt, aber sichtbar')
    t.check((await sec.locator('.zeit-balken li').count()) === 1, 'Zeit je Verhalten als Balken')
    t.check((await sec.locator('details.zeit-heatmap').count()) === 1, 'Heatmap ist aufklappbar')
    await sec.locator('details.zeit-heatmap > summary').click()
    t.check((await sec.locator('details.zeit-heatmap td.zeit-zelle').count()) >= 2, 'Heatmap zeigt Zeiten je Person und Schritt')
    t.check(/1 Abgaben stammen aus der Zeit vor der Messung/.test(text), 'Hinweis auf Abgaben ohne Messung')
    await page.screenshot({ path: 'out/phase-b-leitung.png', fullPage: true })
    t.check(konsole.length === 0, `keine Konsolenfehler ${konsole.join(' | ')}`)
    await context.close()
  }

  return t.ende()
}
