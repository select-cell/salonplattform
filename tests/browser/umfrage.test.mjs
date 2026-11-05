// Umfrage: Entwicklung zuerst, Video-Sperre, „Locked In“-Popup, Kommentarpflicht, automatisches Weiterspringen, Entwurf
import { BASE, neueSeite, pruefer } from './helfer.mjs'

const MONATE = [{ monat: '2026-10-01', monat_key: '2026-10', frist: '2026-10-31', tage_bis_frist: 20, abgegeben: false, abgegeben_am: null }]
const kriterien = (nr) => [1, 2, 3, 4, 5].map((s) => ({
  stufe: s, bezeichnung: `${s} – ${['Bewusstsein', 'Aufbau', 'Stabilität', 'Profi', 'High Performer'][s - 1]}`,
  prozent: ['0–25%', '25–50%', '50–75%', '75–100%', '110%'][s - 1], leitsatz: `Leitsatz ${nr}/${s}`, punkte: [`Punkt ${s}a`, `Punkt ${s}b`],
}))
const INHALT = {
  salon: { id: 's', name: 'Dawiid' }, person: { id: 'p1', name: 'Oksana Serafyn' },
  kolleginnen: [{ id: 'p2', name: 'Shadi Falapoor' }, { id: 'p3', name: 'Tuana Aliji' }],
  verhalten: [
    { nr: 1, titel: 'Erstes Verhalten', grundpfeiler: 'GP 1', saeule: 'Säule 1', video_url: null, kriterien: kriterien(1) },
    { nr: 2, titel: 'Zweites Verhalten', grundpfeiler: 'GP 1', saeule: 'Säule 1', video_url: null, kriterien: kriterien(2) },
  ],
}
const ENT_TITEL = 'Bei welchem Kollegen hast du im letzten Monat eine besonders positive Entwicklung im Verhalten beobachtet?'

const titel = (page) => page.locator('#schritt-titel').innerText()
const weiter = (page) => page.getByRole('button', { name: /^(Weiter|Los geht)/ }).click()
const fehlerText = async (page) => (await page.locator('.umfrage__fehler').innerText().catch(() => '')).trim()
const feld = (page, i) => page.locator('fieldset.bewertung').nth(i)
const klickeNote = (page, i, note) => feld(page, i).locator('label.skala__feld').nth(note - 1).click()
const lockIn = async (page, kommentar = 'Test') => {
  const d = page.locator('dialog.lockin')
  await d.waitFor()
  if (await d.locator('textarea[required]').count()) await d.locator('textarea').fill(kommentar)
  await d.getByRole('button', { name: /Locked In/ }).click()
  await d.waitFor({ state: 'detached' })
}
const bewerte = async (page, i, note, kommentar) => { await klickeNote(page, i, note); await lockIn(page, kommentar) }
const warteTitel = (page, text) => page.waitForFunction((t) => document.querySelector('#schritt-titel')?.textContent === t, text)
const freigeben = async (page) => { await page.clock.runFor(8200); await page.waitForSelector('fieldset.bewertung') }

