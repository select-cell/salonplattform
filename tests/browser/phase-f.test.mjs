// Phase F: Fokus, Agenda, Termine (Rechte, Bedienung, Eingabeprüfung) und die Agenda im Monatsbericht (PDF)
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { BASE, neueSeite, pruefer } from './helfer.mjs'

const ZIEL = 'out/pdf-test'
mkdirSync(ZIEL, { recursive: true })

const SCHWELLEN = { ausgewogen: 0.3, niedrig: 2.5, hoch: 3.5 }
const V = (n) => `aaaaaaaa-0000-0000-0000-00000000000${n}`
const kennt = (seite) => seite.getByRole('button', { name: 'Verstanden' }).click({ timeout: 1500 }).catch(() => undefined)

const bloecke = () => [
  { id: 'einstieg', titel: 'Einstieg und Beteiligung', minuten: 2, punkte: [{ text: 'Danke an alle, die abgegeben haben.' }, { text: '3 von 4 Personen haben abgegeben.' }] },
  { id: 'kennzahlen', titel: 'Team-Kennzahlen des Monats', minuten: 3, punkte: [{ text: 'Selbstbild 3,1, Fremdbild 2,9.' }, { text: 'Differenz +0,2: ausgewogen.' }] },
  { id: 'fokus', titel: 'Fokus-Verhalten', minuten: 7, punkte: [
    { grund: 'fokus', nr: 2, text: 'Fokus: Verhalten 2 „Titel 2“. Fremdbild 3,2, Selbstbild 3,3. Warum im Fokus: Gäste begrüßen' },
    { beispiel: true, nr: 2, text: 'Beispiel aus den Kommentaren: „Kollege A hilft immer“' },
    { beispiel: true, nr: 2, text: 'Beispiel aus den Kommentaren: „Kollege B erklärt gut“' },
    { grund: 'differenz', nr: 3, text: 'Große Differenz: Verhalten 3 „Titel 3“. Selbstbild 3,0, Fremdbild 2,3 (Differenz +0,7).' },
  ] },
  { id: 'entwicklung', titel: 'Entwicklungsfelder und Differenzen', minuten: 4, punkte: [{ text: 'Verhalten 4 „Titel 4“. Fremdbild 2,2, Selbstbild 2,7.' }] },
  { id: 'vereinbarungen', titel: 'Vereinbarungen', minuten: 2, punkte: [{ text: 'Wer übernimmt welchen Schritt?' }] },
]

function agendaZeile(status = 'entwurf', extra = {}) {
  return {
    monat: '2026-09', status, text: '', bearbeitet: false, erstellt_am: '2026-11-05T09:30:00Z', aktualisiert_am: '2026-11-05T09:30:00Z',
    bearbeitet_am: null, bearbeitet_von: null, freigegeben_am: null, freigegeben_von: null,
    agenda: { vorlage: 'agenda-vorlage-v1', monat: '2026-09', minuten_gesamt: 18, unvollstaendig: true, hinweise: ['Der Monat ist noch nicht abgeschlossen.', 'Es haben erst 3 von 4 Personen abgegeben.'], bloecke: bloecke() },
    ...extra,
  }
}

const UEBERSICHT = {
  monat: '2026-09', monate: ['2026-09', '2026-08'], eigene_analyse_nur_admin: false, ki: false, abschluss: null,
  aktuell: { abgaben: 3, erwartet: 4 }, nicht_abgegeben: [], personen: [],
}

function fokusWelt() {
  const z = { verhalten: [1, 2, 3].map((n) => ({ id: V(n), nr: n, titel: `Titel ${n}`, grundpfeiler: null, saeule: `Säule ${n}`, fokus: null })), verlauf: [] }
  const liste = () => ({ heute: '2026-11-05', verhalten: z.verhalten, verlauf: z.verlauf })
  return {
    z,
    antworten: {
      fokus_liste: liste,
      fokus_umschalten: (b) => {
        if (b.p_verhalten === 'fremd') return { status: 403, body: { code: '42501', message: 'Verhalten nicht gefunden.' } }
        const v = z.verhalten.find((x) => x.id === b.p_verhalten)
        v.fokus = b.p_an ? { begruendung: b.p_begruendung, gueltig_ab: '2026-11-05', gueltig_bis: b.p_bis, geplant: false } : null
        return liste()
      },
    },
  }
}

/** ki: darf die aufrufende Person die KI nutzen (Standard seit Version 1.3: nur der Admin) */
function agendaWelt(start = null, { ki = false, kiFehler = null } = {}) {
  const z = { agenda: start, ki: [], kiGeprueft: true, kiFehler }
  return {
    z,
    antworten: {
      'fn:analyse-erstellen': (b) => {
        z.ki.push(b)
        if (z.kiFehler) return z.kiFehler
        const vorhanden = z.agenda && z.agenda.anbieter && z.agenda.anbieter !== 'vorlage'
        if (vorhanden && !b.neu) return { ok: true, uebersprungen: true, versuche: 0, analyse: z.agenda }
        z.agenda = agendaZeile('entwurf', {
          monat: b.monat, anbieter: 'webhook', modell: null, prompt_version: 'agenda-ki-v1', versuche: 2, geprueft: z.kiGeprueft,
          pruef_hinweis: z.kiGeprueft ? null : 'Faktencheck nicht bestanden: 4,71 steht nicht in den Daten',
          agenda: { vorlage: 'agenda-ki-v1', monat: b.monat, minuten_gesamt: 18, unvollstaendig: false, hinweise: [], bloecke: bloecke().map((x) => ({ ...x, punkte: x.punkte.filter((p) => !p.beispiel) })) },
        })
        return { ok: true, uebersprungen: false, versuche: 2, analyse: z.agenda }
      },
      abschluss_uebersicht: (b) => ({ ...UEBERSICHT, ki, monat: b.p_monat ? b.p_monat.slice(0, 7) : UEBERSICHT.monat }),
      agenda_lesen: (b) => (z.agenda && b.p_monat.startsWith(z.agenda.monat) ? z.agenda : null),
      agenda_erzeugen: (b) => { z.agenda = agendaZeile('entwurf', { monat: b.p_monat.slice(0, 7) }); return z.agenda },
      agenda_bearbeiten: (b) => {
        z.agenda = { ...z.agenda, status: 'entwurf', bearbeitet: true, bearbeitet_von: 'Dawid Chef', bearbeitet_am: '2026-11-05T10:00:00Z', freigegeben_am: null, freigegeben_von: null, aktualisiert_am: '2026-11-05T10:00:00Z', agenda: b.p_agenda }
        return z.agenda
      },
      agenda_freigeben: (b) => {
        z.agenda = b.p_freigeben
          ? { ...z.agenda, status: 'freigegeben', freigegeben_am: '2026-11-05T11:00:00Z', freigegeben_von: 'Dawid Chef', aktualisiert_am: '2026-11-05T11:00:00Z' }
          : { ...z.agenda, status: 'entwurf', freigegeben_am: null, freigegeben_von: null, aktualisiert_am: '2026-11-05T11:05:00Z' }
        return z.agenda
      },
    },
  }
}

