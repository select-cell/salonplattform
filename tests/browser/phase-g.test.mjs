// Phase G (Version 1.3): KI direkt aus der Oberfläche. Der Browser holt die Eingabe von der Datenbank, schickt sie mit der
// Anmeldung des Admins an den n8n-Webhook und lässt die Antwort von der Datenbank prüfen und speichern.
// Ist der Webhook vom Browser aus nicht erreichbar, nimmt dieselbe Aufgabe die Edge Function.
import { BASE, neueSeite, pruefer } from './helfer.mjs'

const N8N_URL = 'https://tobitest2008.app.n8n.cloud/webhook/dawiid-ki'
const kennt = (seite) => seite.getByRole('button', { name: 'Verstanden' }).click({ timeout: 1500 }).catch(() => undefined)

const AGENDA_AUSGABE = {
  bloecke: [
    { id: 'einstieg', minuten: 2, punkte: ['Danke an das Team.', '3 von 4 haben abgegeben.'] },
    { id: 'kennzahlen', minuten: 3, punkte: ['Selbstbild 3,1, Fremdbild 2,9.', 'Differenz 0,2.'] },
    { id: 'fokus', minuten: 7, punkte: ['Verhalten 2 „Titel 2“ bleibt im Fokus.', 'Verhalten 3 „Titel 3“ hat eine große Differenz.'] },
    { id: 'entwicklung', minuten: 4, punkte: ['Verhalten 4 „Titel 4“ ist das niedrigste Fremdbild.', 'Was braucht das Team dafür?'] },
    { id: 'vereinbarungen', minuten: 2, punkte: ['Was nehmen wir uns vor?', 'Wer übernimmt welchen Schritt?'] },
  ],
}
const EINGABE = { aufgabe: 'agenda', monat: '2026-09', team: { kennzahlen: { selbstbild: 3.1, fremdbild: 2.9 } }, fokus_aktuell: [{ nr: 2, titel: 'Titel 2' }], zeitbudget: { gesamt_min: 15, gesamt_max: 20 } }

function kiZeile(b) {
  return {
    monat: '2026-09', status: 'entwurf', text: '', bearbeitet: false, erstellt_am: '2026-11-05T09:30:00Z', aktualisiert_am: '2026-11-05T09:30:00Z',
    bearbeitet_am: null, bearbeitet_von: null, freigegeben_am: null, freigegeben_von: null,
    anbieter: 'webhook', modell: null, prompt_version: 'agenda-ki-v1', versuche: 1, geprueft: true, pruef_hinweis: null,
    agenda: {
      vorlage: 'agenda-ki-v1', monat: '2026-09', minuten_gesamt: 18, unvollstaendig: false, hinweise: [],
      bloecke: b.map((x) => ({ id: x.id, titel: x.id, minuten: x.minuten, punkte: x.punkte.map((text) => ({ text })) })),
    },
  }
}

/** Datenbank für die Agenda: dieselben Funktionen, die die Edge Function rufen würde, plus die Edge Function selbst als Rückfall. */
function welt({ eingabeFehler = null, pruefen = null } = {}) {
  const z = { agenda: null, edge: [] }
  return {
    z,
    antworten: {
      abschluss_uebersicht: { monat: '2026-09', monate: ['2026-09'], eigene_analyse_nur_admin: false, ki: true, gesamt: null, abschluss: null, aktuell: { abgaben: 3, erwartet: 4 }, nicht_abgegeben: [], personen: [] },
      agenda_lesen: () => z.agenda,
      agenda_ki_eingabe: () => eingabeFehler ?? { eingabe: EINGABE, hash: 'h1' },
      agenda_ki_pruefen: (b) => pruefen?.(b) ?? { geprueft: true, abweichungen: [], struktur_fehler: null },
      agenda_ki_speichern: (b) => { z.agenda = kiZeile(b.p_bloecke); return z.agenda },
      'fn:analyse-erstellen': (b) => {
        z.edge.push(b)
        z.agenda = kiZeile(AGENDA_AUSGABE.bloecke)
        return { ok: true, uebersprungen: false, versuche: 1, analyse: z.agenda }
      },
    },
  }
}

const webhookGut = (b) => ({ ergebnisse: b.auftraege.map((a) => ({ ref: a.ref, code: 200, ausgabe: AGENDA_AUSGABE })) })

