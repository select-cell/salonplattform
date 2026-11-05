// Schreibt in n8n/testanfragen/*.json die Felder `prompt_version`, `system` und `nachricht` neu, damit sie zur Edge Function
// passen (supabase/functions/analyse-erstellen/analyse.ts). Die Daten (`eingabe`) und die Aufgabe bleiben unverändert.
// Aufruf nach jeder Änderung am Prompt:  node n8n/testanfragen-erzeugen.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import {
  AUFGABE_AGENDA, AUFGABE_EINZEL, AUFGABE_GESAMT, PROMPT_VERSION, PROMPT_VERSION_AGENDA, PROMPT_VERSION_GESAMT, SYSTEM_PROMPT,
  SYSTEM_PROMPT_AGENDA, SYSTEM_PROMPT_GESAMT, baueNachricht,
} from '../supabase/functions/analyse-erstellen/analyse.ts'

const AUFGABEN = {
  [AUFGABE_EINZEL]: { version: PROMPT_VERSION, system: SYSTEM_PROMPT },
  [AUFGABE_GESAMT]: { version: PROMPT_VERSION_GESAMT, system: SYSTEM_PROMPT_GESAMT },
  [AUFGABE_AGENDA]: { version: PROMPT_VERSION_AGENDA, system: SYSTEM_PROMPT_AGENDA },
}

const ordner = new URL('./testanfragen/', import.meta.url)
for (const datei of readdirSync(ordner).filter((d) => d.endsWith('.json'))) {
  const pfad = new URL(datei, ordner)
  const alt = JSON.parse(readFileSync(pfad, 'utf8'))
  const a = AUFGABEN[alt.aufgabe]
  if (!a) throw new Error(`${datei}: unbekannte Aufgabe ${alt.aufgabe}`)
  const neu = {
    aufgabe: alt.aufgabe,
    prompt_version: a.version,
    auftraege: alt.auftraege.map((x) => ({ ref: x.ref, system: a.system, nachricht: baueNachricht(x.eingabe), eingabe: x.eingabe })),
  }
  writeFileSync(pfad, JSON.stringify(neu, null, 2) + '\n')
  console.log('aktualisiert:', datei)
}
