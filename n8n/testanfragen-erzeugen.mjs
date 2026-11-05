// Schreibt in n8n/testanfragen/*.json die Felder `prompt_version`, `system` und `nachricht` neu, damit sie zur Edge Function
// passen (supabase/functions/analyse-erstellen/analyse.ts). Die Daten (`eingabe`) bleiben unverändert.
// Aufruf nach jeder Änderung am Prompt:  node n8n/testanfragen-erzeugen.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { baueNachricht, PROMPT_VERSION, SYSTEM_PROMPT } from '../supabase/functions/analyse-erstellen/analyse.ts'

const ordner = new URL('./testanfragen/', import.meta.url)
for (const datei of readdirSync(ordner).filter((d) => d.endsWith('.json'))) {
  const pfad = new URL(datei, ordner)
  const alt = JSON.parse(readFileSync(pfad, 'utf8'))
  const neu = { prompt_version: PROMPT_VERSION, system: SYSTEM_PROMPT, nachricht: baueNachricht(alt.eingabe), eingabe: alt.eingabe }
  writeFileSync(pfad, JSON.stringify(neu, null, 2) + '\n')
  console.log('aktualisiert:', datei)
}