export default async function (browser) {
  const t = pruefer('Phase G: KI direkt aus der Oberfläche')

  t.abschnitt('Agenda: Browser → Webhook, ohne Edge Function')
  {
    const w = welt()
    const { page: p, context: c, aufrufe: a, konsole: kk } = await neueSeite(browser, { rolle: 'admin', antworten: w.antworten, kiWeg: 'direkt', webhook: (b) => webhookGut(b) })
    await p.goto(BASE + '/app/leitung/agenda')
    await kennt(p)
    await p.getByRole('button', { name: 'Mit KI formulieren' }).click()
    await p.getByTestId('agenda-ki').waitFor()
    t.check(/Agenda von der KI formuliert\. Bitte lesen/.test(await p.locator('main').innerText()), 'Meldung „Agenda von der KI formuliert“')
    t.check(!a.some((x) => x.rpc.startsWith('fn:')), 'Die Edge Function wird nicht gerufen')

    const namen = a.map((x) => x.rpc).filter((n) => n !== 'ich')
    const i = (n) => namen.indexOf(n)
    t.check(i('agenda_ki_eingabe') >= 0 && i('agenda_ki_eingabe') < i('n8n') && i('n8n') < i('agenda_ki_pruefen') && i('agenda_ki_pruefen') < i('agenda_ki_speichern'), 'Reihenfolge: Eingabe aus der Datenbank → Webhook → Faktencheck → Speichern')
    const n8n = a.filter((x) => x.rpc === 'n8n')
    t.check(n8n.length === 1 && n8n[0].url === N8N_URL, 'Genau ein Aufruf an die Webhook-Adresse aus dem Code')
    const bearer = /^Bearer (\S+)\.(\S+)\.(\S+)$/.exec(n8n[0].kopf.authorization ?? '')
    const nutzlast = bearer ? JSON.parse(Buffer.from(bearer[2], 'base64url').toString()) : {}
    t.check(!!bearer && nutzlast.sub === 'u1' && nutzlast.role === 'authenticated', 'Der Webhook bekommt die Anmeldung des Admins (Authorization: Bearer <Zugangstoken der Sitzung>)')
    t.check(!('x-webhook-secret' in n8n[0].kopf), 'Kein Geheimnis in der Oberfläche')
    const b = n8n[0].body
    t.check(b.aufgabe === 'agenda' && b.prompt_version === 'agenda-ki-v1' && b.auftraege.length === 1 && b.auftraege[0].ref === '1', 'Anfrage: aufgabe = agenda, Prompt-Version, ein Auftrag mit ref „1“')
    t.check(JSON.stringify(b.auftraege[0].eingabe) === JSON.stringify(EINGABE), 'Der Auftrag trägt genau die Eingabe, die die Datenbank geliefert hat')
    t.check(/Gäste|Teammeeting|Friseursalon/.test(b.auftraege[0].system) && b.auftraege[0].nachricht.includes('Daten (JSON):'), 'System-Prompt und Nachricht sind dabei')
    const sp = a.find((x) => x.rpc === 'agenda_ki_speichern')
    t.check(sp.body.p_prompt_version === 'agenda-ki-v1' && sp.body.p_anbieter === 'webhook' && sp.body.p_versuche === 1 && sp.body.p_bloecke.length === 5, 'Gespeichert wird über die Datenbankfunktion (Anbieter webhook, 1 Versuch, 5 Blöcke)')
    t.check(JSON.stringify(a.find((x) => x.rpc === 'agenda_ki_pruefen').body.p_bloecke) === JSON.stringify(AGENDA_AUSGABE.bloecke), 'Die Datenbank prüft genau die Blöcke der KI')
    t.check(kk.length === 0, `keine Konsolenfehler ${kk.join(' | ')}`)
    await c.close()
  }

  t.abschnitt('Wiederholung bei einem Fehler im Aufbau (Meldung der Datenbank geht an die KI zurück)')
  {
    let pruefungen = 0
    const w = welt({ pruefen: () => (++pruefungen === 1 ? { geprueft: false, abweichungen: [], struktur_fehler: 'Der Block „Einstieg und Beteiligung“ dauert genau 2 Minuten.' } : null) })
    const { page: p, context: c, aufrufe: a } = await neueSeite(browser, { rolle: 'admin', antworten: w.antworten, kiWeg: 'direkt', webhook: (b) => webhookGut(b) })
    await p.goto(BASE + '/app/leitung/agenda')
    await kennt(p)
    await p.getByRole('button', { name: 'Mit KI formulieren' }).click()
    await p.getByTestId('agenda-ki').waitFor()
    const n8n = a.filter((x) => x.rpc === 'n8n')
    t.check(n8n.length === 2, 'Zweiter Aufruf an den Webhook nach dem Aufbaufehler')
    t.check(n8n[1].body.auftraege[0].nachricht.startsWith('Deine letzte Antwort passt nicht zur Vorgabe: Der Block „Einstieg und Beteiligung“ dauert genau 2 Minuten.'), 'Die Meldung der Datenbank steht oben in der zweiten Nachricht')
    t.check(a.filter((x) => x.rpc === 'agenda_ki_speichern').length === 1, 'Gespeichert wird einmal, nach bestandener Prüfung')
    await c.close()
  }

  t.abschnitt('Rückfall: Webhook vom Browser aus nicht erreichbar')
  {
    const w = welt()
    const { page: p, context: c, aufrufe: a } = await neueSeite(browser, { rolle: 'admin', antworten: w.antworten, kiWeg: 'direkt', webhook: null })
    await p.goto(BASE + '/app/leitung/agenda')
    await kennt(p)
    await p.getByRole('button', { name: 'Mit KI formulieren' }).click()
    await p.getByTestId('agenda-ki').waitFor()
    t.check(w.z.edge.length === 1 && w.z.edge[0].aufgabe === 'agenda' && w.z.edge[0].monat === '2026-09', 'Die Aufgabe geht über die Edge Function (aufgabe = agenda, Monat)')
    t.check(!a.some((x) => x.rpc === 'agenda_ki_speichern'), 'Im Browser wird nichts doppelt gespeichert')
    t.check(/Agenda von der KI formuliert/.test(await p.locator('main').innerText()), 'Für den Admin sieht es genauso aus')
    await c.close()
  }

  t.abschnitt('Fehler: Webhook lehnt ab, Zeitüberschreitung, Datenbank verweigert')
  {
    // Der Webhook antwortet mit 401 (Anmeldung ungültig): Meldung, kein Rückfall (der Webhook hat die Anfrage gesehen)
    const w = welt()
    const { page: p, context: c, aufrufe: a } = await neueSeite(browser, { rolle: 'admin', antworten: w.antworten, kiWeg: 'direkt', webhook: () => ({ status: 401, body: { ok: false, fehler: 'Bitte melde dich an.' } }) })
    await p.goto(BASE + '/app/leitung/agenda')
    await kennt(p)
    await p.getByRole('button', { name: 'Mit KI formulieren' }).click()
    await p.getByRole('alert').filter({ hasText: 'Der KI-Zugang wurde abgelehnt.' }).waitFor()
    t.check(w.z.edge.length === 0 && a.filter((x) => x.rpc === 'n8n').length === 1, 'Kein Rückfall und kein zweiter Aufruf bei einer Ablehnung durch den Webhook')
    t.check(await p.getByRole('button', { name: 'Mit KI formulieren' }).isEnabled() && !a.some((x) => x.rpc === 'agenda_ki_speichern'), 'Nichts gespeichert, erneut versuchen möglich')
    await c.close()
  }
  {
    // Die Datenbank verweigert (kein Admin): deutsche Meldung, der Webhook wird nie gerufen
    const w = welt({ eingabeFehler: { status: 403, body: { code: '42501', message: 'Nur für Admins.' } } })
    const { page: p, context: c, aufrufe: a } = await neueSeite(browser, { rolle: 'admin', antworten: w.antworten, kiWeg: 'direkt', webhook: (b) => webhookGut(b) })
    await p.goto(BASE + '/app/leitung/agenda')
    await kennt(p)
    await p.getByRole('button', { name: 'Mit KI formulieren' }).click()
    await p.getByRole('alert').filter({ hasText: 'Nur für Admins.' }).waitFor()
    t.check(!a.some((x) => x.rpc === 'n8n') && w.z.edge.length === 0, 'Ohne Recht geht nichts an den Webhook und nichts an die Edge Function')
    await c.close()
  }
  {
    // Der Schalter für die Fehlersuche: nur Edge Function
    const w = welt()
    const { page: p, context: c, aufrufe: a } = await neueSeite(browser, { rolle: 'admin', antworten: w.antworten, kiWeg: 'edge', webhook: (b) => webhookGut(b) })
    await p.goto(BASE + '/app/leitung/agenda')
    await kennt(p)
    await p.getByRole('button', { name: 'Mit KI formulieren' }).click()
    await p.getByTestId('agenda-ki').waitFor()
    t.check(w.z.edge.length === 1 && !a.some((x) => x.rpc === 'n8n'), 'localStorage „dawiid-ki-weg“ = edge: nur die Edge Function')
    await c.close()
  }

  return t.ende()
}