export default async function (browser) {
  const t = pruefer('Umfrage')
  const antworten = {
    meine_monate: MONATE, umfrage_inhalt: INHALT,
    umfrage_starten: { sitzung: 's1', aktive_sek: 0, schritte: {}, wiederaufgenommen: false },
    umfrage_heartbeat: { aktive_sek: 0, status: 'laufend' },
    umfrage_einreichen_v3: '99999999-0000-0000-0000-000000000001',
    meine_ausfuellzeit: null,
  }

  t.abschnitt('Start und Entwicklung des Monats')
  const { context, page, aufrufe, konsole } = await neueSeite(browser, { rolle: 'ma', viewport: { width: 390, height: 844 }, antworten, clock: true })
  await page.goto(BASE + '/app/umfrage/2026-10')
  await page.waitForSelector('#schritt-titel')
  const start = await page.locator('.umfrage__inhalt').innerText()
  t.check(/2 Verhalten/.test(start) && /2 Kollegen/.test(start) && !/Ritual/.test(start), 'Start nennt Verhalten und Kollegen, keine Rituale')
  await weiter(page)
  t.check((await titel(page)) === ENT_TITEL, 'Erste Frage: Entwicklung des Monats')
  t.check((await page.locator('input[name="entwicklung"]').count()) === 2, 'Nur die zwei Kollegen zur Auswahl')
  await weiter(page)
  t.check((await fehlerText(page)).startsWith('Bitte wähle einen Kollegen'), 'Entwicklung: Person ist Pflicht')
  await page.getByLabel('Shadi Falapoor').check()
  await weiter(page)
  t.check((await fehlerText(page)).startsWith('Bitte begründe'), 'Entwicklung: Begründung ist Pflicht')
  await page.locator('#entwicklung-begruendung').fill('Stark verbessert')
  await weiter(page)

  t.abschnitt('Video-Sperre und Stufennamen')
  t.check((await titel(page)) === 'Erstes Verhalten', 'Verhalten 1')
  t.check((await page.locator('fieldset.bewertung').count()) === 0, 'Platzhalter-Video sperrt die Bewertung')
  await weiter(page)
  t.check((await fehlerText(page)) === 'Bitte schau dir zuerst das Video bis zum Ende an.', 'Weiter vor Ablauf wird abgelehnt')
  await freigeben(page)
  t.check((await page.locator('fieldset.bewertung').count()) === 3, 'Drei Bewertungen: ich selbst und zwei Kollegen')
  t.check((await page.locator('.bewertung__name').allInnerTexts()).join('|') === 'Du selbst|Shadi Falapoor|Tuana Aliji', 'Reihenfolge: ich zuerst')
  t.check((await page.locator('.skala__label').allInnerTexts()).slice(0, 5).join('|') === 'Bewusstsein|Aufbau|Stabilität|Profi|High Performer', 'Stufennamen unter den Zahlen')

  t.abschnitt('Locked-In-Popup')
  await weiter(page)
  t.check((await fehlerText(page)) === 'Bitte bewerte dich selbst.', 'Ohne Bewertung: „Bitte bewerte dich selbst.“')
  await klickeNote(page, 0, 2)
  const d = page.locator('dialog.lockin')
  await d.waitFor()
  const popup = await d.innerText()
  t.check(/Bewertung 2/.test(popup) && /Aufbau/.test(popup) && /25–50%/.test(popup) && /Leitsatz 1\/2/.test(popup) && /Punkt 2a/.test(popup), 'Popup zeigt die Stufe vollständig')
  t.check(/Selbstbild/.test(popup) && /Locked In/.test(popup), 'Popup nennt die Art der Bewertung')
  await d.getByRole('button', { name: 'Abbrechen' }).click()
  await d.waitFor({ state: 'detached' })
  t.check((await feld(page, 0).locator('input:checked').count()) === 0, 'Abbrechen speichert nichts')
  await klickeNote(page, 0, 2)
  await page.keyboard.press('Escape')
  await d.waitFor({ state: 'detached' })
  t.check((await feld(page, 0).locator('input:checked').count()) === 0, 'Esc speichert nichts')
  await bewerte(page, 0, 2)
  t.check((await feld(page, 0).locator('input:checked').getAttribute('value')) === '2', 'Bewertung 2 ist bestätigt')
  t.check(await feld(page, 0).locator('input').first().isDisabled(), 'Bestätigte Bewertung ist gesperrt')
  t.check((await feld(page, 0).locator('.badge--gruen').innerText()).includes('Locked In'), 'Kennzeichen „Locked In“')
  t.check(await page.evaluate(() => document.activeElement?.closest('fieldset')?.querySelector('.bewertung__name')?.textContent === 'Shadi Falapoor'), 'Fokus springt zur nächsten Person')
  await weiter(page)
  t.check((await fehlerText(page)) === 'Bitte bewerte Shadi Falapoor.', 'Nächste fehlende Person wird genannt')

  t.abschnitt('Kommentarpflicht ab Bewertung 4')
  await klickeNote(page, 1, 4)
  await d.waitFor()
  t.check(await d.getByRole('button', { name: /Locked In/ }).isDisabled(), '„Locked In“ ist ohne Kommentar gesperrt')
  t.check((await d.locator('label[for^="lockin-kommentar-"]').innerText()).includes('Pflicht ab Bewertung 4'), 'Hinweis „Pflicht ab Bewertung 4“')
  await d.locator('textarea').fill('Sehr aufmerksam')
  t.check(await d.getByRole('button', { name: /Locked In/ }).isEnabled(), 'Mit Kommentar ist „Locked In“ frei')
  await d.getByRole('button', { name: /Locked In/ }).click()
  await d.waitFor({ state: 'detached' })
  t.check((await page.locator('.bewertung__kommentar').first().innerText()) === 'Sehr aufmerksam', 'Kommentar steht bei der Bewertung')

  t.abschnitt('Entwurf übersteht das Neuladen')
  await page.reload()
  await page.waitForSelector('#schritt-titel')
  t.check((await titel(page)) === 'Erstes Verhalten', 'Gleicher Schritt nach dem Neuladen')
  await page.waitForSelector('fieldset.bewertung')
  t.check((await feld(page, 0).locator('input:checked').getAttribute('value')) === '2' && await feld(page, 0).locator('input').first().isDisabled(), 'Bestätigte Bewertung bleibt gesperrt')
  t.check((await feld(page, 1).locator('input:checked').getAttribute('value')) === '4', 'Zweite Bewertung bleibt erhalten')

  t.abschnitt('Weiterspringen bis zur Zusammenfassung und Abgabe')
  await bewerte(page, 2, 3)                       // letzte Person: weiter zum nächsten Verhalten
  await warteTitel(page, 'Zweites Verhalten')
  t.check(true, 'Nach der letzten Person geht es automatisch zum nächsten Verhalten')
  await freigeben(page)
  for (let i = 0; i < 3; i++) await bewerte(page, i, 3)
  await warteTitel(page, 'Deine Zusammenfassung')
  const z = await page.locator('.umfrage__inhalt').innerText()
  t.check(/Du selbst[\s\S]*Selbstbild[\s\S]*Ø \d,\d/.test(z) && /Shadi Falapoor/.test(z) && /2 Verhalten bewertet/.test(z), 'Zusammenfassung mit Durchschnitten')
  t.check(!/Ritual/.test(z), 'Zusammenfassung ohne Rituale')
  t.check(await page.getByRole('button', { name: 'Umfrage absenden' }).isEnabled(), 'Absenden ist freigeschaltet')
  await page.getByRole('button', { name: 'Umfrage absenden' }).click()
  await page.waitForSelector('h2:has-text("Danke, Oksana!")')
  const v3 = aufrufe.find((a) => a.rpc === 'umfrage_einreichen_v3').body
  const p = v3.payload
  t.check(p.monat === '2026-10' && p.bewertungen.length === 6, 'Nutzdaten: Monat und 6 Bewertungen (2 × 3)')
  t.check(!('rituale' in p) && p.entwicklung.person_id === 'p2' && p.entwicklung.begruendung === 'Stark verbessert', 'Nutzdaten: keine Rituale, Entwicklung mit Begründung')
  t.check(p.bewertungen.filter((b) => b.note >= 4).every((b) => b.kommentar.length > 0), 'Kommentar bei jeder Bewertung ab 4')
  t.check(!('feedbackgeber' in p) && !('feedbackgeber_id' in p), 'Nutzdaten enthalten keinen Absender')
  t.check((await page.evaluate(() => Object.keys(localStorage).filter((k) => /umfrage/.test(k)))).length === 0, 'Entwurf wird nach dem Absenden gelöscht')
  t.check(konsole.length === 0, `keine Konsolenfehler ${konsole.join(' | ')}`)
  await context.close()

  t.abschnitt('Fehler beim Absenden')
  {
    const fehler = { ...antworten, umfrage_einreichen_v3: { status: 400, body: { code: '23505', message: 'Du hast die Umfrage für diesen Monat bereits abgegeben.' } } }
    const s = await neueSeite(browser, { rolle: 'ma', antworten: fehler })
    const entwurf = { version: 1, monat: '2026-10', gestartetAm: new Date().toISOString(), schritt: 4, noten: {}, kommentare: {}, videos: { v1: true, v2: true }, entwicklung: { personId: 'p2', begruendung: 'x' } }
    for (const v of INHALT.verhalten) for (const person of ['p1', 'p2', 'p3']) entwurf.noten[`${v.nr}:${person}`] = 2
    await s.page.addInitScript(([k, v]) => localStorage.setItem(k, v), ['dawiid-umfrage:u1:2026-10', JSON.stringify(entwurf)])
    await s.page.goto(BASE + '/app/umfrage/2026-10')
    await s.page.waitForSelector('h2:has-text("Deine Zusammenfassung")')
    await s.page.getByRole('button', { name: 'Umfrage absenden' }).click()
    await s.page.waitForSelector('.umfrage__inhalt [role=alert]')
    t.check((await s.page.locator('.umfrage__inhalt [role=alert]').innerText()).includes('bereits abgegeben'), 'Fehlermeldung der Datenbank wird angezeigt')
    t.check((await s.page.evaluate(() => Object.keys(localStorage).filter((k) => /umfrage/.test(k)).length)) === 1, 'Entwurf bleibt bei einem Fehler erhalten')
    await s.context.close()
  }

  return t.ende()
}
