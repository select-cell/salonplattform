// Phase E: Monatsabschluss und Einzelanalyse (Abschluss, Entwurf, Bearbeiten, Faktencheck-Hinweis, Freigabe, PDF)
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { BASE, neueSeite, pruefer } from './helfer.mjs'

const ZIEL = 'out/pdf-test'
mkdirSync(ZIEL, { recursive: true })

const A = '11111111-0000-0000-0000-0000000000b1'
const B = '11111111-0000-0000-0000-0000000000b2'
const L = '11111111-0000-0000-0000-0000000000b3'
const NAMEN = { [A]: 'Anna Berger', [B]: 'Berta Hollmann-Kranz', [L]: 'Ludwig Leiter' }
const SCHWELLEN = { ausgewogen: 0.3, niedrig: 2.5, hoch: 3.5 }

const TEXT = '## Zusammenfassung\nDas Fremdbild liegt bei 3,0, das Selbstbild bei 4,0.\n\n## Stärken\n- Verhalten 1 ist **besonders stark**\n- Zweite Stärke\n\n## Entwicklungsfelder\n- Verhalten 2 braucht Unterstützung'

/** Nachgebaute Datenbank für diese Seite: Abschluss und Analysen ändern sich durch die Aktionen. */
function welt({ abschluss = null, aktuell = { abgaben: 3, erwartet: 4 }, kiFehler = null } = {}) {
  const z = { abschluss, aktuell, analysen: {}, ki: [], kiFehler }
  const kurz = (a) => ({ status: a.status, geprueft: a.geprueft, bearbeitet: a.bearbeitet, aktualisiert_am: a.aktualisiert_am, freigegeben_am: a.freigegeben_am, veraltet: a.veraltet })
  const jetzt = () => '2026-11-05T09:30:00Z'
  const antworten = {
    abschluss_uebersicht: () => ({
      monat: '2026-09', monate: ['2026-09', '2026-08'], eigene_analyse_nur_admin: false,
      abschluss: z.abschluss, aktuell: z.aktuell,
      nicht_abgegeben: [{ id: 'c', name: 'Cora Sommer' }],
      personen: [A, B, L].map((id) => ({ id, name: NAMEN[id], analyse: z.analysen[id] ? kurz(z.analysen[id]) : null })),
    }),
    monat_abschliessen: () => {
      const schon = !!z.abschluss
      z.abschluss = { monat: '2026-09', abgeschlossen_am: jetzt(), aktualisiert_am: jetzt(), von: 'Dawid Chef', abgaben: z.aktuell.abgaben, erwartet: z.aktuell.erwartet, unvollstaendig: z.aktuell.abgaben < z.aktuell.erwartet }
      return { ...z.abschluss, bereits_abgeschlossen: schon }
    },
    'fn:analyse-erstellen': (b) => {
      z.ki.push(b)
      if (z.kiFehler) return z.kiFehler
      const alt = z.analysen[b.person_id]
      if (alt && !b.neu) return { ok: true, uebersprungen: true, versuche: 0, analyse: alt }
      const a = {
        person_id: b.person_id, monat: b.monat, status: 'entwurf', text: TEXT, geprueft: true, pruef_hinweis: null, bearbeitet: false,
        prompt_version: 'analyse-v1', anbieter: 'claude', modell: 'modell-x', versuche: 1, erstellt_am: jetzt(), aktualisiert_am: jetzt(),
        bearbeitet_am: null, bearbeitet_von: null, freigegeben_am: null, freigegeben_von: null, veraltet: false,
      }
      z.analysen[b.person_id] = a
      return { ok: true, uebersprungen: false, versuche: 1, analyse: a }
    },
    analyse_lesen: (b) => z.analysen[b.p_person] ?? null,
    analyse_bearbeiten: (b) => {
      const a = z.analysen[b.p_person]
      if (a.text === b.p_text) return a
      const falsch = /4,71/.test(b.p_text)
      Object.assign(a, { text: b.p_text, status: 'entwurf', bearbeitet: true, bearbeitet_von: 'Dawid Chef', bearbeitet_am: jetzt(), freigegeben_am: null, freigegeben_von: null,
        geprueft: !falsch, pruef_hinweis: falsch ? 'Faktencheck nicht bestanden: 4,71 steht nicht in den Daten' : null })
      return a
    },
    analyse_freigeben: (b) => {
      const a = z.analysen[b.p_person]
      Object.assign(a, b.p_freigeben ? { status: 'freigegeben', freigegeben_am: jetzt(), freigegeben_von: 'Dawid Chef' } : { status: 'entwurf', freigegeben_am: null, freigegeben_von: null })
      return a
    },
    abgabe_status: [], ueberfaellige_abgaben: [], meine_monate: [],
  }
  return { z, antworten }
}

