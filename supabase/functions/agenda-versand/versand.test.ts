// Tests für die Logik der Edge Function (Node: `node --test supabase/functions/agenda-versand/versand.test.ts`).
// Datenbank und Resend sind nachgebaut; es gibt keinen Netzzugriff.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agendaLink, baueMail, behandleAnfrage, esc, fehlendeSecrets, gleichInGleicherZeit, konfigAusUmgebung, terminText, wichtigstePunkte,
  type VersandDaten,
} from './versand.ts'

const T = '11111111-0000-0000-0000-0000000000e1'
const ENV = {
  CRON_SECRET: 'geheim-geheim-geheim',
  RESEND_API_KEY: 're_test',
  MAIL_ABSENDER: 'Salon <agenda@salon.example>',
  PLATTFORM_URL: 'https://plattform.example/',
  SUPABASE_URL: 'https://p.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
}

const DATEN: VersandDaten = {
  salon: 'Salon <Test>',
  termin: { id: T, titel: 'Teammeeting Oktober', startet_lokal: '2026-10-26T10:00' },
  monat: '2026-09',
  status: 'entwurf',
  agenda: {
    unvollstaendig: true,
    hinweise: ['Der Monat ist noch nicht abgeschlossen.', 'Es haben erst 3 von 4 Personen abgegeben.'],
    bloecke: [
      { id: 'einstieg', titel: 'Einstieg und Beteiligung', minuten: 2, punkte: [{ text: 'Danke an alle.' }, { text: '3 von 4 Personen haben abgegeben.' }] },
      { id: 'kennzahlen', titel: 'Team-Kennzahlen des Monats', minuten: 3, punkte: [{ text: 'Selbstbild 3,1, Fremdbild 2,9.' }] },
      { id: 'fokus', titel: 'Fokus-Verhalten', minuten: 7, punkte: [{ text: 'Fokus: Verhalten 2 <b>fett</b> & „Titel“.' }, { text: 'Große Differenz: Verhalten 3.' }, { text: 'Große Differenz: Verhalten 1.' }, { text: 'Vierter Punkt.' }] },
      { id: 'entwicklung', titel: 'Entwicklungsfelder und Differenzen', minuten: 4, punkte: [{ text: 'Verhalten 4.' }] },
      { id: 'vereinbarungen', titel: 'Vereinbarungen', minuten: 2, punkte: [{ text: 'Wer übernimmt welchen Schritt?' }] },
    ],
  },
  hinweis: null,
  empfaenger: ['chef@test.example', 'ludwig@test.example'],
}

// ---- Hilfen ---------------------------------------------------------------------------------------------------

