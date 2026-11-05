// Logik der Edge Function `agenda-versand` (Erweiterung F): reines TypeScript ohne Deno-Bezug, damit sie sich mit
// Node testen lässt (versand.test.ts). index.ts verdrahtet sie nur mit Deno.serve.
//
// Die Datenbank entscheidet, nicht der Kalender: Sie sagt, welche Mail jetzt fällig ist (`versand_faellig`), wer
// senden darf (`versand_beanspruchen`), was in der Mail steht (`agenda_fuer_versand`) und hält das Ergebnis fest
// (`versand_abschliessen`). Diese Function ist nur der Bote.
//
// verify_jwt ist AUS, weil der Zeitplan keinen JWT hat. Stattdessen prüft die Function den Header `x-cron-secret`
// in gleicher Zeit. Fehlt ein Secret, antwortet sie 503 und fasst die Datenbank nicht an: Eine fehlende Einrichtung
// verbraucht keinen der drei Versuche.

export interface Konfig {
  cronSecret: string
  resendKey: string
  absender: string
  plattformUrl: string
  supabaseUrl: string
  serviceKey: string
}

/** Namen der Secrets, die fehlen (für die Antwort 503). */
export function fehlendeSecrets(env: Record<string, string | undefined>): string[] {
  const noetig = ['CRON_SECRET', 'RESEND_API_KEY', 'MAIL_ABSENDER', 'PLATTFORM_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  return noetig.filter((n) => !(env[n] ?? '').trim())
}

export function konfigAusUmgebung(env: Record<string, string | undefined>): Konfig {
  return {
    cronSecret: (env.CRON_SECRET ?? '').trim(),
    resendKey: (env.RESEND_API_KEY ?? '').trim(),
    absender: (env.MAIL_ABSENDER ?? '').trim(),
    plattformUrl: (env.PLATTFORM_URL ?? '').trim().replace(/\/+$/, ''),
    supabaseUrl: (env.SUPABASE_URL ?? '').trim().replace(/\/+$/, ''),
    serviceKey: (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
  }
}

/** Vergleich in gleicher Zeit (gegen Zeitangriffe): beide Werte werden gehasht und Byte für Byte ohne Abbruch verglichen. */
export async function gleichInGleicherZeit(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  const x = new Uint8Array(ha)
  const y = new Uint8Array(hb)
  let diff = x.length ^ y.length
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ (y[i] ?? 0)
  return diff === 0
}

// ---- Mail --------------------------------------------------------------------------------------------------

export interface AgendaPunkt {
  text: string
}
export interface AgendaBlock {
  id?: string
  titel: string
  minuten: number
  punkte: AgendaPunkt[]
}
export interface VersandDaten {
  salon: string
  termin: { id: string; titel: string; startet_lokal: string }
  monat: string
  status: 'entwurf' | 'freigegeben' | null
  agenda: { bloecke: AgendaBlock[]; unvollstaendig?: boolean; hinweise?: string[] } | null
  hinweis: string | null
  empfaenger: string[]
}

export type Art = 'vorab' | 'erinnerung'

/** Alle Inhalte werden maskiert: Texte stammen aus Daten und der Leitung, nie ungeprüft in HTML. */
export function esc(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Feste Farben: Mailprogramme kennen keine Design-Tokens und keinen Nachtmodus der Plattform.
const FARBE = { hintergrund: '#faf8f3', karte: '#ffffff', text: '#1a1208', text2: '#6b5b45', linie: '#e8e0d0', akzent: '#a86840', warn: '#854f0b', warnHg: '#faeeda' }

/** „2026-10-26T10:00“ (Ortszeit) → „Mo., 26.10.2026 um 10:00 Uhr“. Rechnet nur mit der Wanduhrzeit, nie mit der Zeitzone des Servers. */
export function terminText(startetLokal: string): { datum: string; uhr: string; lang: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(startetLokal)
  if (!m) return { datum: startetLokal, uhr: '', lang: startetLokal }
  const [, j, mo, t, h, mi] = m
  const wochentag = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(+j, +mo - 1, +t)))
  const datum = `${wochentag} ${t}.${mo}.${j}`.replace(/^(\S+?)\.? /, '$1., ')
  const uhr = `${h}:${mi}`
  return { datum, uhr, lang: `${datum} um ${uhr} Uhr` }
}

export function agendaLink(plattformUrl: string, monat: string): string {
  return `${plattformUrl.replace(/\/+$/, '')}/app/leitung/agenda?monat=${encodeURIComponent(monat)}`
}

/** Die drei wichtigsten Punkte für die kurze Erinnerung: zuerst der Fokus-Block, dann die Entwicklungsfelder. */
export function wichtigstePunkte(agenda: VersandDaten['agenda'], n = 3): string[] {
  if (!agenda) return []
  const reihenfolge = ['fokus', 'entwicklung', 'kennzahlen']
  const sortiert = [...agenda.bloecke].sort((a, b) => {
    const x = reihenfolge.indexOf(a.id ?? '')
    const y = reihenfolge.indexOf(b.id ?? '')
    return (x < 0 ? 99 : x) - (y < 0 ? 99 : y)
  })
  return sortiert.flatMap((b) => b.punkte.map((p) => p.text)).slice(0, n)
}

export interface Mail {
  betreff: string
  html: string
  text: string
}

function huelle(inhalt: string, vorschau: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${FARBE.hintergrund};font-family:Arial,Helvetica,sans-serif;color:${FARBE.text};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(vorschau)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FARBE.hintergrund};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${FARBE.karte};border:1px solid ${FARBE.linie};border-radius:12px;"><tr><td style="padding:24px;font-size:15px;line-height:1.5;">
${inhalt}
</td></tr></table>
</td></tr></table></body></html>`
}

function knopf(url: string): string {
  return `<p style="margin:20px 0 0;"><a href="${esc(url)}" style="display:inline-block;background:${FARBE.akzent};color:#ffffff;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:8px;">Agenda auf der Plattform öffnen</a></p>
<p style="margin:12px 0 0;font-size:12px;color:${FARBE.text2};">Falls der Knopf nicht geht: ${esc(url)}</p>`
}

/** Baut die Mail. art „vorab“: alle Blöcke mit Minuten. art „erinnerung“: die drei wichtigsten Punkte. */
export function baueMail(art: Art, d: VersandDaten, plattformUrl: string): Mail {
  const t = terminText(d.termin.startet_lokal)
  const link = agendaLink(plattformUrl, d.monat)
  const stand = d.status === 'freigegeben' ? 'Stand: freigegeben' : 'Stand: Entwurf'
  const betreff = art === 'vorab' ? `Agenda fürs Teammeeting am ${t.lang}` : `Erinnerung: Teammeeting am ${t.lang}`

  const kopf = `<p style="margin:0 0 4px;font-size:12px;color:${FARBE.text2};text-transform:uppercase;letter-spacing:.06em;">${esc(d.salon)}</p>
<h1 style="margin:0 0 6px;font-size:22px;">${esc(d.termin.titel)}</h1>
<p style="margin:0 0 16px;color:${FARBE.text2};">${esc(t.lang)}</p>`

  const textZeilen: string[] = [`${d.termin.titel}`, t.lang, '']
  let teile = kopf

  if (!d.agenda) {
    const hinweis = d.hinweis ?? 'Es gibt noch keine Agenda.'
    teile += `<p style="margin:0 0 8px;">${esc(hinweis)}</p>`
    textZeilen.push(hinweis)
  } else {
    teile += `<p style="margin:0 0 12px;font-weight:bold;">${esc(stand)}</p>`
    textZeilen.push(stand, '')
    if (d.agenda.unvollstaendig) {
      const gruende = (d.agenda.hinweise ?? []).join(' ')
      teile += `<p style="margin:0 0 16px;padding:10px 12px;background:${FARBE.warnHg};color:${FARBE.warn};border-radius:8px;"><strong>Stand unvollständig:</strong> ${esc(gruende)}</p>`
      textZeilen.push(`Stand unvollständig: ${gruende}`, '')
    }
    if (art === 'vorab') {
      for (const b of d.agenda.bloecke) {
        teile += `<h2 style="margin:18px 0 6px;font-size:16px;">${esc(b.titel)} <span style="font-weight:normal;color:${FARBE.text2};">(${esc(b.minuten)} Min.)</span></h2>`
        textZeilen.push(`${b.titel} (${b.minuten} Min.)`)
        if (b.punkte.length) {
          teile += `<ul style="margin:0;padding-left:20px;">${b.punkte.map((p) => `<li style="margin:0 0 4px;">${esc(p.text)}</li>`).join('')}</ul>`
          for (const p of b.punkte) textZeilen.push(`- ${p.text}`)
        }
        textZeilen.push('')
      }
    } else {
      const punkte = wichtigstePunkte(d.agenda)
      teile += `<h2 style="margin:0 0 6px;font-size:16px;">Die wichtigsten Punkte</h2><ol style="margin:0;padding-left:20px;">${punkte.map((p) => `<li style="margin:0 0 4px;">${esc(p)}</li>`).join('')}</ol>`
      textZeilen.push('Die wichtigsten Punkte')
      punkte.forEach((p, i) => textZeilen.push(`${i + 1}. ${p}`))
      textZeilen.push('')
    }
  }

  teile += knopf(link)
  textZeilen.push(`Agenda auf der Plattform: ${link}`)
  return { betreff, html: huelle(teile, betreff), text: textZeilen.join('\n') }
}

// ---- Ablauf ---------------------------------------------------------------------------------------------------

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

export interface Ergebnis {
  termin_id: string
  art: Art
  status: 'gesendet' | 'fehler' | 'uebersprungen'
  versuche?: number
  fehler?: string
}

function antwort(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
}

const kurzFehler = (e: unknown, standard = 'Unbekannter Fehler') => (e instanceof Error && e.message ? e.message : standard).slice(0, 500)

/** Eine Anfrage an die Function (vom Zeitplan oder von Hand, siehe Probelauf in docs/agenda-termine.md). */
export async function behandleAnfrage(req: Request, env: Record<string, string | undefined>, fetchFn: FetchFn): Promise<Response> {
  if (req.method !== 'POST') return antwort(405, { ok: false, fehler: 'Nur POST ist erlaubt.' })

  // 1. Ohne CRON_SECRET lässt sich niemand prüfen: 503, die Datenbank bleibt unberührt
  if (!(env.CRON_SECRET ?? '').trim()) {
    return antwort(503, { ok: false, fehler: 'Der Versand ist noch nicht eingerichtet.', fehlend: ['CRON_SECRET'] })
  }
  // 2. Geheimnis im Header, Vergleich in gleicher Zeit
  const gesendet = req.headers.get('x-cron-secret') ?? ''
  if (!(await gleichInGleicherZeit(gesendet, (env.CRON_SECRET ?? '').trim()))) {
    return antwort(401, { ok: false, fehler: 'Nicht erlaubt.' })
  }
  // 3. Fehlende Einrichtung: 503 mit der Liste, BEVOR die Datenbank berührt wird (verbraucht keinen Versuch)
  const fehlend = fehlendeSecrets(env)
  if (fehlend.length > 0) {
    return antwort(503, { ok: false, fehler: 'Der Versand ist noch nicht eingerichtet.', fehlend })
  }
  const k = konfigAusUmgebung(env)

  let trocken = false
  try {
    const body = (await req.json()) as { trocken?: unknown } | null
    trocken = body?.trocken === true
  } catch {
    // ohne Body: normaler Lauf
  }

  const rpc = async (name: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; data: unknown; fehler?: string }> => {
    try {
      const r = await fetchFn(`${k.supabaseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { apikey: k.serviceKey, authorization: `Bearer ${k.serviceKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(args),
      })
      const data = await r.json().catch(() => null)
      if (!r.ok) return { ok: false, data: null, fehler: (data as { message?: string } | null)?.message ?? `Datenbank antwortet ${r.status}` }
      return { ok: true, data }
    } catch {
      return { ok: false, data: null, fehler: 'Die Datenbank ist nicht erreichbar.' }
    }
  }

  const faellig = await rpc('versand_faellig')
  if (!faellig.ok) return antwort(500, { ok: false, fehler: 'Die Fälligkeit konnte nicht gelesen werden.' })
  const liste = (faellig.data as { termin_id: string; art: Art; startet_am: string; titel: string; faellig_ab: string; versuche: number }[]) ?? []
  if (trocken) return antwort(200, { ok: true, trocken: true, faellig: liste })

  const ergebnisse: Ergebnis[] = []
  for (const f of liste) {
    const e: Ergebnis = { termin_id: f.termin_id, art: f.art, status: 'uebersprungen' }
    const claim = await rpc('versand_beanspruchen', { p_termin: f.termin_id, p_art: f.art })
    if (!claim.ok || typeof claim.data !== 'number') {
      ergebnisse.push(e) // ein anderer Lauf sendet (oder es ist nicht mehr fällig)
      continue
    }
    e.versuche = claim.data

    let ok = false
    let fehler: string | undefined
    try {
      const inhalt = await rpc('agenda_fuer_versand', { p_termin: f.termin_id })
      if (!inhalt.ok) throw new Error(inhalt.fehler ?? 'Der Inhalt der Mail konnte nicht gelesen werden.')
      const daten = inhalt.data as VersandDaten
      if (!daten.empfaenger || daten.empfaenger.length === 0) throw new Error('Keine Empfänger mit E-Mail-Adresse.')
      const mail = baueMail(f.art, daten, k.plattformUrl)

      const r = await fetchFn('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${k.resendKey}`,
          'content-type': 'application/json',
          'idempotency-key': `${f.termin_id}-${f.art}`,
        },
        body: JSON.stringify({ from: k.absender, to: daten.empfaenger, subject: mail.betreff, html: mail.html, text: mail.text }),
      })
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { message?: string } | null
        throw new Error(`Resend ${r.status}${j?.message ? `: ${j.message}` : ''}`)
      }
      ok = true
    } catch (err) {
      fehler = kurzFehler(err)
    }

    const abschluss = await rpc('versand_abschliessen', { p_termin: f.termin_id, p_art: f.art, p_ok: ok, p_fehler: fehler ?? null })
    if (!abschluss.ok && ok) {
      // Die Mail ist raus, das Protokoll nicht: nächster Lauf übernimmt über den Idempotenz-Schlüssel, kein Doppelversand
      fehler = 'Gesendet, aber das Protokoll konnte nicht geschrieben werden.'
    }
    e.status = ok ? 'gesendet' : 'fehler'
    if (fehler && !ok) e.fehler = fehler
    ergebnisse.push(e)
  }
  return antwort(200, { ok: true, trocken: false, ergebnisse })
}
