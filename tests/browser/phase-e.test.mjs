// Phase E: Monatsabschluss und Einzelanalyse (Abschluss, Entwurf, Bearbeiten, Faktencheck-Hinweis, Freigabe, PDF)
// und Version 1.3: KI nur für den Admin, Sammellauf, Gesamtauswertung des Teams
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

const GESAMT_TEXT = '## Zusammenfassung\nDas Team liegt beim Fremdbild bei 3,8.\n\n## Stärken des Teams\n- Verhalten 1 ist **besonders stark**\n\n## Entwicklungsfelder des Teams\n- Verhalten 2 braucht Aufmerksamkeit'

/**
 * Nachgebaute Datenbank für diese Seite: Abschluss und Analysen ändern sich durch die Aktionen.
 * ki: darf die aufrufende Person die KI nutzen (Standard: nur Admin). paket: so viele Personen bearbeitet ein Sammellauf-Aufruf.
 * sammelFehler: Personen, für die der Sammellauf keine Analyse zustande bringt.
 */
function welt({ abschluss = null, aktuell = { abgaben: 3, erwartet: 4 }, kiFehler = null, ki = true, paket = 3, sammelFehler = [] } = {}) {
  const z = { abschluss, aktuell, analysen: {}, gesamt: null, ki: [], kiFehler }
  const kurz = (a) => ({ status: a.status, geprueft: a.geprueft, bearbeitet: a.bearbeitet, aktualisiert_am: a.aktualisiert_am, freigegeben_am: a.freigegeben_am, veraltet: a.veraltet })
  const jetzt = () => '2026-11-05T09:30:00Z'
  const neueAnalyse = (personId, monat, text, prompt) => ({
    person_id: personId, monat, status: 'entwurf', text, geprueft: true, pruef_hinweis: null, bearbeitet: false,
    prompt_version: prompt, anbieter: 'webhook', modell: null, versuche: 1, erstellt_am: jetzt(), aktualisiert_am: jetzt(),
    bearbeitet_am: null, bearbeitet_von: null, freigegeben_am: null, freigegeben_von: null, veraltet: false,
  })
  const bearbeiten = (a, b) => {
    if (a.text === b.p_text) return a
    const falsch = /4,71/.test(b.p_text)
    Object.assign(a, { text: b.p_text, status: 'entwurf', bearbeitet: true, bearbeitet_von: 'Dawid Chef', bearbeitet_am: jetzt(), freigegeben_am: null, freigegeben_von: null,
      geprueft: !falsch, pruef_hinweis: falsch ? 'Faktencheck nicht bestanden: 4,71 steht nicht in den Daten' : null })
    return a
  }
  const freigeben = (a, b) => {
    Object.assign(a, b.p_freigeben ? { status: 'freigegeben', freigegeben_am: jetzt(), freigegeben_von: 'Dawid Chef' } : { status: 'entwurf', freigegeben_am: null, freigegeben_von: null })
    return a
  }
  const antworten = {
    abschluss_uebersicht: () => ({
      monat: '2026-09', monate: ['2026-09', '2026-08'], eigene_analyse_nur_admin: false, ki,
      abschluss: z.abschluss, aktuell: z.aktuell,
      nicht_abgegeben: [{ id: 'c', name: 'Cora Sommer' }],
      personen: [A, B, L].map((id) => ({ id, name: NAMEN[id], analyse: ki && z.analysen[id] ? kurz(z.analysen[id]) : null })),
      gesamt: ki ? (z.gesamt ? kurz(z.gesamt) : null) : null,
    }),
    monat_abschliessen: () => {
      const schon = !!z.abschluss
      z.abschluss = { monat: '2026-09', abgeschlossen_am: jetzt(), aktualisiert_am: jetzt(), von: 'Dawid Chef', abgaben: z.aktuell.abgaben, erwartet: z.aktuell.erwartet, unvollstaendig: z.aktuell.abgaben < z.aktuell.erwartet }
      return { ...z.abschluss, bereits_abgeschlossen: schon }
    },
    'fn:analyse-erstellen': (b) => {
      z.ki.push(b)
      if (z.kiFehler) return z.kiFehler
      if (b.aufgabe === 'alle') {
        const offen = [A, B, L].filter((id) => !z.analysen[id] && !(b.ausgenommen ?? []).includes(id))
        const dran = offen.slice(0, paket)
        const erstellt = []
        const fehlgeschlagen = []
        for (const id of dran) {
          if (sammelFehler.includes(id)) {
            fehlgeschlagen.push({ person_id: id, fehler: 'Die KI hat keine verwertbare Antwort geliefert. Bitte später erneut versuchen.' })
          } else {
            z.analysen[id] = neueAnalyse(id, b.monat, TEXT, 'analyse-v1')
            erstellt.push({ person_id: id, versuche: 1, geprueft: true })
          }
        }
        return { ok: true, aufgabe: 'alle', erstellt, fehlgeschlagen, verbleibend: offen.length - dran.length }
      }
      if (b.aufgabe === 'gesamt') {
        if (z.gesamt && !b.neu) return { ok: true, uebersprungen: true, versuche: 0, analyse: z.gesamt }
        z.gesamt = neueAnalyse(null, b.monat, GESAMT_TEXT, 'gesamt-v1')
        return { ok: true, uebersprungen: false, versuche: 1, analyse: z.gesamt }
      }
      const alt = z.analysen[b.person_id]
      if (alt && !b.neu) return { ok: true, uebersprungen: true, versuche: 0, analyse: alt }
      const a = { ...neueAnalyse(b.person_id, b.monat, TEXT, 'analyse-v1'), anbieter: 'claude', modell: 'modell-x' }
      z.analysen[b.person_id] = a
      return { ok: true, uebersprungen: false, versuche: 1, analyse: a }
    },
    analyse_lesen: (b) => z.analysen[b.p_person] ?? null,
    analyse_bearbeiten: (b) => bearbeiten(z.analysen[b.p_person], b),
    analyse_freigeben: (b) => freigeben(z.analysen[b.p_person], b),
    gesamt_lesen: () => z.gesamt,
    gesamt_bearbeiten: (b) => bearbeiten(z.gesamt, b),
    gesamt_freigeben: (b) => freigeben(z.gesamt, b),
    abgabe_status: [], ueberfaellige_abgaben: [], meine_monate: [],
  }
  return { z, antworten }
}