const mail = (art, status, versuche = 0, fehler = null) => ({ art, status, versuche, fehler, faellig_ab: '2026-10-24T08:00:00+00:00', gesendet_am: null })
const termin = (id, lokal, extra = {}) => ({
  id, startet_am: '2026-12-14T09:00:00+00:00', startet_lokal: lokal, titel: 'Teammeeting', bezugsmonat_fest: null, bezugsmonat: '2026-11',
  vorlauf_tage: [2], erinnerung_stunden: [1], admin_in_kopie: false, mails_pausiert: false, entfernt: false, serie_id: null,
  mails: [mail('vorab', 'geplant'), mail('erinnerung', 'geplant')], ...extra,
})

function terminWelt(termine, fehlgeschlagen = 0) {
  const z = { termine }
  return {
    z,
    antworten: {
      termine_liste: () => ({ jetzt: '2026-11-05T09:00:00+00:00', termine: z.termine, fehlgeschlagen }),
      termin_speichern: (b) => {
        if (b.p_id) z.termine = z.termine.map((t) => (t.id === b.p_id ? { ...t, startet_lokal: b.p_startet_lokal, titel: b.p_titel, mails_pausiert: b.p_mails_pausiert, admin_in_kopie: b.p_admin_in_kopie, vorlauf_tage: b.p_vorlauf_tage, erinnerung_stunden: b.p_erinnerung_stunden } : t))
        else z.termine = [...z.termine, termin(`neu-${z.termine.length}`, b.p_startet_lokal, { titel: b.p_titel, vorlauf_tage: b.p_vorlauf_tage, erinnerung_stunden: b.p_erinnerung_stunden })]
        return {}
      },
      termine_serie: (b) => {
        z.termine = [...z.termine, ...Array.from({ length: b.p_anzahl }, (_, i) => termin(`serie-${i}`, `2027-01-${String(11 + i * 7).padStart(2, '0')}T10:00`, { titel: b.p_titel, serie_id: 's1' }))]
        return {}
      },
      termin_entfernen: (b) => { z.termine = z.termine.map((t) => (t.id === b.p_id ? { ...t, entfernt: true } : t)); return {} },
    },
  }
}

