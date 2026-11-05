// Gemeinsame Hilfen für die Browser-Tests (Playwright mit dem vorinstallierten Chromium).
// Supabase wird nachgebaut: Die Seite spricht nur mit diesem Mock, nie mit einer echten Datenbank.
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { preview } from 'vite'

export const PORT = 4173
export const BASE = `http://localhost:${PORT}`
const SUPABASE = 'https://testref.supabase.co'
const N8N = 'https://tobitest2008.app.n8n.cloud'
const STORAGE_KEY = 'sb-testref-auth-token'
const ZIEL = 'out/test-dist'

export function chromiumPfad() {
  const wurzel = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  for (const ordner of readdirSync(wurzel).filter((n) => /^chromium-\d+/.test(n))) {
    for (const unter of readdirSync(`${wurzel}/${ordner}`)) {
      const pfad = `${wurzel}/${ordner}/${unter}/chrome`
      if (existsSync(pfad)) return pfad
    }
  }
  throw new Error('Kein Chromium gefunden')
}

/** Baut die Seite mit Test-Adresse und startet einen Vorschau-Server. */
export async function starteServer() {
  execFileSync('npx', ['vite', 'build', '--outDir', ZIEL, '--emptyOutDir', '--logLevel', 'error'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_SUPABASE_URL: SUPABASE, VITE_SUPABASE_ANON_KEY: 'test' },
  })
  const server = await preview({ preview: { port: PORT, strictPort: true, host: '127.0.0.1' }, build: { outDir: ZIEL } })
  return { stop: () => new Promise((ok) => server.httpServer.close(ok)) }
}

export async function starteBrowser() {
  return chromium.launch({ executablePath: chromiumPfad(), args: ['--no-sandbox'] })
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (p) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(p)}.sig`
export const NUTZER = { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'x@test.example', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' }
export const sitzung = () => {
  const exp = Math.floor(Date.now() / 1000) + 3600
  return { access_token: jwt({ sub: NUTZER.id, role: 'authenticated', exp }), token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: NUTZER }
}

export const PERSONEN = {
  ma: { id: '11111111-0000-0000-0000-0000000000a1', name: 'Oksana Serafyn', email: 'oksana@test.example', rolle: 'mitarbeiter', salon_id: 's', salon_name: 'Dawiid', nimmt_an_teamumfrage: true, aktiv: true, aktiv_ab: null },
  chef: { id: '11111111-0000-0000-0000-0000000000a4', name: 'Dawid Chef', email: 'chef@test.example', rolle: 'verantwortlicher', salon_id: 's', salon_name: 'Dawiid', nimmt_an_teamumfrage: false, aktiv: true, aktiv_ab: null },
  admin: { id: '11111111-0000-0000-0000-0000000000a5', name: 'Admin Test', email: 'admin@test.example', rolle: 'admin', salon_id: null, salon_name: null, nimmt_an_teamumfrage: false, aktiv: true, aktiv_ab: null },
}

/**
 * Öffnet eine Seite mit nachgebautem Supabase.
 * antworten: { rpcName: Wert | (body, aufruf) => Wert | { status, body } }, aufrufe: Liste der RPC-Aufrufe (Name, Body).
 */
export async function neueSeite(browser, { rolle = 'chef', viewport = { width: 1280, height: 900 }, antworten = {}, angemeldet = true, colorScheme = 'light', clock = false, kiWeg = 'edge', webhook = null } = {}) {
  const context = await browser.newContext({ viewport, locale: 'de-DE', timezoneId: 'Europe/Berlin', colorScheme })
  const aufrufe = []
  // Die KI-Aufgaben gehen aus der Oberfläche direkt an den n8n-Webhook. Die älteren Tests prüfen den Weg über die Edge Function
  // (kiWeg = 'edge', Standard); phase-g prüft den direkten Weg (kiWeg = 'direkt').
  if (kiWeg === 'edge') await context.addInitScript(() => localStorage.setItem('dawiid-ki-weg', 'edge'))
  // Der n8n-Webhook: ohne `webhook` nicht erreichbar (der Browser blockiert, z. B. wegen CORS); sonst antwortet die Funktion.
  await context.route(`${N8N}/**`, async (route) => {
    if (!webhook) return route.abort('failed')
    const req = route.request()
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS' }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    let body = {}
    try { body = req.postDataJSON() ?? {} } catch { body = {} }
    aufrufe.push({ rpc: 'n8n', url: req.url(), body, kopf: req.headers() })
    const wert = await webhook(body, req.headers(), aufrufe)
    if (wert === 'netz') return route.abort('failed')
    return route.fulfill({ status: wert.status ?? 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(wert.body ?? wert) })
  })
  if (angemeldet) {
    await context.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v) }, [STORAGE_KEY, JSON.stringify(sitzung())])
  }
  await context.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request()
    const pfad = new URL(req.url()).pathname
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    // RPC-Aufrufe heißen wie die Funktion, Edge Functions „fn:<name>“
    const rpc = pfad.split('/rpc/')[1] ?? (pfad.includes('/functions/v1/') ? `fn:${pfad.split('/functions/v1/')[1]}` : undefined)
    if (rpc) {
      let body = {}
      try { body = req.postDataJSON() ?? {} } catch { body = {} }
      aufrufe.push({ rpc, body })
      if (rpc === 'ich' && !('ich' in antworten)) return json(200, [PERSONEN[rolle]])
      if (!(rpc in antworten)) return json(404, { code: 'PGRST202', message: `nicht gemockt: ${rpc}` })
      let wert = antworten[rpc]
      if (typeof wert === 'function') wert = await wert(body, aufrufe)
      if (wert && typeof wert === 'object' && 'status' in wert && 'body' in wert) return json(wert.status, wert.body)
      return json(200, wert)
    }
    if (pfad.endsWith('/auth/v1/user')) return json(200, NUTZER)
    if (pfad.endsWith('/auth/v1/token')) return json(200, sitzung())
    if (pfad.endsWith('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' })
    return json(404, { message: `nicht gemockt: ${pfad}` })
  })
  const page = await context.newPage()
  if (clock) await page.clock.install()
  const konsole = []
  page.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) konsole.push(`console: ${m.text()}`) })
  return { context, page, aufrufe, konsole }
}

/** Kleiner Prüfer: zählt bestandene und fehlgeschlagene Prüfungen. */
export function pruefer(titel) {
  let ok = 0, fail = 0
  console.log(`\n=== ${titel}`)
  return {
    abschnitt: (t) => console.log(`\n[${t}]`),
    check(bedingung, text) { if (bedingung) { ok++; console.log('  PASS', text) } else { fail++; console.log('  FAIL', text) } },
    ende() { console.log(`\n${ok} bestanden, ${fail} fehlgeschlagen`); return fail === 0 },
  }
}

export const wartePause = (ms) => new Promise((r) => setTimeout(r, ms))
