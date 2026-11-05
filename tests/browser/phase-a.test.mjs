// Phase A: Marke zentral, Logo in Hell und Nacht, Info-Seite, Texte
import { BASE, neueSeite, pruefer } from './helfer.mjs'

const MONATE = [{ monat: '2026-10-01', monat_key: '2026-10', frist: '2026-10-31', tage_bis_frist: 20, abgegeben: false, abgegeben_am: null }]

export default async function (browser) {
  const t = pruefer('Phase A: Marke, Info-Seite')
  const antworten = { meine_monate: MONATE, abgabe_status: [], ueberfaellige_abgaben: [] }

  t.abschnitt('Logo und Texte')
  {
    const { context, page, konsole } = await neueSeite(browser, { rolle: 'ma', antworten })
    await page.goto(BASE + '/app')
    await page.waitForSelector('.marke__logo')
    const info = await page.locator('.marke__logo').evaluate((el) => {
      const cs = getComputedStyle(el)
      return { farbe: cs.backgroundColor, maske: cs.maskImage || cs.webkitMaskImage, name: el.getAttribute('aria-label'), h: el.getBoundingClientRect().height }
    })
    t.check(info.farbe === 'rgb(53, 53, 50)', `Logo hell in #353532 (${info.farbe})`)
    t.check(/logo-maske/.test(info.maske), 'Logo kommt aus der Marken-Datei (brand/dawiid/logo-maske)')
    t.check(info.name === 'DAWIID' && info.h === 40, `Logo heißt DAWIID, Höhe ${info.h}`)
    await page.getByRole('button', { name: 'Nachtmodus einschalten' }).click()
    const nacht = await page.locator('.marke__logo').evaluate((el) => getComputedStyle(el).backgroundColor)
    t.check(nacht === 'rgb(236, 232, 225)', `Logo im Nachtmodus in #ece8e1 (${nacht})`)
    t.check((await page.locator('.fuss').innerText()).startsWith('DAWIID · Team-Plattform'), 'Fußzeile: DAWIID · Team-Plattform')
    t.check(!/Mitarbeiterin|Kolleginnen|Teilnehmerinnen/.test(await page.locator('body').innerText()), 'Keine weibliche Form im sichtbaren Text')
    t.check(konsole.length === 0, `keine Konsolenfehler ${konsole.join(' | ')}`)
    await context.close()
  }

  t.abschnitt('Info und Datenschutz')
  {
    const { context, page } = await neueSeite(browser, { rolle: 'ma', antworten })
    await page.goto(BASE + '/app')
    await page.waitForSelector('.fuss')
    await page.getByRole('link', { name: 'Info und Datenschutz' }).click()
    await page.waitForURL('**/app/info')
    await page.waitForSelector('h1:has-text("Info und Datenschutz")')
    const text = await page.locator('main').innerText()
    t.check(/anmeldung/i.test(text) && /deine angaben in der umfrage/i.test(text), 'Seite zeigt Abschnitte Anmeldung und Umfrage-Angaben')
    t.check(/ohne.*Namen des Absenders/.test(text) || /ohne\s+Namen/.test(text), 'Erklärt: Kommentare ohne Absender')
    await context.close()
  }

  t.abschnitt('Entwurf unter dem Marken-Schlüssel')
  {
    const entwurf = { version: 1, monat: '2026-10', gestartetAm: new Date().toISOString(), schritt: 0, noten: {}, kommentare: {}, videos: {}, entwicklung: { personId: null, begruendung: '' } }
    const inhalt = {
      salon: { id: 's', name: 'Dawiid' }, person: { id: 'p', name: 'Oksana' }, kolleginnen: [],
      verhalten: [{ nr: 1, titel: 'Testverhalten', grundpfeiler: null, saeule: null, video_url: null, kriterien: [] }],
    }
    const { context, page } = await neueSeite(browser, { rolle: 'ma', antworten: { ...antworten, umfrage_inhalt: inhalt } })
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), ['umfrage-entwurf:u1:2026-10', JSON.stringify(entwurf)])
    await page.goto(BASE + '/app/umfrage/2026-10')
    await page.waitForSelector('#schritt-titel')
    await page.waitForTimeout(300)
    const schluessel = await page.evaluate(() => Object.keys(localStorage).filter((k) => /umfrage/.test(k)))
    t.check(schluessel.some((k) => k.startsWith('dawiid-umfrage:u1:')), `Entwurf wird unter dawiid-umfrage: weitergeführt (${schluessel.join(', ')})`)
    await context.close()
  }

  return t.ende()
}
