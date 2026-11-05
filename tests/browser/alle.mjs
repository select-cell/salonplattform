// Startet die Seite einmal und führt alle *.test.mjs nacheinander aus.
// Aufruf: node tests/browser/alle.mjs [muster]   (z. B. "phase-a")
import { readdirSync } from 'node:fs'
import { starteBrowser, starteServer } from './helfer.mjs'

const muster = process.argv[2] ?? ''
const dateien = readdirSync(new URL('./', import.meta.url)).filter((n) => n.endsWith('.test.mjs') && n.includes(muster)).sort()
const server = await starteServer()
const browser = await starteBrowser()
let alleOk = true
for (const datei of dateien) {
  const modul = await import(`./${datei}`)
  const ok = await modul.default(browser)
  alleOk &&= ok
}
await browser.close()
await server.stop()
console.log(alleOk ? '\nALLE BROWSER-TESTS BESTANDEN' : '\nEINIGE BROWSER-TESTS FEHLGESCHLAGEN')
process.exit(alleOk ? 0 : 1)