const kennt = (seite) => seite.getByRole('button', { name: 'Verstanden' }).click({ timeout: 1500 }).catch(() => undefined)
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
    const { page, context } = await neueSeite(browser, { rolle: 'admin', antworten: w.antworten })
    await page.goto(BASE + '/app/leitung')
    await kennt(page)
    await page.waitForURL('**/app/leitung/kommentare')
    t.check((await page.locator('.unternav__link').allInnerTexts()).includes('Monatsabschluss'), 'Unter-Navigation zeigt „Monatsabschluss“')
    await page.getByRole('link', { name: 'Monatsabschluss' }).click()
    await page.waitForURL('**/app/leitung/abschluss')
    const hinweis = await page.locator('[data-testid="datenschutz-hinweis"]').innerText()
    t.check(/ohne Namen und ohne Absender/.test(hinweis) && /Kollege A, B/.test(hinweis) && /Mitarbeiter bekommen keine Analysen/.test(hinweis), 'Datenschutz-Hinweis steht auf der Seite')
    t.check(/nur\s+Teamwerte/.test(hinweis), 'Datenschutz-Hinweis nennt die Gesamtauswertung (nur Teamwerte)')
    t.check((await page.getByTestId('ki-nur-admin').count()) === 0, 'Admin: kein Hinweis „nur für Admins“')
    await context.close()
  }

  t.abschnitt('Verantwortliche: KI nur für Admins')
  {
    const w = welt({ ki: false, abschluss: { monat: '2026-09', abgeschlossen_am: '2026-11-05T09:30:00Z', aktualisiert_am: '2026-11-05T09:30:00Z', von: 'Dawid Chef', abgaben: 3, erwartet: 4, unvollstaendig: true } })
    w.z.analysen[A] = { person_id: A, monat: '2026-09', status: 'freigegeben', text: TEXT, geprueft: true, pruef_hinweis: null, bearbeitet: false, prompt_version: 'analyse-v1', anbieter: 'claude', modell: 'm', versuche: 1, erstellt_am: '2026-11-05T09:30:00Z', aktualisiert_am: '2026-11-05T09:30:00Z', bearbeitet_am: null, bearbeitet_von: null, freigegeben_am: '2026-11-05T09:30:00Z', freigegeben_von: 'Admin Test', veraltet: false }
    const { page, context, aufrufe } = await neueSeite(browser, { rolle: 'chef', antworten: w.antworten })
    await page.goto(BASE + '/app/leitung/abschluss')
    await kennt(page)
    await page.getByTestId('ki-nur-admin').waitFor()
    t.check(/zurzeit nur für Admins/.test(await page.getByTestId('ki-nur-admin').innerText()), 'Hinweis: KI-Analysen zurzeit nur für Admins')
    t.check((await page.getByTestId('datenschutz-hinweis').count()) === 0, 'Kein KI-Datenschutz-Hinweis (es geht nichts an die KI)')
    t.check(/Abschluss/.test(await page.locator('main').innerText()) && /3 von 4/.test(await page.locator('main').innerText()), 'Der Monatsabschluss ist sichtbar')
    t.check((await page.getByTestId('analyse-tabelle').count()) === 0 && (await page.getByTestId('gesamt-tabelle').count()) === 0, 'Weder Analysen noch Gesamtauswertung')
    t.check((await page.getByRole('button', { name: /Alle fehlenden erstellen|Erstellen/ }).count()) === 0, 'Keine Knöpfe zum Erstellen')
    t.check(!aufrufe.some((a) => a.rpc.startsWith('fn:')), 'Es wird keine Edge Function gerufen')
    await context.close()
  }

  t.abschnitt('Monat abschließen (unvollständig)')
  const w = welt()
  const { context, page, aufrufe, konsole } = await neueSeite(browser, { rolle: 'admin', antworten: w.antworten })
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
  await zeile(page, 'Anna').getByText('Entwurf', { exact: true }).waitFor()
  t.check(/Entwurf/.test(await zeile(page, 'Anna').innerText()), 'Freigabe zurückgenommen: wieder Entwurf')

  t.abschnitt('Sammellauf: alle fehlenden Analysen in einem Lauf')
  await page.getByRole('button', { name: 'Alle fehlenden erstellen' }).click()
  await page.getByText(/2 Entwürfe erstellt/).waitFor()
  const sammel = aufrufe.filter((a) => a.rpc === 'fn:analyse-erstellen' && a.body.aufgabe === 'alle')
  t.check(sammel.length === 1 && sammel[0].body.monat === '2026-09' && sammel[0].body.ausgenommen.length === 0, 'Ein einziger Aufruf für die zwei Personen ohne Analyse (aufgabe = alle)')
  t.check(!aufrufe.slice(aufrufe.indexOf(sammel[0])).some((a) => a.rpc === 'fn:analyse-erstellen' && a.body.person_id), 'Keine Einzelaufrufe je Person')
  t.check(await page.getByRole('button', { name: 'Alle fehlenden erstellen' }).isDisabled(), 'Knopf ist danach gesperrt (nichts fehlt mehr)')
  t.check(/Bitte jeden Entwurf lesen/.test(await page.locator('main').innerText()), 'Hinweis: jeden Entwurf lesen')
  t.check(/Entwurf/.test(await zeile(page, 'Berta').innerText()) && /Entwurf/.test(await zeile(page, 'Ludwig').innerText()), 'Beide Zeilen zeigen „Entwurf“')
  await context.close()

  t.abschnitt('Sammellauf in Paketen und mit Fehlern')
  {
    const f = welt({ abschluss: { monat: '2026-09', abgeschlossen_am: '2026-11-05T09:30:00Z', aktualisiert_am: '2026-11-05T09:30:00Z', von: 'Dawid Chef', abgaben: 3, erwartet: 4, unvollstaendig: true }, paket: 1, sammelFehler: [B] })
    const { page: p, context: c, aufrufe: a, konsole: k } = await neueSeite(browser, { rolle: 'admin', antworten: f.antworten })
    await p.goto(BASE + '/app/leitung/abschluss')
    await kennt(p)
    await p.getByRole('button', { name: 'Alle fehlenden erstellen' }).click()
    await p.getByText(/2 von 3 erstellt\. Nicht erstellt: Berta Hollmann-Kranz \(Die KI hat keine verwertbare Antwort geliefert/).waitFor()
    const aufr = a.filter((x) => x.rpc === 'fn:analyse-erstellen')
    t.check(aufr.length === 3, 'Bei einem Paket je Aufruf: drei Aufrufe nacheinander')
    t.check(aufr[0].body.ausgenommen.length === 0 && aufr[1].body.ausgenommen.length === 0, 'Die ersten beiden Aufrufe nehmen niemanden aus')
    t.check(aufr[2].body.ausgenommen.join() === B, 'Berta ist gescheitert und wird danach nicht noch einmal versucht (ausgenommen)')
    t.check(/Noch keine Analyse/.test(await zeile(p, 'Berta').innerText()) && /Entwurf/.test(await zeile(p, 'Anna').innerText()) && /Entwurf/.test(await zeile(p, 'Ludwig').innerText()), 'Anna und Ludwig haben einen Entwurf, Berta keine Analyse')
    t.check(await p.getByRole('button', { name: 'Alle fehlenden erstellen' }).isEnabled(), 'Der Knopf bleibt nutzbar (Berta fehlt noch)')
    t.check(k.length === 0, `keine Konsolenfehler ${k.join(' | ')}`)
    await c.close()
  }

  t.abschnitt('Gesamtauswertung des Teams')
  {
    const f = welt({ abschluss: { monat: '2026-09', abgeschlossen_am: '2026-11-05T09:30:00Z', aktualisiert_am: '2026-11-05T09:30:00Z', von: 'Dawid Chef', abgaben: 3, erwartet: 4, unvollstaendig: true } })
    const { page: p, context: c, aufrufe: a, konsole: k } = await neueSeite(browser, { rolle: 'admin', antworten: f.antworten })
    await p.goto(BASE + '/app/leitung/abschluss')
    await kennt(p)
    const zeileGesamt = p.getByTestId('gesamt-zeile')
    await zeileGesamt.waitFor()
    t.check(/Noch keine Auswertung/.test(await zeileGesamt.innerText()) && /nur Teamwerte/.test(await p.locator('main').innerText()), 'Abschnitt „Gesamtauswertung“: noch keine Auswertung, Hinweis auf Teamwerte')
    await zeileGesamt.getByRole('button', { name: 'Erstellen' }).click()
    await p.getByTestId('gesamt-panel').waitFor()
    const ki = a.filter((x) => x.rpc === 'fn:analyse-erstellen')
    t.check(ki.length === 1 && ki[0].body.aufgabe === 'gesamt' && ki[0].body.monat === '2026-09' && ki[0].body.neu === false && !('person_id' in ki[0].body), 'Edge Function mit aufgabe = gesamt, Monat und neu = false, ohne Person')
    t.check(/Entwurf der Gesamtauswertung erstellt/.test(await p.locator('main').innerText()), 'Meldung „Entwurf der Gesamtauswertung erstellt“')
    const panel = p.getByTestId('gesamt-panel')
    t.check(/Gesamtauswertung des Teams/.test(await panel.locator('h3').first().innerText()), 'Panel trägt die Überschrift')
    t.check((await panel.locator('h3.md__titel').allInnerTexts()).join('|') === 'Zusammenfassung|Stärken des Teams|Entwicklungsfelder des Teams', 'Überschriften aus dem Text')
    t.check(/Entwurf/.test(await zeileGesamt.innerText()) && (await p.getByTestId('analyse-panel').count()) === 0, 'Zeile zeigt „Entwurf“; es ist kein Personen-Panel offen')

    // Bearbeiten mit falscher Zahl, korrigieren, freigeben
    await panel.getByRole('button', { name: 'Bearbeiten' }).click()
    await p.locator('#analyse-text').fill(GESAMT_TEXT + '\n\nDas Fremdbild liegt bei 4,71.')
    await panel.getByRole('button', { name: 'Speichern' }).click()
    await p.getByTestId('pruef-hinweis').waitFor()
    t.check(/4,71 steht nicht in den Daten/.test(await p.getByTestId('pruef-hinweis').innerText()), 'Hinweis: 4,71 steht nicht in den Daten')
    t.check(a.some((x) => x.rpc === 'gesamt_bearbeiten' && x.body.p_monat === '2026-09-01'), 'gesamt_bearbeiten für 2026-09-01')
    t.check(/Faktencheck nicht bestanden/.test(await zeileGesamt.innerText()) && /bearbeitet/.test(await zeileGesamt.innerText()), 'Zeile: bearbeitet, Faktencheck nicht bestanden')
    await panel.getByRole('button', { name: 'Bearbeiten' }).click()
    await p.locator('#analyse-text').fill(GESAMT_TEXT)
    await panel.getByRole('button', { name: 'Speichern' }).click()
    await p.getByTestId('pruef-hinweis').waitFor({ state: 'detached' })
    await panel.getByRole('button', { name: 'Freigeben', exact: true }).click()
    await p.getByText('Freigegeben. Die Gesamtauswertung ist als freigegeben markiert.').waitFor()
    t.check(a.some((x) => x.rpc === 'gesamt_freigeben' && x.body.p_freigeben === true) && /Freigegeben/.test(await zeileGesamt.innerText()), 'gesamt_freigeben(true), Zeile zeigt „Freigegeben“')

    // Neu generieren mit Rückfrage; „Daten geändert“
    await panel.getByRole('button', { name: 'Neu generieren' }).click()
    await panel.getByRole('group', { name: 'Neu generieren?' }).waitFor()
    t.check(/ist freigegeben/.test(await panel.innerText()) && ki.length === 1, 'Rückfrage bei freigegebener Auswertung, noch kein neuer KI-Aufruf')
    await panel.getByRole('button', { name: 'Ja, neu generieren' }).click()
    await p.getByText(/Entwurf der Gesamtauswertung erstellt/).waitFor()
    const kiNeu = a.filter((x) => x.rpc === 'fn:analyse-erstellen')
    t.check(kiNeu.length === 2 && kiNeu[1].body.aufgabe === 'gesamt' && kiNeu[1].body.neu === true, 'Zweiter Aufruf mit neu = true')
    f.z.gesamt.veraltet = true
    await p.getByRole('button', { name: 'Schließen' }).click()
    await zeileGesamt.getByRole('button', { name: 'Öffnen' }).waitFor()
    await p.reload()
    await kennt(p)
    await zeileGesamt.waitFor()
    t.check(/Daten geändert/.test(await zeileGesamt.innerText()), '„Daten geändert“ in der Zeile der Gesamtauswertung')
    t.check(k.length === 0, `keine Konsolenfehler ${k.join(' | ')}`)
    await c.close()
  }

  t.abschnitt('KI nicht eingerichtet')
  {
    const f = welt({ abschluss: { monat: '2026-09', abgeschlossen_am: '2026-11-05T09:30:00Z', aktualisiert_am: '2026-11-05T09:30:00Z', von: 'Dawid Chef', abgaben: 3, erwartet: 4, unvollstaendig: true }, kiFehler: { status: 503, body: { ok: false, fehler: 'Die KI ist noch nicht eingerichtet.' } } })
    const { page: p, context: c } = await neueSeite(browser, { rolle: 'admin', antworten: f.antworten })
    await p.goto(BASE + '/app/leitung/abschluss')
    await kennt(p)
    await zeile(p, 'Anna').getByRole('button', { name: 'Erstellen' }).click()
    await p.getByRole('alert').filter({ hasText: 'Die KI ist noch nicht eingerichtet.' }).waitFor()
    t.check(true, 'Einzelanalyse: verständliche Meldung')
    t.check(await zeile(p, 'Anna').getByRole('button', { name: 'Erstellen' }).isEnabled(), 'Danach lässt sich erneut versuchen')
    await p.getByRole('button', { name: 'Alle fehlenden erstellen' }).click()
    await p.getByRole('alert').filter({ hasText: '0 von 3 erstellt. Die KI ist noch nicht eingerichtet.' }).waitFor()
    t.check(true, 'Sammellauf: „0 von 3 erstellt“ und die Meldung der KI')
    await p.getByTestId('gesamt-zeile').getByRole('button', { name: 'Erstellen' }).click()
    await p.getByRole('alert').filter({ hasText: /^Die KI ist noch nicht eingerichtet\.$/ }).waitFor()
    t.check(await p.getByTestId('gesamt-zeile').getByRole('button', { name: 'Erstellen' }).isEnabled(), 'Gesamtauswertung: Meldung, danach erneut versuchbar')
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
    await p.getByTestId('abschluss-veraltet').waitFor({ state: 'detached' })
    t.check((await p.getByTestId('abschluss-veraltet').count()) === 0 && /vollständig/.test(await p.locator('main').innerText()), 'Danach vollständig, kein Hinweis mehr')
    await c.close()
  }
  {
    const f = welt({ aktuell: { abgaben: 4, erwartet: 4 }, ki: false })
    const { page: p, context: c } = await neueSeite(browser, { rolle: 'chef', antworten: f.antworten })
    await p.goto(BASE + '/app/leitung/abschluss')
    await kennt(p)
    await p.getByRole('button', { name: 'Monat abschließen' }).click()
    await p.getByText('ist abgeschlossen: 4 von 4 Abgaben').waitFor()
    t.check(true, 'Vollständiger Monat: Abschluss ohne Rückfrage (auch als Verantwortlicher)')
    await c.close()
  }

  t.abschnitt('Handy-Breite, Nachtmodus')
  {
    const f = welt({ abschluss: { monat: '2026-09', abgeschlossen_am: '2026-11-05T09:30:00Z', aktualisiert_am: '2026-11-05T09:30:00Z', von: 'Dawid Chef', abgaben: 3, erwartet: 4, unvollstaendig: true } })
    f.z.analysen[A] = { person_id: A, monat: '2026-09', status: 'freigegeben', text: TEXT, geprueft: false, pruef_hinweis: 'Faktencheck nicht bestanden: 4,71 steht nicht in den Daten', bearbeitet: true, prompt_version: 'analyse-v1', anbieter: 'claude', modell: 'm', versuche: 3, erstellt_am: '2026-11-05T09:30:00Z', aktualisiert_am: '2026-11-05T09:30:00Z', bearbeitet_am: '2026-11-05T09:30:00Z', bearbeitet_von: 'Dawid Chef', freigegeben_am: '2026-11-05T09:30:00Z', freigegeben_von: 'Dawid Chef', veraltet: true }
    for (const [name, viewport, colorScheme] of [['handy', { width: 375, height: 800 }, 'light'], ['nacht', { width: 1280, height: 900 }, 'dark']]) {
      const { page: p, context: c, konsole: k } = await neueSeite(browser, { rolle: 'admin', antworten: f.antworten, viewport, colorScheme })
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