export default async function (browser) {
  const t = pruefer('Phase F: Fokus, Agenda, Termine')

  t.abschnitt('Zugriff und Navigation')
  {
    const w = agendaWelt()
    for (const pfad of ['fokus', 'agenda', 'termine']) {
      const { page, context } = await neueSeite(browser, { rolle: 'ma', antworten: { ...w.antworten, meine_monate: [] } })
      await page.goto(`${BASE}/app/leitung/${pfad}`)
      await page.waitForURL('**/app')
      t.check(true, `Mitarbeiter: /app/leitung/${pfad} leitet auf /app um`)
      await context.close()
    }
  }
  {
    const w = terminWelt([])
    const { page, context } = await neueSeite(browser, { rolle: 'chef', antworten: { ...w.antworten, ...fokusWelt().antworten, ...agendaWelt().antworten } })
    await page.goto(BASE + '/app/leitung/fokus')
    await kennt(page)
    await page.waitForSelector('[data-testid="fokus-liste"]')
    const nav = await page.locator('.unternav__link').allInnerTexts()
    t.check(nav.join('|') === 'Kommentare|Monatsabschluss|Fokus|Agenda', `Verantwortlicher: Unter-Navigation ohne „Termine“ (${nav.join('|')})`)
    await page.goto(BASE + '/app/leitung/termine')
    await page.waitForURL('**/app')
    t.check(true, 'Verantwortlicher: /app/leitung/termine leitet auf /app um')
    await context.close()
  }
  {
    const w = terminWelt([])
    const { page, context } = await neueSeite(browser, { rolle: 'admin', antworten: { ...w.antworten, ...fokusWelt().antworten, ...agendaWelt().antworten } })
    await page.goto(BASE + '/app/leitung/fokus')
    await kennt(page)
    await page.waitForSelector('[data-testid="fokus-liste"]')
    const nav = await page.locator('.unternav__link').allInnerTexts()
    t.check(nav.join('|') === 'Kommentare|Monatsabschluss|Fokus|Agenda|Termine', `Admin: Unter-Navigation mit „Termine“ (${nav.join('|')})`)
    await context.close()
  }

  t.abschnitt('Fokus')
  {
    const f = fokusWelt()
    const { page, context, aufrufe, konsole } = await neueSeite(browser, { rolle: 'chef', antworten: f.antworten })
    await page.goto(BASE + '/app/leitung/fokus')
    await kennt(page)
    await page.waitForSelector('[data-testid="fokus-liste"]')
    t.check((await page.locator('[data-testid="fokus-liste"] > li').count()) === 3, 'Drei Verhalten in der Liste')
    t.check(/0 Verhalten im Fokus|0 Verhalten/.test(await page.locator('main').innerText()), 'Zeigt „0 Verhalten“ im Fokus')
    const z2 = page.locator('[data-nr="2"]')
    await z2.getByRole('button', { name: 'In den Fokus' }).click()
    await page.getByLabel('Warum ist das Verhalten im Fokus? (optional)').fill('Gäste herzlich begrüßen')
    await page.getByLabel('Befristet bis (optional)').fill('2026-12-31')
    await page.getByRole('button', { name: 'Speichern' }).click()
    await page.getByText('Verhalten 2 ist im Fokus.').waitFor()
    await z2.getByText(/im Fokus, bis 31\.12\.2026/).waitFor()
    const a = aufrufe.find((x) => x.rpc === 'fokus_umschalten')
    t.check(a.body.p_verhalten === V(2) && a.body.p_an === true && a.body.p_begruendung === 'Gäste herzlich begrüßen' && a.body.p_bis === '2026-12-31', 'fokus_umschalten mit Verhalten, Begründung und Ende')
    t.check(/im Fokus, bis 31\.12\.2026/.test(await z2.innerText()) && /Warum: Gäste herzlich begrüßen/.test(await z2.innerText()), 'Zeile zeigt „im Fokus, bis 31.12.2026“ und die Begründung')
    t.check(/1 Verhalten im Fokus|1 Verhalten/.test(await page.locator('main').innerText()), 'Zeigt „1 Verhalten“ im Fokus')
    await z2.getByRole('button', { name: 'Aus dem Fokus nehmen' }).click()
    await page.getByText('Verhalten 2 ist nicht mehr im Fokus.').waitFor()
    await z2.getByRole('button', { name: 'In den Fokus' }).waitFor()
    t.check(aufrufe.filter((x) => x.rpc === 'fokus_umschalten').pop().body.p_an === false, 'fokus_umschalten(an = false)')
    t.check((await z2.getByRole('button', { name: 'In den Fokus' }).count()) === 1, 'Danach wieder „In den Fokus“')
    t.check(konsole.length === 0, `keine Konsolenfehler ${konsole.join(' | ')}`)
    await context.close()
  }
  {
    const f = fokusWelt()
    f.z.verhalten[0].fokus = { begruendung: null, gueltig_ab: '2026-11-05', gueltig_bis: null, geplant: false }
    f.z.verlauf = [{ nr: 3, titel: 'Titel 3', begruendung: 'Früher wichtig', gueltig_ab: '2026-10-01', gueltig_bis: '2026-10-31' }]
    const { page, context } = await neueSeite(browser, { rolle: 'chef', antworten: { ...f.antworten, fokus_umschalten: { status: 403, body: { code: '42501', message: 'Verhalten nicht gefunden.' } } } })
    await page.goto(BASE + '/app/leitung/fokus')
    await kennt(page)
    await page.waitForSelector('[data-testid="fokus-verlauf"]')
    t.check(/Titel 3/.test(await page.getByTestId('fokus-verlauf').innerText()) && /01\.10\.2026 bis 31\.10\.2026/.test(await page.getByTestId('fokus-verlauf').innerText()), 'Verlauf zeigt beendete Einträge')
    await page.locator('[data-nr="1"]').getByRole('button', { name: 'Aus dem Fokus nehmen' }).click()
    await page.getByRole('alert').filter({ hasText: 'Verhalten nicht gefunden.' }).waitFor()
    t.check(true, 'Fehler der Datenbank erscheint auf Deutsch')
    await context.close()
  }

  t.abschnitt('Agenda')
  const w = agendaWelt()
  const { context, page, aufrufe, konsole } = await neueSeite(browser, { rolle: 'chef', antworten: w.antworten })
  await page.goto(BASE + '/app/leitung/agenda')
  await kennt(page)
  await page.getByRole('button', { name: 'Agenda erzeugen' }).waitFor()
  t.check(/Noch keine Agenda/.test(await page.locator('main').innerText()), 'Ohne Agenda: „Noch keine Agenda“')
  await page.getByRole('button', { name: 'Agenda erzeugen' }).click()
  await page.getByText(/Agenda erzeugt\. Bitte lesen/).waitFor()
  const erzeugen = aufrufe.filter((x) => x.rpc === 'agenda_erzeugen')
  t.check(erzeugen.length === 1 && erzeugen[0].body.p_monat === '2026-09-01' && erzeugen[0].body.p_neu === false, 'agenda_erzeugen für 2026-09-01, nicht neu')
  const titel = await page.locator('main section h2.ausw-titel').allInnerTexts()
  t.check(titel.join('|') === 'Einstieg und Beteiligung (2 Min.)|Team-Kennzahlen des Monats (3 Min.)|Fokus-Verhalten (7 Min.)|Entwicklungsfelder und Differenzen (4 Min.)|Vereinbarungen (2 Min.)', 'Fünf Blöcke in fester Reihenfolge mit Minuten')
  let text = await page.locator('main').innerText()
  t.check(/Dauer\s+18 Min\./i.test(text.replace(/\s+/g, ' ')) || /18 Min\./.test(text), 'Dauer 18 Min.')
  t.check(/Entwurf/.test(text), 'Stand: Entwurf')
  t.check(/Stand unvollständig/.test(await page.getByTestId('stand-unvollstaendig').innerText()) && /Es haben erst 3 von 4 Personen abgegeben\./.test(await page.getByTestId('stand-unvollstaendig').innerText()), 'Hinweis „Stand unvollständig“ mit Gründen')
  t.check((await page.locator('.agenda-beispiel').count()) === 2 && (await page.locator('.agenda-beispiel__hinweis').first().innerText()) === 'nur auf der Plattform', 'Zwei Kommentar-Beispiele, als „nur auf der Plattform“ gekennzeichnet')
  t.check(/nie in der Mail und nie im PDF/.test(text), 'Hinweis: nie in Mail und PDF')

  // Bearbeiten: Zeitbudget prüft vor dem Speichern
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await page.getByTestId('agenda-editor').waitFor()
  t.check(/Summe:\s*18 Minuten/.test((await page.getByTestId('summe').innerText()).replace(/\s+/g, ' ')), 'Editor zeigt die Summe 18 Minuten')
  t.check(await page.locator('#punkte-fokus').inputValue() === ['Fokus: Verhalten 2 „Titel 2“. Fremdbild 3,2, Selbstbild 3,3. Warum im Fokus: Gäste begrüßen', 'Große Differenz: Verhalten 3 „Titel 3“. Selbstbild 3,0, Fremdbild 2,3 (Differenz +0,7).'].join('\n'), 'Editor: Punkte ohne die Kommentar-Beispiele')
  await page.locator('#min-fokus').fill('9')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await page.getByRole('alert').filter({ hasText: 'Der Block „Fokus-Verhalten“ darf 6 bis 8 Minuten dauern.' }).waitFor()
  t.check(!aufrufe.some((x) => x.rpc === 'agenda_bearbeiten'), 'Zu viele Minuten: nichts wird gesendet')
  await page.locator('#min-einstieg').fill('3')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await page.getByRole('alert').filter({ hasText: 'Der Block „Einstieg und Beteiligung“ dauert genau 2 Minuten.' }).waitFor()
  t.check(!aufrufe.some((x) => x.rpc === 'agenda_bearbeiten'), 'Falscher Einstieg: nichts wird gesendet')
  await page.locator('#min-einstieg').fill('2')
  await page.locator('#min-fokus').fill('8')
  await page.locator('#punkte-vereinbarungen').fill('Wir einigen uns auf einen Schritt.\nWer kümmert sich?')
  t.check(/Summe:\s*19 Minuten/.test((await page.getByTestId('summe').innerText()).replace(/\s+/g, ' ')), 'Summe aktualisiert sich (19 Minuten)')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await page.getByText(/Gespeichert\. Die Agenda ist wieder ein Entwurf/).waitFor()
  const bearb = aufrufe.filter((x) => x.rpc === 'agenda_bearbeiten')
  t.check(bearb.length === 1 && bearb[0].body.p_monat === '2026-09-01', 'agenda_bearbeiten für 2026-09-01')
  const gesendet = bearb[0].body.p_agenda
  t.check(gesendet.bloecke.map((b) => b.id).join() === 'einstieg,kennzahlen,fokus,entwicklung,vereinbarungen', 'Gesendet: fünf Blöcke in fester Reihenfolge')
  t.check(gesendet.bloecke.map((b) => b.minuten).join() === '2,3,8,4,2' && gesendet.bloecke.every((b) => typeof b.minuten === 'number'), 'Gesendet: Minuten als Zahlen (2, 3, 8, 4, 2)')
  t.check(gesendet.bloecke[4].punkte.map((p) => p.text).join('|') === 'Wir einigen uns auf einen Schritt.|Wer kümmert sich?', 'Gesendet: geänderte Punkte')
  t.check(gesendet.bloecke[2].punkte.filter((p) => p.beispiel).length === 2, 'Gesendet: die zwei Kommentar-Beispiele bleiben erhalten')
  await page.getByText(/Bearbeitet von Dawid Chef/).waitFor()
  t.check(/Bearbeitet von Dawid Chef/.test(await page.locator('main').innerText()), 'Zeigt, wer bearbeitet hat')

  // Freigeben, Neu erzeugen mit Rückfrage, Freigabe zurücknehmen
  await page.getByRole('button', { name: 'Freigeben', exact: true }).click()
  await page.getByText(/Freigegeben\. Die Agenda steht jetzt am Ende des Monatsberichts/).waitFor()
  await page.locator('.kennzahl').first().getByText('Freigegeben', { exact: true }).waitFor()
  t.check(/Freigegeben/.test(await page.locator('.kennzahl').first().innerText()) && /von Dawid Chef/.test(await page.locator('.kennzahl').first().innerText()), 'Stand: Freigegeben von Dawid Chef')
  await page.getByRole('button', { name: 'Neu erzeugen' }).click()
  await page.getByRole('group', { name: 'Neu erzeugen?' }).waitFor()
  t.check(/ist freigegeben/.test(await page.locator('main').innerText()) && aufrufe.filter((x) => x.rpc === 'agenda_erzeugen').length === 1, 'Rückfrage bei freigegebener Agenda, noch kein neuer Aufruf')
  await page.getByRole('button', { name: 'Abbrechen' }).click()
  await page.getByRole('button', { name: 'Freigabe zurücknehmen' }).click()
  await page.getByText(/Freigabe zurückgenommen/).waitFor()
  t.check(aufrufe.filter((x) => x.rpc === 'agenda_freigeben').pop().body.p_freigeben === false, 'agenda_freigeben(false)')
  await page.getByRole('button', { name: 'Neu erzeugen' }).click()
  await page.getByRole('group', { name: 'Neu erzeugen?' }).waitFor()
  await page.getByRole('button', { name: 'Ja, neu erzeugen' }).click()
  await page.getByText('Agenda neu erzeugt (Entwurf).').waitFor()
  const erzeugen2 = aufrufe.filter((x) => x.rpc === 'agenda_erzeugen')
  t.check(erzeugen2.length === 2 && erzeugen2[1].body.p_neu === true, 'Zweiter Aufruf mit neu = true')
  t.check(konsole.length === 0, `keine Konsolenfehler ${konsole.join(' | ')}`)
  await context.close()

  t.abschnitt('Agenda mit KI')
  {
    // Verantwortliche ohne KI-Recht sehen keinen KI-Knopf, auch nicht bei einer vorhandenen Agenda
    const v = agendaWelt(null, { ki: false })
    const { page: p, context: c, aufrufe: a } = await neueSeite(browser, { rolle: 'chef', antworten: v.antworten })
    await p.goto(BASE + '/app/leitung/agenda')
    await kennt(p)
    await p.getByRole('button', { name: 'Agenda erzeugen' }).waitFor()
    t.check((await p.getByRole('button', { name: /KI/ }).count()) === 0, 'Verantwortlicher ohne KI-Recht: kein Knopf „Mit KI formulieren“')
    await p.getByRole('button', { name: 'Agenda erzeugen' }).click()
    await p.getByText(/Agenda erzeugt\. Bitte lesen/).waitFor()
    t.check((await p.getByRole('button', { name: /KI/ }).count()) === 0 && (await p.getByTestId('agenda-ki').count()) === 0, 'Auch mit Agenda: kein KI-Knopf, keine KI-Hinweise')
    t.check(!a.some((x) => x.rpc.startsWith('fn:')), 'Es wird keine Edge Function gerufen')
    await c.close()
  }
  {
    const k = agendaWelt(null, { ki: true })
    const { page: p, context: c, aufrufe: a, konsole: kk } = await neueSeite(browser, { rolle: 'admin', antworten: k.antworten })
    await p.goto(BASE + '/app/leitung/agenda')
    await kennt(p)
    await p.getByRole('button', { name: 'Mit KI formulieren' }).waitFor()
    t.check(await p.getByRole('button', { name: 'Agenda erzeugen' }).isVisible(), 'Admin: die Vorlage („Agenda erzeugen“) bleibt daneben bestehen')
    await p.getByRole('button', { name: 'Mit KI formulieren' }).click()
    await p.getByTestId('agenda-ki').waitFor()
    const ki = a.filter((x) => x.rpc === 'fn:analyse-erstellen')
    t.check(ki.length === 1 && ki[0].body.aufgabe === 'agenda' && ki[0].body.monat === '2026-09' && ki[0].body.neu === false && !('person_id' in ki[0].body), 'Edge Function mit aufgabe = agenda, Monat und neu = false')
    t.check(!a.some((x) => x.rpc === 'agenda_erzeugen'), 'Die Vorlage wird dabei nicht erzeugt')
    t.check(/Agenda von der KI formuliert\. Bitte lesen/.test(await p.locator('main').innerText()), 'Meldung „Agenda von der KI formuliert“')
    const abz = await p.getByTestId('agenda-ki').innerText()
    t.check(/Von der KI formuliert/.test(abz) && /Faktencheck bestanden/.test(abz), 'Abzeichen: von der KI formuliert, Faktencheck bestanden')
    t.check(/Formuliert von der KI \(webhook\), 2 Versuche/.test(await p.locator('main').innerText()), 'Hinweis auf Anbieter und Versuche')
    t.check((await p.locator('main section h2.ausw-titel').allInnerTexts()).length === 5, 'Fünf Blöcke wie bei der Vorlage')
    t.check((await p.getByTestId('stand-unvollstaendig').count()) === 0, 'Ohne Lücken in den Daten kein Hinweis „Stand unvollständig“')

    // Neu mit KI formulieren: unbearbeitet ohne Rückfrage, nach dem Bearbeiten mit Rückfrage
    await p.getByRole('button', { name: 'Neu mit KI formulieren' }).click()
    await p.getByText(/Agenda von der KI formuliert\./).waitFor()
    t.check(a.filter((x) => x.rpc === 'fn:analyse-erstellen').length === 2 && a.filter((x) => x.rpc === 'fn:analyse-erstellen')[1].body.neu === true, 'Neu formulieren: zweiter Aufruf mit neu = true, ohne Rückfrage (nichts bearbeitet)')
    await p.getByRole('button', { name: 'Bearbeiten' }).click()
    await p.locator('#punkte-vereinbarungen').fill('Wir einigen uns auf einen Schritt.')
    await p.getByRole('button', { name: 'Speichern' }).click()
    await p.getByText(/Gespeichert\. Die Agenda ist wieder ein Entwurf/).waitFor()
    await p.getByRole('button', { name: 'Neu mit KI formulieren' }).click()
    await p.getByRole('group', { name: 'Neu formulieren?' }).waitFor()
    t.check(/wurde bearbeitet/.test(await p.locator('main').innerText()) && /die KI die Agenda neu schreiben/.test(await p.locator('main').innerText()) && a.filter((x) => x.rpc === 'fn:analyse-erstellen').length === 2, 'Rückfrage nach dem Bearbeiten, noch kein neuer KI-Aufruf')
    await p.getByRole('button', { name: 'Abbrechen' }).click()
    await p.getByRole('button', { name: 'Neu mit KI formulieren' }).click()
    await p.getByRole('button', { name: 'Ja, neu formulieren' }).click()
    await p.getByText(/Agenda von der KI formuliert\./).waitFor()
    t.check(a.filter((x) => x.rpc === 'fn:analyse-erstellen').length === 3, 'Nach der Bestätigung: dritter Aufruf')

    // Die Vorlage ersetzt die KI-Agenda
    k.z.agenda = { ...k.z.agenda, anbieter: 'vorlage' }
    await p.reload()
    await kennt(p)
    await p.getByRole('button', { name: 'Neu erzeugen' }).waitFor()
    t.check((await p.getByTestId('agenda-ki').count()) === 0, 'Eine Agenda aus der Vorlage trägt keine KI-Abzeichen')
    t.check(kk.length === 0, `keine Konsolenfehler ${kk.join(' | ')}`)
    await c.close()
  }
  {
    // Faktencheck nicht bestanden: deutlicher Hinweis, Freigabe bleibt möglich
    const k = agendaWelt(null, { ki: true })
    k.z.kiGeprueft = false
    const { page: p, context: c } = await neueSeite(browser, { rolle: 'admin', antworten: k.antworten })
    await p.goto(BASE + '/app/leitung/agenda')
    await kennt(p)
    await p.getByRole('button', { name: 'Mit KI formulieren' }).click()
    await p.getByTestId('pruef-hinweis').waitFor()
    t.check(/der Faktencheck ist nicht bestanden/.test(await p.locator('main').innerText()), 'Meldung nennt den nicht bestandenen Faktencheck')
    t.check(/4,71 steht nicht in den Daten/.test(await p.getByTestId('pruef-hinweis').innerText()) && /Faktencheck nicht bestanden/.test(await p.getByTestId('agenda-ki').innerText()), 'Abzeichen und Hinweis zeigen die Abweichung')
    t.check(await p.getByRole('button', { name: 'Freigeben', exact: true }).isEnabled(), 'Freigabe bleibt möglich (die Leitung entscheidet)')
    await c.close()
  }
  {
    // KI nicht eingerichtet
    const k = agendaWelt(null, { ki: true, kiFehler: { status: 503, body: { ok: false, fehler: 'Die KI ist noch nicht eingerichtet.' } } })
    const { page: p, context: c } = await neueSeite(browser, { rolle: 'admin', antworten: k.antworten })
    await p.goto(BASE + '/app/leitung/agenda')
    await kennt(p)
    await p.getByRole('button', { name: 'Mit KI formulieren' }).click()
    await p.getByRole('alert').filter({ hasText: 'Die KI ist noch nicht eingerichtet.' }).waitFor()
    t.check(await p.getByRole('button', { name: 'Mit KI formulieren' }).isEnabled() && await p.getByRole('button', { name: 'Agenda erzeugen' }).isEnabled(), 'Danach lässt sich erneut versuchen oder die Vorlage nehmen')
    await c.close()
  }

  // Link aus der Mail wählt den Monat
  {
    const ww = agendaWelt(agendaZeile('freigegeben', { monat: '2026-08', freigegeben_von: 'Dawid Chef', freigegeben_am: '2026-09-01T10:00:00Z' }))
    const { page: p, context: c, aufrufe: a } = await neueSeite(browser, { rolle: 'chef', antworten: ww.antworten })
    await p.goto(BASE + '/app/leitung/agenda?monat=2026-08')
    await kennt(p)
    await p.locator('h2.ausw-titel', { hasText: 'Fokus-Verhalten' }).waitFor()
    t.check(a.some((x) => x.rpc === 'agenda_lesen' && x.body.p_monat === '2026-08-01'), 'Link mit ?monat=2026-08 liest die Agenda für August')
    t.check((await p.locator('#monatswahl').inputValue()) === '2026-08', 'Die Monatswahl steht auf August')
    await p.goto(BASE + '/app/leitung/agenda/2026-08')
    await p.locator('h2.ausw-titel', { hasText: 'Fokus-Verhalten' }).waitFor()
    t.check((await p.locator('#monatswahl').inputValue()) === '2026-08', 'Auch /agenda/2026-08 wählt den Monat')
    await c.close()
  }

  t.abschnitt('Termine (Admin)')
  {
    const tw = terminWelt([
      termin('t1', '2026-12-14T10:00', { mails: [mail('vorab', 'gesendet', 1), mail('erinnerung', 'geplant')] }),
      termin('t2', '2026-11-30T10:00', { mails: [mail('vorab', 'fehler', 2, 'Resend 500'), mail('erinnerung', 'fehlgeschlagen', 3, 'Resend 403: Domain nicht bestätigt')] }),
      termin('t3', '2026-12-21T10:00', { mails_pausiert: true, admin_in_kopie: true, mails: [mail('vorab', 'pausiert'), mail('erinnerung', 'pausiert')] }),
      termin('t4', '2026-10-05T10:00', { entfernt: true, mails: [mail('vorab', 'entfernt'), mail('erinnerung', 'entfernt')] }),
    ], 1)
    const { page: p, context: c, aufrufe: a, konsole: k } = await neueSeite(browser, { rolle: 'admin', antworten: tw.antworten })
    await p.goto(BASE + '/app/leitung/termine')
    await kennt(p)
    await p.getByTestId('termin-liste').waitFor()
    t.check((await p.locator('[data-testid="termin-liste"] > li').count()) === 3, 'Entfernte Termine sind zunächst ausgeblendet (3 von 4)')
    t.check(/Mo\., 14\.12\.2026, 10:00 Uhr/.test(await p.locator('[data-termin="t1"]').innerText()), 'Ortszeit mit Wochentag: Mo., 14.12.2026, 10:00 Uhr')
    t.check(/Agenda für November 2026/.test(await p.locator('[data-termin="t1"]').innerText()), 'Bezugsmonat sichtbar')
    t.check(/Agenda-Mail: gesendet/.test(await p.locator('[data-termin="t1"] [data-mail="vorab"]').innerText()), 'Zustand „gesendet“')
    t.check(/Erinnerung: geplant \(ab /.test(await p.locator('[data-termin="t1"] [data-mail="erinnerung"]').innerText()), 'Zustand „geplant (ab …)“')
    t.check(/Fehler, Versuch 2 von 3/.test(await p.locator('[data-termin="t2"] [data-mail="vorab"]').innerText()), 'Zustand „Fehler, Versuch 2 von 3“')
    t.check(/nach 3 Versuchen fehlgeschlagen/.test(await p.locator('[data-termin="t2"] [data-mail="erinnerung"]').innerText()), 'Zustand „nach 3 Versuchen fehlgeschlagen“')
    t.check(/Resend 403: Domain nicht bestätigt/.test(await p.locator('[data-termin="t2"]').innerText()), 'Grund des Fehlers steht beim Termin')
    t.check(/Eine Mail ist nach drei Versuchen endgültig fehlgeschlagen/.test(await p.getByTestId('versand-warnung').innerText()), 'Warnung oben bei endgültigem Fehler')
    t.check(/pausiert/.test(await p.locator('[data-termin="t3"]').innerText()) && /Admin in Kopie/.test(await p.locator('[data-termin="t3"]').innerText()), 'Pausiert und Admin in Kopie')
    await p.getByLabel('Entfernte anzeigen').check()
    t.check((await p.locator('[data-testid="termin-liste"] > li').count()) === 4 && (await p.locator('[data-termin="t4"]').getByRole('button').count()) === 0, 'Entfernte lassen sich anzeigen, ohne Bedienknöpfe')
    await p.getByLabel('Entfernte anzeigen').uncheck()

    // Eingaben werden vor dem Absenden geprüft
    await p.getByRole('button', { name: 'Termin anlegen' }).click()
    await p.getByRole('button', { name: 'Speichern' }).click()
    t.check(/Bitte Datum und Uhrzeit angeben\./.test(await p.getByTestId('termin-probleme').innerText()), 'Ohne Datum: Hinweis')
    await p.locator('#t-start').fill('2027-02-01T10:00')
    await p.locator('#t-vorlauf').fill('0')
    await p.locator('#t-erinnerung').fill('abc')
    await p.getByRole('button', { name: 'Speichern' }).click()
    const pr = await p.getByTestId('termin-probleme').innerText()
    t.check(/Vorlauf in Tagen/.test(pr) && /Erinnerung in Stunden/.test(pr), 'Ungültige Vorlauf-Werte: beide Hinweise')
    t.check(!a.some((x) => x.rpc === 'termin_speichern'), 'Ungültige Eingabe: nichts wird gesendet')
    await p.locator('#t-vorlauf').fill('3; 1')
    await p.locator('#t-erinnerung').fill('0,5 2')
    await p.locator('#t-monat').fill('2027-01')
    await p.getByLabel('Admin zusätzlich in Kopie').check()
    await p.getByRole('button', { name: 'Speichern' }).click()
    await p.getByText('Termin angelegt.').waitFor()
    const s = a.find((x) => x.rpc === 'termin_speichern').body
    t.check(s.p_id === null && s.p_startet_lokal === '2027-02-01T10:00' && s.p_titel === 'Teammeeting', 'termin_speichern: Ortszeit ohne Zeitzone')
    t.check(JSON.stringify(s.p_vorlauf_tage) === '[3,1]' && JSON.stringify(s.p_erinnerung_stunden) === '[0.5,2]', 'Vorlauf [3,1], Erinnerung [0.5,2] („0,5“ ist ein Wert)')
    t.check(s.p_bezugsmonat === '2027-01-01' && s.p_admin_in_kopie === true && s.p_mails_pausiert === false, 'Bezugsmonat, Admin in Kopie')

    // Serie
    await p.getByRole('button', { name: 'Termin anlegen' }).click()
    await p.locator('#t-start').fill('2027-01-11T10:00')
    await p.getByLabel('Als Serie anlegen').check()
    await p.locator('#t-rhythmus').selectOption('zweiwoechentlich')
    await p.locator('#t-anzahl').fill('61')
    await p.getByRole('button', { name: 'Speichern' }).click()
    t.check(/Eine Serie hat 2 bis 60 Termine\./.test(await p.getByTestId('termin-probleme').innerText()), 'Serie mit 61 Terminen: Hinweis')
    await p.locator('#t-anzahl').fill('3')
    await p.getByRole('button', { name: 'Speichern' }).click()
    await p.getByText('Serie mit 3 Terminen angelegt.').waitFor()
    const serie = a.find((x) => x.rpc === 'termine_serie').body
    t.check(serie.p_rhythmus === 'zweiwoechentlich' && serie.p_anzahl === 3 && serie.p_startet_lokal === '2027-01-11T10:00', 'termine_serie: Rhythmus, Anzahl, Beginn')

    // Pausieren, Ändern, Entfernen
    await p.locator('[data-termin="t1"]').getByRole('button', { name: 'Mails pausieren' }).click()
    await p.getByText(/Mails pausiert/).waitFor()
    const pa = a.filter((x) => x.rpc === 'termin_speichern').pop().body
    t.check(pa.p_id === 't1' && pa.p_mails_pausiert === true && pa.p_startet_lokal === '2026-12-14T10:00', 'Pausieren ändert nur den Schalter, nicht den Termin')
    await p.locator('[data-termin="t3"]').getByRole('button', { name: 'Mails fortsetzen' }).click()
    await p.getByText('Mails werden wieder gesendet.').waitFor()
    t.check(a.filter((x) => x.rpc === 'termin_speichern').pop().body.p_mails_pausiert === false, 'Fortsetzen')
    await p.locator('[data-termin="t2"]').getByRole('button', { name: 'Entfernen' }).click()
    t.check(a.filter((x) => x.rpc === 'termin_entfernen').length === 0, 'Entfernen fragt erst nach')
    await p.locator('[data-termin="t2"]').getByRole('button', { name: 'Ja, entfernen' }).click()
    await p.getByText(/Termin entfernt\. Er wird nicht gelöscht/).waitFor()
    t.check(a.find((x) => x.rpc === 'termin_entfernen').body.p_id === 't2', 'termin_entfernen(t2)')
    await p.locator('[data-termin="t2"]').waitFor({ state: 'detached' })
    t.check((await p.locator('[data-termin="t2"]').count()) === 0, 'Der entfernte Termin ist ausgeblendet')
    await p.locator('[data-termin="t1"]').getByRole('button', { name: 'Ändern' }).click()
    t.check((await p.locator('#t-start').inputValue()) === '2026-12-14T10:00' && (await p.locator('#t-vorlauf').inputValue()) === '2', 'Ändern: Formular zeigt die Ortszeit und den Vorlauf')
    t.check(k.length === 0, `keine Konsolenfehler ${k.join(' | ')}`)
    await c.close()
  }

  t.abschnitt('Handy-Breite, Nachtmodus')
  {
    const tw = terminWelt([termin('t2', '2026-11-30T10:00', { mails: [mail('vorab', 'fehler', 2, 'Resend 500'), mail('erinnerung', 'fehlgeschlagen', 3, 'Resend 403: Domain nicht bestätigt')] })], 1)
    const aw = agendaWelt(agendaZeile())
    for (const [name, viewport, colorScheme, seite] of [['handy', { width: 375, height: 800 }, 'light', 'termine'], ['nacht', { width: 1280, height: 900 }, 'dark', 'termine'], ['handy-agenda', { width: 375, height: 800 }, 'light', 'agenda']]) {
      const { page: p, context: c, konsole: k } = await neueSeite(browser, { rolle: 'admin', antworten: { ...tw.antworten, ...aw.antworten }, viewport, colorScheme })
      await p.goto(`${BASE}/app/leitung/${seite}`)
      await kennt(p)
      await p.locator(seite === 'termine' ? '[data-testid="termin-liste"]' : 'h2.ausw-titel >> nth=0').waitFor()
      const b = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, fenster: window.innerWidth }))
      t.check(b.scroll <= b.fenster, `${name}: kein waagerechter Überlauf (${b.scroll} ≤ ${b.fenster})`)
      await p.screenshot({ path: `out/phase-f-${name}.png`, fullPage: true })
      t.check(k.length === 0, `${name}: keine Konsolenfehler ${k.join(' | ')}`)
      await c.close()
    }
  }

  t.abschnitt('PDF: nur eine freigegebene Agenda, nie Kommentar-Beispiele')
  {
    const dash = {
      schwellen: SCHWELLEN, monate: ['2026-09'], monat: '2026-09',
      personen: [{ id: 'a', name: 'Anna Berger', sb: 3.2, fb: 2.9, differenz: 0.3, minuten: 6, rang: 1 }],
      verhalten: [{ nr: 1, grundpfeiler: 'GP', saeule: 'Säule 1', titel: 'Testverhalten', sb: 3, fb: 3 }],
      matrix: [], rituale_skalen: [], rituale_phasen: [], entwicklung: [],
    }
    const team = { schwellen: SCHWELLEN, monate: ['2026-09'], verhalten: [], rituale_skalen: [], rituale_phasen: [], entwicklung: [], dauer: [] }
    const zeit = { monat: '2026-09', monate: ['2026-09'], abgaben_ohne_zeit: 0, einstellungen: { min_sek_pro_verhalten: 5, sehr_lang_sek: 14400, pausen_quote: 0.3, heartbeat_luecke_sek: 180 }, personen: [], zusammenfassung: { abgegeben: 1, zaehlt: 1, median_sek: 400, min_sek: 400, max_sek: 400 }, verhalten: [], heatmap: [] }
    const ohneBeispiele = bloecke().map((b) => ({ titel: b.titel, minuten: b.minuten, punkte: b.punkte.filter((p) => !p.beispiel).map((p) => ({ text: p.text })) }))
    const bericht = (agenda) => ({
      salon: 'DAWIID', monat: '2026-09', erstellt_am: '2026-11-05T09:30:00Z', schwellen: SCHWELLEN,
      beteiligung: { erwartet: 4, abgegeben: 3 }, kennzahlen: { sb: 3.2, fb: 2.9, differenz: 0.3 },
      verhalten: [{ nr: 1, grundpfeiler: 'GP', saeule: 'Säule 1', titel: 'Testverhalten', sb: 3, fb: 3 }],
      kommentare: { team: { quote: 50, kommentare: 2, bewertungen: 4, pflicht: 1, pflicht_erfuellt: 1, freiwillige_quote: 33.3, woerter_schnitt: 3 }, personen: [] },
      zeit: { abgegeben: 3, zaehlt: 3, median_sek: 400 }, agenda,
    })
    const lade = async (agenda, datei) => {
      const { page: p, context: c } = await neueSeite(browser, {
        rolle: 'chef', antworten: { team_dashboard: dash, team_ergebnisse: team, zeit_auswertung: zeit, abgabe_status: [], ueberfaellige_abgaben: [], pdf_monatsbericht: bericht(agenda) },
      })
      await p.goto(BASE + '/app/team')
      await kennt(p)
      const [d] = await Promise.all([p.waitForEvent('download', { timeout: 60_000 }), p.getByRole('button', { name: 'Monatsbericht als PDF' }).click()])
      const pfad = `${ZIEL}/${datei}`
      await d.saveAs(pfad)
      await c.close()
      return pfad
    }
    const mit = await lade({ bloecke: ohneBeispiele, unvollstaendig: true, hinweise: ['Der Monat ist noch nicht abgeschlossen.'], freigegeben_am: '2026-11-05T11:00:00Z', freigegeben_von: 'Dawid Chef' }, 'agenda-mit.pdf')
    const ohne = await lade(null, 'agenda-ohne.pdf')
    const txt = execFileSync('pdftotext', ['-layout', mit, '-'], { encoding: 'utf8' })
    const flach = txt.replace(/\s+/g, ' ')
    t.check(/Agenda fürs Teammeeting/.test(txt) && /18 Minuten/.test(flach) && /Freigegeben von Dawid Chef am 5\. November 2026/.test(flach), 'PDF: Abschnitt, Dauer, Freigabe')
    for (const b of bloecke()) t.check(flach.includes(`${b.titel} (${b.minuten} Min.)`), `PDF: Block „${b.titel}“ mit Minuten`)
    t.check(/Stand unvollständig: Der Monat ist noch nicht abgeschlossen\./.test(flach), 'PDF: Hinweis „Stand unvollständig“')
    t.check(/Große Differenz: Verhalten 3/.test(flach) && /Selbstbild 3,1, Fremdbild 2,9\./.test(flach), 'PDF: Punkte der Agenda')
    t.check(!/Beispiel aus den Kommentaren|hilft immer|erklärt gut/.test(txt), 'PDF: nie Kommentar-Beispiele')
    const schriften = execFileSync('pdffonts', [mit], { encoding: 'utf8' })
    t.check(!/Helvetica/.test(schriften) && schriften.split('\n').slice(2).filter(Boolean).every((z) => / yes /.test(z)), 'PDF: alle Schriften eingebettet')
    const seitenMit = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [mit], { encoding: 'utf8' }))?.[1])
    t.check((txt.match(/Vertraulich – nur für Verantwortliche/g) ?? []).length === seitenMit, `PDF: Fußzeile auf allen ${seitenMit} Seiten`)
    const ohneTxt = execFileSync('pdftotext', ['-layout', ohne, '-'], { encoding: 'utf8' })
    t.check(!/Agenda fürs Teammeeting/.test(ohneTxt), 'PDF ohne freigegebene Agenda: kein Agenda-Abschnitt')
  }

  return t.ende()
}