const kennt = (seite) => seite.getByRole('button', { name: 'Verstanden' }).click().catch(() => undefined)
const zeile = (seite, name) => seite.locator('[data-testid="analyse-tabelle"] > li', { hasText: name })

export default async function (browser) {
  const t = pruefer('Phase E: Monatsabschluss und Einzelanalyse')

  t.abschnitt('Zugriff und Hinweise')
  {
    const w = welt()
    const { page, context } = await neueSeite(browser, { rolle: 'ma', antworten: w.antworten })
    await page.goto(BASE + '/app/leitung/abschluss')
    await page.waitForURL('**/app')
    t.check(true, 'Mitarbeiter werden von /app/leitung/abschluss auf /app umgeleitet')
    await context.close()
  }
  {
    const w = welt()
    const { page, context } = await neueSeite(browser, { rolle: 'chef', antworten: w.antworten })
    await page.goto(BASE + '/app/leitung')
    await kennt(page)
    await page.waitForURL('**/app/leitung/kommentare')
    t.check((await page.locator('.unternav__link').allInnerTexts()).includes('Monatsabschluss'), 'Unter-Navigation zeigt „Monatsabschluss“')
    await page.getByRole('link', { name: 'Monatsabschluss' }).click()
    await page.waitForURL('**/app/leitung/abschluss')
    const hinweis = await page.locator('[data-testid="datenschutz-hinweis"]').innerText()
    t.check(/ohne Namen und ohne Absender/.test(hinweis) && /Kollege A, B/.test(hinweis) && /Mitarbeiter bekommen keine Analysen/.test(hinweis), 'Datenschutz-Hinweis steht auf der Seite')
    await context.close()
  }

  t.abschnitt('Monat abschließen (unvollständig)')
  const w = welt()
  const { context, page, aufrufe, konsole } = await neueSeite(browser, { rolle: 'chef', antworten: w.antworten })
  await page.goto(BASE + '/app/leitung/abschluss')
  await kennt(page)
  await page.getByText('noch nicht abgeschlossen').waitFor()
  let text = await page.locator('main').innerText()
  t.check(/Bisher: 3 von 4 Abgaben/.test(text), 'Zeigt „Bisher: 3 von 4 Abgaben“')
  t.check(/Noch nicht abgegeben:\s*Cora Sommer/.test(await page.locator('[data-testid="nicht-abgegeben"]').innerText()), 'Nennt, wer noch nicht abgegeben hat')
  t.check((await page.locator('[data-testid="analyse-tabelle"]').count()) === 0, 'Analysen erscheinen erst nach dem Abschluss')
  await page.getByRole('button', { name: 'Monat abschließen' }).click()
  await page.getByRole('group', { name: 'Unvollständig abschließen?' }).waitFor()
  t.check(/Es fehlen noch 1 Abgaben/.test(await page.locator('main').innerText()) && /3 von 4/.test(await page.locator('main').innerText()), 'Rückfrage bei fehlenden Abgaben')
  t.check(!aufrufe.some((a) => a.rpc === 'monat_abschliessen'), 'Vor der Bestätigung wird nichts abgeschlossen')
  await page.getByRole('button', { name: 'Abbrechen' }).click()
  await page.getByRole('button', { name: 'Monat abschließen' }).click()
  await page.getByRole('button', { name: 'Ja, unvollständig abschließen' }).click()
  await page.getByText('ist abgeschlossen: 3 von 4 Abgaben').waitFor()
  t.check(aufrufe.filter((a) => a.rpc === 'monat_abschliessen').length === 1 && aufrufe.find((a) => a.rpc === 'monat_abschliessen').body.p_monat === '2026-09-01', 'monat_abschliessen für 2026-09-01')
  await page.getByTestId('analyse-tabelle').waitFor()
  text = await page.locator('main').innerText()
  t.check(/3 von 4/.test(text) && /unvollständig/.test(text) && /von Dawid Chef/.test(text), 'Abschluss zeigt „3 von 4“, „unvollständig“ und wer abgeschlossen hat')
  t.check((await page.locator('[data-testid="analyse-tabelle"] > li').count()) === 3, 'Drei Personen mit Bewertungen')
  t.check((await zeile(page, 'Anna').innerText()).includes('Noch keine Analyse'), 'Noch keine Analyse')

  t.abschnitt('Analyse erstellen, lesen, bearbeiten, freigeben')
  await zeile(page, 'Anna').getByRole('button', { name: 'Erstellen' }).click()
  await page.getByTestId('analyse-panel').waitFor()
  const ki = aufrufe.filter((a) => a.rpc === 'fn:analyse-erstellen')
  t.check(ki.length === 1 && ki[0].body.person_id === A && ki[0].body.monat === '2026-09' && ki[0].body.neu === false, 'Edge Function mit Person, Monat und neu = false')
  t.check(/Entwurf für Anna Berger erstellt/.test(await page.locator('main').innerText()), 'Meldung „Entwurf … erstellt“')
  const panel = page.getByTestId('analyse-panel')
  t.check((await panel.locator('h3.md__titel').allInnerTexts()).join('|') === 'Zusammenfassung|Stärken|Entwicklungsfelder', 'Überschriften aus dem Text')
  t.check((await panel.locator('ul.md__liste li').count()) === 3 && (await panel.locator('strong', { hasText: 'besonders stark' }).count()) === 1, 'Aufzählungen und Fettdruck')
  const badges = await panel.locator('.badges').first().innerText()
  t.check(/Entwurf/.test(badges) && /Faktencheck bestanden/.test(badges), 'Badges: Entwurf, Faktencheck bestanden')
  t.check(/mit claude \(modell-x\)/.test(await panel.innerText()), 'Hinweis auf Anbieter und Modell')
  t.check(/Entwurf/.test(await zeile(page, 'Anna').innerText()), 'Tabellenzeile zeigt „Entwurf“')

  // Bearbeiten mit falscher Zahl
  await panel.getByRole('button', { name: 'Bearbeiten' }).click()
  const editor = page.locator('#analyse-text')
  t.check((await editor.inputValue()) === TEXT, 'Editor zeigt den Text')
  await editor.fill(TEXT + '\n\nDas Fremdbild liegt bei 4,71.')
  await panel.getByRole('button', { name: 'Speichern' }).click()
  await page.getByTestId('pruef-hinweis').waitFor()
  t.check(/Faktencheck nicht bestanden: 4,71 steht nicht in den Daten/.test(await page.getByTestId('pruef-hinweis').innerText()), 'Hinweis: 4,71 steht nicht in den Daten')
  t.check(/Gespeichert, aber: Faktencheck nicht bestanden: 4,71/.test(await page.locator('main').innerText()), 'Meldung nennt die Abweichung')
  t.check(/bearbeitet/.test(await panel.locator('.badges').first().innerText()) && /Faktencheck nicht bestanden/.test(await zeile(page, 'Anna').innerText()), 'Badges: bearbeitet, Faktencheck nicht bestanden (auch in der Tabelle)')
  t.check(/Bearbeitet von Dawid Chef/.test(await panel.innerText()), 'Wer bearbeitet hat')

  // Korrigieren und freigeben
  await panel.getByRole('button', { name: 'Bearbeiten' }).click()
  await editor.fill(TEXT)
  await panel.getByRole('button', { name: 'Speichern' }).click()
  await page.getByText(/Gespeichert\. Die Analyse ist wieder ein Entwurf/).waitFor()
  await page.getByTestId('pruef-hinweis').waitFor({ state: 'detached' })
  t.check((await page.getByTestId('pruef-hinweis').count()) === 0, 'Nach der Korrektur kein Hinweis mehr')
  await panel.getByRole('button', { name: 'Freigeben', exact: true }).click()
  await page.getByText(/Freigegeben\. Die Analyse für Anna Berger steht jetzt im Personenbericht/).waitFor()
  t.check(/Freigegeben/.test(await zeile(page, 'Anna').innerText()), 'Tabelle: Freigegeben')
  t.check(/Freigegeben von Dawid Chef/.test(await panel.innerText()), 'Panel nennt, wer freigegeben hat')
  t.check(aufrufe.some((a) => a.rpc === 'analyse_freigeben' && a.body.p_freigeben === true), 'analyse_freigeben(true)')

  // Neu generieren mit Rückfrage
  await panel.getByRole('button', { name: 'Neu generieren' }).click()
  await panel.getByRole('group', { name: 'Neu generieren?' }).waitFor()
  t.check(/ist freigegeben/.test(await panel.innerText()) && ki.length === 1, 'Rückfrage bei freigegebener Analyse, noch kein neuer KI-Aufruf')
  await panel.getByRole('button', { name: 'Abbrechen' }).click()
  await panel.getByRole('button', { name: 'Neu generieren' }).click()
  await panel.getByRole('button', { name: 'Ja, neu generieren' }).click()
  await page.getByText(/Entwurf für Anna Berger erstellt/).waitFor()
  const kiNeu = aufrufe.filter((a) => a.rpc === 'fn:analyse-erstellen')
  t.check(kiNeu.length === 2 && kiNeu[1].body.neu === true, 'Zweiter Aufruf mit neu = true')
  w.z.analysen[A].status = 'freigegeben' // (Zustand zurücksetzen, um die Rücknahme zu prüfen)
  await page.getByRole('button', { name: 'Schließen' }).click()
  await zeile(page, 'Anna').getByRole('button', { name: 'Öffnen' }).click()
  await page.getByTestId('analyse-panel').getByRole('button', { name: 'Freigabe zurücknehmen' }).click()
  await page.getByText(/Freigabe zurückgenommen/).waitFor()
  t.check(/Entwurf/.test(await zeile(page, 'Anna').innerText()), 'Freigabe zurückgenommen: wieder Entwurf')

  t.abschnitt('Alle fehlenden erstellen und Fehler')
  await page.getByRole('button', { name: 'Alle fehlenden erstellen' }).click()
  await page.getByText(/2 Entwürfe erstellt/).waitFor()
  const neueAufrufe = aufrufe.filter((a) => a.rpc === 'fn:analyse-erstellen').slice(2)
  t.check(neueAufrufe.length === 2 && neueAufrufe.map((a) => a.body.person_id).sort().join() === [B, L].sort().join(), 'Nur für die zwei Personen ohne Analyse, nacheinander')
  t.check(await page.getByRole('button', { name: 'Alle fehlenden erstellen' }).isDisabled(), 'Knopf ist danach gesperrt (nichts fehlt mehr)')
  t.check(/Bitte jeden Entwurf lesen/.test(await page.locator('main').innerText()), 'Hinweis: jeden Entwurf lesen')
  await context.close()

  {
    const f = welt({ abschluss: { monat: '2026-09', abgeschlossen_am: '2026-11-05T09:30:00Z', aktualisiert_am: '2026-11-05T09:30:00Z', von: 'Dawid Chef', abgaben: 3, erwartet: 4, unvollstaendig: true }, kiFehler: { status: 503, body: { ok: false, fehler: 'Die KI ist noch nicht eingerichtet.' } } })
    const { page: p, context: c } = await neueSeite(browser, { rolle: 'chef', antworten: f.antworten })
    await p.goto(BASE + '/app/leitung/abschluss')
    await kennt(p)
    await zeile(p, 'Anna').getByRole('button', { name: 'Erstellen' }).click()
    await p.getByRole('alert').filter({ hasText: 'Die KI ist noch nicht eingerichtet.' }).waitFor()
    t.check(true, 'KI nicht eingerichtet: verständliche Meldung')
    t.check(await zeile(p, 'Anna').getByRole('button', { name: 'Erstellen' }).isEnabled(), 'Danach lässt sich erneut versuchen')
    await c.close()
  }

  t.abschnitt('Stand aktualisieren und vollständiger Abschluss')
  {
    const f = welt({ abschluss: { monat: '2026-09', abgeschlossen_am: '2026-11-05T09:30:00Z', aktualisiert_am: '2026-11-05T09:30:00Z', von: 'Dawid Chef', abgaben: 3, erwartet: 4, unvollstaendig: true }, aktuell: { abgaben: 4, erwartet: 4 } })
    const { page: p, context: c, aufrufe: a } = await neueSeite(browser, { rolle: 'admin', antworten: f.antworten })
    await p.goto(BASE + '/app/leitung/abschluss')
    await kennt(p)
    await p.getByTestId('abschluss-veraltet').waitFor()
    t.check(/jetzt 4 von 4 Abgaben/.test(await p.getByTestId('abschluss-veraltet').innerText()), 'Hinweis: seit dem Abschluss hat sich etwas geändert')
    await p.getByRole('button', { name: 'Stand aktualisieren' }).click()
    await p.getByText('Stand aktualisiert: 4 von 4 Abgaben.').waitFor()
    t.check(a.some((x) => x.rpc === 'monat_abschliessen'), 'Aktualisieren ruft monat_abschliessen erneut')
    t.check((await p.getByTestId('abschluss-veraltet').count()) === 0 && /vollständig/.test(await p.locator('main').innerText()), 'Danach vollständig, kein Hinweis mehr')
    await c.close()
  }
  {
    const f = welt({ aktuell: { abgaben: 4, erwartet: 4 } })
    const { page: p, context: c } = await neueSeite(browser, { rolle: 'chef', antworten: f.antworten })
    await p.goto(BASE + '/app/leitung/abschluss')
    await kennt(p)
    await p.getByRole('button', { name: 'Monat abschließen' }).click()
    await p.getByText('ist abgeschlossen: 4 von 4 Abgaben').waitFor()
    t.check(true, 'Vollständiger Monat: Abschluss ohne Rückfrage')
    await c.close()
  }

  t.abschnitt('Handy-Breite, Nachtmodus')
  {
    const f = welt({ abschluss: { monat: '2026-09', abgeschlossen_am: '2026-11-05T09:30:00Z', aktualisiert_am: '2026-11-05T09:30:00Z', von: 'Dawid Chef', abgaben: 3, erwartet: 4, unvollstaendig: true } })
    f.z.analysen[A] = { person_id: A, monat: '2026-09', status: 'freigegeben', text: TEXT, geprueft: false, pruef_hinweis: 'Faktencheck nicht bestanden: 4,71 steht nicht in den Daten', bearbeitet: true, prompt_version: 'analyse-v1', anbieter: 'claude', modell: 'm', versuche: 3, erstellt_am: '2026-11-05T09:30:00Z', aktualisiert_am: '2026-11-05T09:30:00Z', bearbeitet_am: '2026-11-05T09:30:00Z', bearbeitet_von: 'Dawid Chef', freigegeben_am: '2026-11-05T09:30:00Z', freigegeben_von: 'Dawid Chef', veraltet: true }
    for (const [name, viewport, colorScheme] of [['handy', { width: 375, height: 800 }, 'light'], ['nacht', { width: 1280, height: 900 }, 'dark']]) {
      const { page: p, context: c, konsole: k } = await neueSeite(browser, { rolle: 'chef', antworten: f.antworten, viewport, colorScheme })
      await p.goto(BASE + '/app/leitung/abschluss')
      await kennt(p)
      await zeile(p, 'Anna').getByRole('button', { name: 'Öffnen' }).click()
      await p.getByTestId('analyse-panel').waitFor()
      const breite = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, fenster: window.innerWidth }))
      t.check(breite.scroll <= breite.fenster, `${name}: kein waagerechter Überlauf (${breite.scroll} ≤ ${breite.fenster})`)
      t.check(/Daten geändert/.test(await zeile(p, 'Anna').innerText()), `${name}: „Daten geändert“ sichtbar`)
      await p.screenshot({ path: `out/phase-e-${name}.png`, fullPage: true })
      t.check(k.length === 0, `${name}: keine Konsolenfehler ${k.join(' | ')}`)
      await c.close()
    }
  }

  t.check(konsole.length === 0, `keine Konsolenfehler im Hauptablauf ${konsole.join(' | ')}`)

  t.abschnitt('PDF: nur eine freigegebene Analyse kommt in den Personenbericht')
  {
    const dash = {
      schwellen: SCHWELLEN, monate: ['2026-09'], monat: '2026-09',
      personen: [{ id: A, name: 'Anna Berger', sb: 4, fb: 3, differenz: 1, minuten: 6, rang: 1 }],
      verhalten: [{ nr: 1, grundpfeiler: 'GP', saeule: 'Säule 1', titel: 'Testverhalten', sb: 4, fb: 3 }],
      matrix: [{ nr: 1, person_id: A, sb: 4, fb: 3 }], rituale_skalen: [], rituale_phasen: [], entwicklung: [],
    }
    const team = { schwellen: SCHWELLEN, monate: ['2026-09'], verhalten: [], rituale_skalen: [], rituale_phasen: [], entwicklung: [], dauer: [] }
    const zeit = { monat: '2026-09', monate: ['2026-09'], abgaben_ohne_zeit: 0, einstellungen: { min_sek_pro_verhalten: 5, sehr_lang_sek: 14400, pausen_quote: 0.3, heartbeat_luecke_sek: 180 }, personen: [], zusammenfassung: { abgegeben: 1, zaehlt: 1, median_sek: 400, min_sek: 400, max_sek: 400 }, verhalten: [], heatmap: [] }
    const bericht = (analyse) => ({
      salon: 'DAWIID', monat: '2026-09', erstellt_am: '2026-11-05T09:30:00Z', person: { id: A, name: 'Anna Berger' }, schwellen: SCHWELLEN,
      verhalten: [{ monat: '2026-09', nr: 1, grundpfeiler: 'GP', saeule: 'Säule 1', titel: 'Testverhalten', sb: 4, fb: 3 }],
      kommentare: [], selbst_kommentare: [], entwicklung: [], analyse,
    })
    const personenAntwort = { person: { id: A, name: 'Anna Berger' }, schwellen: SCHWELLEN, monate: ['2026-09'], verhalten: bericht(null).verhalten, kommentare: [], rituale: [], dauer: [], entwicklung: [], einzelwerte: [] }
    const lade = async (analyse, datei) => {
      const { page: p, context: c } = await neueSeite(browser, {
        rolle: 'chef',
        antworten: { team_dashboard: dash, team_ergebnisse: team, zeit_auswertung: zeit, abgabe_status: [], ueberfaellige_abgaben: [], person_ergebnisse: personenAntwort, pdf_personenbericht: bericht(analyse) },
      })
      await p.goto(BASE + '/app/team')
      await kennt(p)
      await p.getByRole('button', { name: 'Anna', exact: true }).click()
      await p.getByRole('heading', { name: 'Anna Berger' }).waitFor()
      const [d] = await Promise.all([p.waitForEvent('download', { timeout: 60_000 }), p.getByRole('button', { name: 'Personenbericht als PDF' }).click()])
      const pfad = `${ZIEL}/${datei}`
      await d.saveAs(pfad)
      await c.close()
      return pfad
    }
    const mit = await lade({ text: TEXT, freigegeben_am: '2026-11-05T09:30:00Z', freigegeben_von: 'Dawid Chef' }, 'analyse-mit.pdf')
    const ohne = await lade(null, 'analyse-ohne.pdf')
    const mitText = execFileSync('pdftotext', ['-layout', mit, '-'], { encoding: 'utf8' })
    const flach = mitText.replace(/\s+/g, ' ')
    t.check(/Analyse/.test(mitText) && /Gesprächsgrundlage/.test(flach) && /Freigegeben von Dawid Chef am 5\. November 2026/.test(flach), 'PDF mit Analyse: Abschnitt, Hinweis, Freigabe')
    t.check(/Zusammenfassung/.test(mitText) && /Das Fremdbild liegt bei 3,0, das Selbstbild bei 4,0\./.test(flach) && /Verhalten 1 ist besonders stark/.test(flach), 'PDF: Überschrift, Text und Aufzählung (Fettdruck ohne Sternchen)')
    t.check(!/\*\*/.test(mitText), 'PDF: keine Markdown-Zeichen')
    t.check(/Stärken/.test(mitText) && /Entwicklungsfelder/.test(mitText), 'PDF: Überschriften mit Umlauten')
    const schriften = execFileSync('pdffonts', [mit], { encoding: 'utf8' }).split('\n').slice(2).filter(Boolean)
    t.check(schriften.length > 0 && schriften.every((z) => /\byes\b/.test(z.slice(-30)) || / yes /.test(z)) && !schriften.some((z) => /Helvetica/.test(z)), 'PDF: alle Schriften eingebettet, kein Helvetica')
    const ohneText = execFileSync('pdftotext', ['-layout', ohne, '-'], { encoding: 'utf8' })
    t.check(!/Gesprächsgrundlage/.test(ohneText) && !/Zusammenfassung/.test(ohneText), 'PDF ohne freigegebene Analyse: kein Analyse-Abschnitt')
  }

  return t.ende()
}