test('fehlendeSecrets und konfigAusUmgebung', () => {
  assert.deepEqual(fehlendeSecrets(ENV), [])
  assert.deepEqual(fehlendeSecrets({}), ['CRON_SECRET', 'RESEND_API_KEY', 'MAIL_ABSENDER', 'PLATTFORM_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  assert.deepEqual(fehlendeSecrets({ ...ENV, RESEND_API_KEY: '   ', PLATTFORM_URL: '' }), ['RESEND_API_KEY', 'PLATTFORM_URL'])
  const k = konfigAusUmgebung(ENV)
  assert.equal(k.plattformUrl, 'https://plattform.example', 'Schrägstrich am Ende fällt weg')
  assert.equal(k.serviceKey, 'service-key')
})

test('gleichInGleicherZeit: gleich, ungleich, unterschiedlich lang, leer', async () => {
  assert.equal(await gleichInGleicherZeit('abc', 'abc'), true)
  assert.equal(await gleichInGleicherZeit('abc', 'abd'), false)
  assert.equal(await gleichInGleicherZeit('abc', 'abcd'), false)
  assert.equal(await gleichInGleicherZeit('', 'abc'), false)
  assert.equal(await gleichInGleicherZeit('', ''), true)
  assert.equal(await gleichInGleicherZeit('ä'.repeat(100), 'ä'.repeat(100)), true)
})

test('esc maskiert alles Gefährliche', () => {
  assert.equal(esc(`<script>alert("x")</script> & 'y'`), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;')
  assert.equal(esc(null), '')
  assert.equal(esc(7), '7')
})

test('terminText: Wanduhrzeit und Wochentag unabhängig von der Zeitzone des Servers', () => {
  assert.deepEqual(terminText('2026-10-26T10:00'), { datum: 'Mo., 26.10.2026', uhr: '10:00', lang: 'Mo., 26.10.2026 um 10:00 Uhr' })
  assert.equal(terminText('2027-03-29T09:30').lang, 'Mo., 29.03.2027 um 09:30 Uhr')
  assert.equal(terminText('2026-12-31T23:59').lang, 'Do., 31.12.2026 um 23:59 Uhr')
  assert.equal(terminText('kaputt').lang, 'kaputt')
})

test('agendaLink und wichtigstePunkte', () => {
  assert.equal(agendaLink('https://plattform.example///', '2026-09'), 'https://plattform.example/app/leitung/agenda?monat=2026-09')
  assert.deepEqual(wichtigstePunkte(DATEN.agenda), ['Fokus: Verhalten 2 <b>fett</b> & „Titel“.', 'Große Differenz: Verhalten 3.', 'Große Differenz: Verhalten 1.'])
  assert.deepEqual(wichtigstePunkte({ bloecke: [{ id: 'fokus', titel: 'F', minuten: 6, punkte: [{ text: 'a' }] }, { id: 'entwicklung', titel: 'E', minuten: 3, punkte: [{ text: 'b' }, { text: 'c' }] }] }), ['a', 'b', 'c'], 'füllt mit Entwicklungsfeldern auf')
  assert.deepEqual(wichtigstePunkte(null), [])
})

// ---- Mail -----------------------------------------------------------------------------------------------------

test('Mail „vorab“: alle Blöcke mit Minuten, Stand, Hinweis, Link', () => {
  const m = baueMail('vorab', DATEN, 'https://plattform.example/')
  assert.equal(m.betreff, 'Agenda fürs Teammeeting am Mo., 26.10.2026 um 10:00 Uhr')
  for (const b of DATEN.agenda!.bloecke) {
    assert.ok(m.html.includes(esc(b.titel)), `Block ${b.titel} im HTML`)
    assert.ok(m.text.includes(`${b.titel} (${b.minuten} Min.)`), `Block ${b.titel} im Text`)
  }
  assert.match(m.html, /\(2 Min\.\)/)
  assert.match(m.html, /\(7 Min\.\)/)
  assert.ok(m.html.includes('Stand: Entwurf') && m.text.includes('Stand: Entwurf'), 'Stand: Entwurf')
  assert.ok(m.html.includes('Stand unvollständig:') && m.html.includes('Es haben erst 3 von 4 Personen abgegeben.'), 'Hinweis „Stand unvollständig“')
  assert.ok(m.html.includes('href="https://plattform.example/app/leitung/agenda?monat=2026-09"'), 'Link mit Monat')
  assert.ok(m.text.includes('https://plattform.example/app/leitung/agenda?monat=2026-09'))
  assert.ok(m.html.includes('Vierter Punkt.'), 'alle Punkte, nicht nur drei')
})

test('Mail: alles maskiert, nichts Eingeschleustes wird zu HTML', () => {
  const m = baueMail('vorab', DATEN, 'https://plattform.example')
  assert.ok(!m.html.includes('<b>fett</b>'), 'kein eingeschleustes <b>')
  assert.ok(m.html.includes('&lt;b&gt;fett&lt;/b&gt; &amp; „Titel“'), 'Text maskiert, Umlaute und Anführungszeichen bleiben')
  assert.ok(m.html.includes('Salon &lt;Test&gt;'), 'Salonname maskiert')
  const boese: VersandDaten = { ...DATEN, termin: { ...DATEN.termin, titel: '"><script>x()</script>' } }
  const b = baueMail('vorab', boese, 'https://plattform.example')
  assert.ok(!b.html.includes('<script>'), 'kein <script> im Titel')
  const link = baueMail('vorab', { ...DATEN, monat: '2026-09"><script>' }, 'https://plattform.example')
  assert.ok(!link.html.includes('<script>') && link.html.includes('monat=2026-09%22%3E%3Cscript%3E'), 'Monat im Link kodiert')
})

test('Mail „erinnerung“: die drei wichtigsten Punkte, Link', () => {
  const m = baueMail('erinnerung', { ...DATEN, status: 'freigegeben' }, 'https://plattform.example')
  assert.equal(m.betreff, 'Erinnerung: Teammeeting am Mo., 26.10.2026 um 10:00 Uhr')
  assert.ok(m.html.includes('Die wichtigsten Punkte'))
  assert.equal((m.html.match(/<li /g) ?? []).length, 3, 'genau drei Punkte')
  assert.ok(m.html.includes('Große Differenz: Verhalten 1.') && !m.html.includes('Vierter Punkt.'))
  assert.ok(!m.html.includes('Einstieg und Beteiligung'), 'keine Blöcke der Vorab-Mail')
  assert.ok(m.html.includes('Stand: freigegeben'))
  assert.ok(m.html.includes('agenda?monat=2026-09'))
  assert.deepEqual(m.text.split('\n').filter((z) => /^\d\. /.test(z)).length, 3)
})

test('Mail ohne Agenda: ein Hinweis statt einer leeren Agenda; ohne Hinweis zur Unvollständigkeit, wenn vollständig', () => {
  const ohne = baueMail('vorab', { ...DATEN, agenda: null, status: null, hinweis: 'Für diesen Monat liegen noch keine Auswertungen vor, deshalb gibt es noch keine Agenda.' }, 'https://plattform.example')
  assert.ok(ohne.html.includes('deshalb gibt es noch keine Agenda.'))
  assert.ok(!ohne.html.includes('Stand:'), 'ohne Agenda kein „Stand“')
  assert.ok(!ohne.html.includes('<ul'), 'keine leere Liste')
  const voll = baueMail('vorab', { ...DATEN, status: 'freigegeben', agenda: { ...DATEN.agenda!, unvollstaendig: false, hinweise: [] } }, 'https://plattform.example')
  assert.ok(!voll.html.includes('Stand unvollständig'))
  assert.ok(voll.html.includes('Stand: freigegeben'))
})

test('Mail: feste Farben statt Design-Tokens', () => {
  const m = baueMail('vorab', DATEN, 'https://plattform.example')
  assert.ok(!m.html.includes('var(--'), 'keine CSS-Variablen')
  assert.match(m.html, /#faf8f3/)
  assert.match(m.html, /#a86840/)
})

// ---- Ablauf ---------------------------------------------------------------------------------------------------

interface Aufruf { url: string; kopf: Record<string, string>; body: unknown }

/** Nachgebaute Datenbank und Resend. rpc-Antworten lassen sich je Funktion überschreiben. */
function welt(opts: {
  faellig?: unknown[]
  claim?: (n: number) => unknown
  inhalt?: (art: string) => unknown
  resend?: (n: number) => { status: number; body: unknown } | Error
  rpcFehler?: Record<string, number>
} = {}) {
  const aufrufe: Aufruf[] = []
  let mails = 0
  const faellig = opts.faellig ?? [{ termin_id: T, art: 'vorab', startet_am: '2026-10-26T09:00:00+00:00', titel: 'Teammeeting Oktober', faellig_ab: '2026-10-24T08:00:00+00:00', versuche: 0 }]
  const fetchFn = async (url: string, init?: RequestInit) => {
    const kopf = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>))
    const body = init?.body ? JSON.parse(String(init.body)) : null
    aufrufe.push({ url, kopf, body })
    if (url === 'https://api.resend.com/emails') {
      mails++
      const r = opts.resend?.(mails) ?? { status: 200, body: { id: 'mail-1' } }
      if (r instanceof Error) throw r
      return new Response(JSON.stringify(r.body), { status: r.status })
    }
    const name = url.split('/rpc/')[1]
    if (opts.rpcFehler?.[name]) return new Response(JSON.stringify({ message: `Fehler in ${name}` }), { status: opts.rpcFehler[name] })
    const daten: Record<string, unknown> = {
      versand_faellig: faellig,
      versand_beanspruchen: opts.claim ? opts.claim(1) : 1,
      agenda_fuer_versand: opts.inhalt ? opts.inhalt(body?.p_art) : DATEN,
      versand_abschliessen: null,
    }
    return new Response(JSON.stringify(daten[name]), { status: 200 })
  }
  const rpcNamen = () => aufrufe.filter((a) => a.url.includes('/rpc/')).map((a) => a.url.split('/rpc/')[1])
  return { fetchFn, aufrufe, rpcNamen, mails: () => mails }
}

const anfrage = (body: unknown = {}, kopf: Record<string, string> = { 'x-cron-secret': ENV.CRON_SECRET }, methode = 'POST') =>
  new Request('https://f.example/agenda-versand', { method: methode, headers: { 'content-type': 'application/json', ...kopf }, body: methode === 'POST' ? JSON.stringify(body) : undefined })

test('Zugang: falsche Methode 405, Secret fehlt 503, falsches Secret 401 – nie ein Datenbankzugriff', async () => {
  const w = welt()
  assert.equal((await behandleAnfrage(anfrage({}, {}, 'GET'), ENV, w.fetchFn)).status, 405)
  const ohneCron = await behandleAnfrage(anfrage(), { ...ENV, CRON_SECRET: '' }, w.fetchFn)
  assert.equal(ohneCron.status, 503)
  assert.deepEqual(await ohneCron.json(), { ok: false, fehler: 'Der Versand ist noch nicht eingerichtet.', fehlend: ['CRON_SECRET'] })
  assert.equal((await behandleAnfrage(anfrage({}, {}), ENV, w.fetchFn)).status, 401, 'ohne Header')
  assert.equal((await behandleAnfrage(anfrage({}, { 'x-cron-secret': 'falsch' }), ENV, w.fetchFn)).status, 401, 'falsches Secret')
  assert.equal((await behandleAnfrage(anfrage({}, { 'x-cron-secret': ENV.CRON_SECRET + 'x' }), ENV, w.fetchFn)).status, 401, 'zu langes Secret')
  assert.equal(w.aufrufe.length, 0, 'kein einziger Netzaufruf')
})

test('Fehlende Einrichtung: 503 mit der Liste, nur nach gültigem Secret, Datenbank bleibt unberührt', async () => {
  const w = welt()
  const r = await behandleAnfrage(anfrage(), { ...ENV, RESEND_API_KEY: undefined, MAIL_ABSENDER: '' }, w.fetchFn)
  assert.equal(r.status, 503)
  assert.deepEqual(await r.json(), { ok: false, fehler: 'Der Versand ist noch nicht eingerichtet.', fehlend: ['RESEND_API_KEY', 'MAIL_ABSENDER'] })
  assert.equal(w.aufrufe.length, 0, 'die Datenbank wurde nicht angefasst: kein Versuch verbraucht')
  const falsch = await behandleAnfrage(anfrage({}, { 'x-cron-secret': 'falsch' }), { ...ENV, RESEND_API_KEY: undefined }, w.fetchFn)
  assert.equal(falsch.status, 401, 'wer das Secret nicht kennt, erfährt auch nicht, was fehlt')
  assert.equal(((await falsch.json()) as { fehlend?: unknown }).fehlend, undefined)
})

test('Probelauf: zeigt, was fällig wäre, ohne zu beanspruchen oder zu senden', async () => {
  const w = welt()
  const r = await behandleAnfrage(anfrage({ trocken: true }), ENV, w.fetchFn)
  assert.equal(r.status, 200)
  const j = (await r.json()) as { ok: boolean; trocken: boolean; faellig: { termin_id: string; art: string }[] }
  assert.deepEqual([j.ok, j.trocken, j.faellig.length, j.faellig[0].art], [true, true, 1, 'vorab'])
  assert.deepEqual(w.rpcNamen(), ['versand_faellig'])
  assert.equal(w.mails(), 0)
})

test('Versand: beanspruchen → Inhalt → Resend → abschließen, in dieser Reihenfolge', async () => {
  const w = welt()
  const r = await behandleAnfrage(anfrage(), ENV, w.fetchFn)
  assert.equal(r.status, 200)
  const j = (await r.json()) as { ergebnisse: { status: string; versuche: number }[] }
  assert.deepEqual(j.ergebnisse.map((e) => [e.status, e.versuche]), [['gesendet', 1]])
  assert.deepEqual(w.rpcNamen(), ['versand_faellig', 'versand_beanspruchen', 'agenda_fuer_versand', 'versand_abschliessen'])
  const mail = w.aufrufe.find((a) => a.url === 'https://api.resend.com/emails')!
  assert.equal(mail.kopf.authorization, 'Bearer re_test')
  assert.equal(mail.kopf['idempotency-key'], `${T}-vorab`, 'Idempotenz-Schlüssel <termin>-<art>')
  const b = mail.body as { from: string; to: string[]; subject: string; html: string; text: string }
  assert.equal(b.from, 'Salon <agenda@salon.example>')
  assert.deepEqual(b.to, ['chef@test.example', 'ludwig@test.example'])
  assert.match(b.subject, /^Agenda fürs Teammeeting am Mo\., 26\.10\.2026/)
  assert.ok(b.html.includes('plattform.example/app/leitung/agenda?monat=2026-09'))
  const abschluss = w.aufrufe.filter((a) => a.url.endsWith('versand_abschliessen')).pop()!.body as Record<string, unknown>
  assert.deepEqual(abschluss, { p_termin: T, p_art: 'vorab', p_ok: true, p_fehler: null })
  // Schlüssel: nur der Service-Schlüssel an die Datenbank, nie an Resend
  for (const a of w.aufrufe.filter((x) => x.url.includes('/rpc/'))) {
    assert.equal(a.kopf.apikey, 'service-key')
    assert.equal(a.kopf.authorization, 'Bearer service-key')
  }
  assert.ok(!JSON.stringify(mail).includes('service-key'), 'der Service-Schlüssel gelangt nie zu Resend')
})

test('Versand: Mail enthält weder Namen noch Kommentare (nur das, was die Datenbank liefert)', async () => {
  const w = welt()
  await behandleAnfrage(anfrage(), ENV, w.fetchFn)
  const b = (w.aufrufe.find((a) => a.url === 'https://api.resend.com/emails')!.body as { html: string; text: string })
  for (const verboten of ['Beispiel aus den Kommentaren', 'Kommentar']) {
    assert.ok(!b.html.includes(verboten) && !b.text.includes(verboten), verboten)
  }
})

test('Mehrere Fälligkeiten: jede Mail einzeln, „erinnerung“ mit dem eigenen Schlüssel', async () => {
  const w = welt({
    faellig: [
      { termin_id: T, art: 'vorab', startet_am: 'x', titel: 't', faellig_ab: 'x', versuche: 0 },
      { termin_id: T, art: 'erinnerung', startet_am: 'x', titel: 't', faellig_ab: 'x', versuche: 0 },
    ],
  })
  const j = (await (await behandleAnfrage(anfrage(), ENV, w.fetchFn)).json()) as { ergebnisse: { art: string; status: string }[] }
  assert.deepEqual(j.ergebnisse.map((e) => `${e.art}:${e.status}`), ['vorab:gesendet', 'erinnerung:gesendet'])
  assert.deepEqual(w.aufrufe.filter((a) => a.url === 'https://api.resend.com/emails').map((a) => a.kopf['idempotency-key']), [`${T}-vorab`, `${T}-erinnerung`])
  const erinnerung = w.aufrufe.filter((a) => a.url === 'https://api.resend.com/emails')[1].body as { subject: string }
  assert.match(erinnerung.subject, /^Erinnerung: Teammeeting/)
})

test('Wird nicht beansprucht (ein anderer Lauf sendet): keine Mail, kein Abschluss', async () => {
  const w = welt({ claim: () => null })
  const j = (await (await behandleAnfrage(anfrage(), ENV, w.fetchFn)).json()) as { ergebnisse: { status: string }[] }
  assert.deepEqual(j.ergebnisse.map((e) => e.status), ['uebersprungen'])
  assert.equal(w.mails(), 0)
  assert.deepEqual(w.rpcNamen(), ['versand_faellig', 'versand_beanspruchen'])
})

test('Resend-Fehler: im Protokoll als Fehler (höchstens 500 Zeichen), die Antwort bleibt 200', async () => {
  const w = welt({ resend: () => ({ status: 422, body: { message: 'x'.repeat(900) } }) })
  const r = await behandleAnfrage(anfrage(), ENV, w.fetchFn)
  assert.equal(r.status, 200)
  const j = (await r.json()) as { ergebnisse: { status: string; fehler?: string }[] }
  assert.equal(j.ergebnisse[0].status, 'fehler')
  const ab = w.aufrufe.filter((a) => a.url.endsWith('versand_abschliessen')).pop()!.body as { p_ok: boolean; p_fehler: string }
  assert.equal(ab.p_ok, false)
  assert.match(ab.p_fehler, /^Resend 422: x+/)
  assert.ok(ab.p_fehler.length <= 500)
})

test('Netzfehler zu Resend und Fehler beim Lesen des Inhalts werden abgeschlossen, nie verschluckt', async () => {
  const netz = welt({ resend: () => new Error('Netz weg') })
  await behandleAnfrage(anfrage(), ENV, netz.fetchFn)
  assert.deepEqual(netz.aufrufe.filter((a) => a.url.endsWith('versand_abschliessen')).pop()!.body, { p_termin: T, p_art: 'vorab', p_ok: false, p_fehler: 'Netz weg' })

  const inhaltFehler = welt({ rpcFehler: { agenda_fuer_versand: 500 } })
  await behandleAnfrage(anfrage(), ENV, inhaltFehler.fetchFn)
  assert.equal(inhaltFehler.mails(), 0)
  assert.deepEqual(inhaltFehler.aufrufe.filter((a) => a.url.endsWith('versand_abschliessen')).pop()!.body, { p_termin: T, p_art: 'vorab', p_ok: false, p_fehler: 'Fehler in agenda_fuer_versand' })
})

test('Keine Empfänger: Fehler im Protokoll, keine Mail', async () => {
  const w = welt({ inhalt: () => ({ ...DATEN, empfaenger: [] }) })
  await behandleAnfrage(anfrage(), ENV, w.fetchFn)
  assert.equal(w.mails(), 0)
  assert.deepEqual(w.aufrufe.filter((a) => a.url.endsWith('versand_abschliessen')).pop()!.body, { p_termin: T, p_art: 'vorab', p_ok: false, p_fehler: 'Keine Empfänger mit E-Mail-Adresse.' })
})

test('Datenbankfehler bei der Fälligkeit: 500 ohne Details', async () => {
  const w = welt({ rpcFehler: { versand_faellig: 500 } })
  const r = await behandleAnfrage(anfrage(), ENV, w.fetchFn)
  assert.equal(r.status, 500)
  assert.deepEqual(await r.json(), { ok: false, fehler: 'Die Fälligkeit konnte nicht gelesen werden.' })
  assert.equal(w.mails(), 0)
})

test('Nichts fällig: 200 mit leerer Liste, kein Netzaufruf außer der Fälligkeit', async () => {
  const w = welt({ faellig: [] })
  const j = (await (await behandleAnfrage(anfrage(), ENV, w.fetchFn)).json()) as { ok: boolean; ergebnisse: unknown[] }
  assert.deepEqual([j.ok, j.ergebnisse.length], [true, 0])
  assert.deepEqual(w.rpcNamen(), ['versand_faellig'])
})

test('Ohne Body läuft der normale Versand; „trocken“ nur bei genau true', async () => {
  const w = welt({ faellig: [] })
  const ohneBody = new Request('https://f.example/', { method: 'POST', headers: { 'x-cron-secret': ENV.CRON_SECRET } })
  assert.equal(((await (await behandleAnfrage(ohneBody, ENV, w.fetchFn)).json()) as { trocken: boolean }).trocken, false)
  assert.equal(((await (await behandleAnfrage(anfrage({ trocken: 'ja' }), ENV, w.fetchFn)).json()) as { trocken: boolean }).trocken, false)
})
