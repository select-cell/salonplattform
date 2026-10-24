// Erzeugt n8n/anfragen-workflow.json (zum Importieren in n8n) aus dem getesteten Code-Node.
// Aufruf: node n8n/workflow-bauen.mjs
// Der Code-Node steht nur an einer Stelle (anfrage-entscheiden.cjs); die JSON wird daraus gebaut,
// und ein Test prüft, dass die eingecheckte JSON dazu passt.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HIER = (datei) => fileURLToPath(new URL(datei, import.meta.url))

export const WEBHOOK_PFAD = 'salondawiidbestellungen'
export const CHAT_ID_PLATZHALTER = 'HIER_CHAT_ID_DER_ANFRAGEN_GRUPPE'

// Fest vergebene IDs, damit die JSON bei jedem Bauen identisch ist (sauberes Diff im Repo)
const ID = (n) => `5a10d0a0-0000-4000-8000-${String(n).padStart(12, '0')}`

export function baueWorkflow(codeEntscheiden) {
  // Abfragen: bei Ausfall weiterlaufen (Notkarte), auch bei leerem Ergebnis ein Item liefern,
  // und nur einmal ausführen (sonst läuft jede Abfrage je Zeile der vorherigen)
  const abfrage = (name, position, tabelle, filter) => ({
    id: ID(position[0]),
    name,
    type: 'n8n-nodes-base.supabase',
    typeVersion: 1,
    position,
    parameters: {
      operation: 'getAll',
      tableId: tabelle,
      returnAll: true,
      filterType: 'string',
      // In der JSON beginnt jeder Ausdruck mit „=“, sonst schickt n8n den Text wörtlich an Supabase
      filterString: filter.includes('{{') ? `=${filter}` : filter,
    },
    executeOnce: true,
    alwaysOutputData: true,
    onError: 'continueRegularOutput',
  })

  const webhookBody = "$('Webhook').first().json.body"
  const nodes = [
    {
      id: ID(1),
      name: 'Anleitung',
      type: 'n8n-nodes-base.stickyNote',
      typeVersion: 1,
      position: [-60, 80],
      parameters: {
        width: 460,
        height: 520,
        color: 4,
        content:
          '## Vor dem Veröffentlichen\n\n' +
          '1. **Credential „Supabase API“** anlegen: Host `https://hgtvlcucxzksvmvgvbgo.supabase.co`, Secret Key = der Service-Key (am besten ein eigener Secret-Key nur für n8n). In **allen 6 Supabase-Nodes** dieses Credential auswählen.\n' +
          '2. **Credential „Telegram API“** anlegen (Token vom @BotFather) und im Node *Telegram senden* auswählen.\n' +
          `3. Im Node *Telegram senden* die **Chat-ID** der Anfragen-Gruppe eintragen (statt \`${CHAT_ID_PLATZHALTER}\`). Negative Zahl, bei Supergruppen \`-100…\`.\n` +
          '4. Workflow **speichern und veröffentlichen (Publish)**. Erst dann gilt die Produktions-URL `/webhook/…`.\n' +
          '5. Unter *Settings* den **Error Workflow** wählen (siehe n8n/README.md).\n\n' +
          'Später im Node *Webhook* unter *Allowed Origins* statt `*` die Domain der Seite eintragen.',
      },
    },
    {
      id: ID(2),
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [460, 300],
      webhookId: ID(2),
      parameters: {
        httpMethod: 'POST',
        path: WEBHOOK_PFAD,
        responseMode: 'responseNode',
        options: { allowedOrigins: '*' },
      },
    },
    abfrage('Plaetze laden', [680, 300], 'plaetze', 'aktiv=eq.true'),
    abfrage('Artikel laden', [900, 300], 'artikel', 'aktiv=eq.true&order=sortierung.asc'),
    abfrage(
      'Letzte Anfrage am Platz',
      [1120, 300],
      'anfragen',
      `platz=eq.{{ Number(${webhookBody}.platz) || 0 }}&order=erstellt_am.desc&limit=1`,
    ),
    abfrage(
      'Doppelte Anfrage pruefen',
      [1340, 300],
      'anfragen',
      `id=eq.{{ /^[0-9a-f-]{36}$/i.test(String(${webhookBody}.anfrage_id)) ? ${webhookBody}.anfrage_id : '00000000-0000-0000-0000-000000000000' }}`,
    ),
    {
      id: ID(8),
      name: 'Entscheiden',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1560, 300],
      parameters: { jsCode: codeEntscheiden },
    },
    {
      id: ID(9),
      name: 'Senden?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [1780, 300],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [
            {
              id: ID(90),
              leftValue: '={{ $json.senden }}',
              rightValue: '',
              operator: { type: 'boolean', operation: 'true', singleValue: true },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
    },
    // Oberer Zweig: Telegram zuerst (Execution Order v1 arbeitet oben vor unten ab)
    {
      id: ID(10),
      name: 'Telegram senden',
      type: 'n8n-nodes-base.telegram',
      typeVersion: 1.2,
      position: [2020, 140],
      parameters: {
        resource: 'message',
        operation: 'sendMessage',
        chatId: CHAT_ID_PLATZHALTER,
        text: '={{ $json.text }}',
        additionalFields: { appendAttribution: false },
      },
    },
    {
      id: ID(11),
      name: 'Antwort ok',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [2240, 140],
      parameters: {
        respondWith: 'json',
        responseBody: "={{ JSON.stringify($('Entscheiden').first().json.antwort) }}",
        options: { responseCode: 200 },
      },
    },
    // Unterer Zweig: Speichern. Fehler laufen weiter, damit ein Supabase-Ausfall nie die Nachricht stoppt.
    {
      id: ID(12),
      name: 'Anfrage speichern',
      type: 'n8n-nodes-base.supabase',
      typeVersion: 1,
      position: [2020, 460],
      parameters: {
        operation: 'create',
        tableId: 'anfragen',
        dataToSend: 'defineBelow',
        fieldsUi: {
          fieldValues: [
            { fieldId: 'id', fieldValue: "={{ $('Entscheiden').first().json.speichern.anfrage.id }}" },
            { fieldId: 'platz', fieldValue: "={{ $('Entscheiden').first().json.speichern.anfrage.platz }}" },
            { fieldId: 'typ', fieldValue: "={{ $('Entscheiden').first().json.speichern.anfrage.typ }}" },
          ],
        },
      },
      onError: 'continueRegularOutput',
    },
    {
      id: ID(13),
      name: 'Positionen vorbereiten',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2240, 460],
      parameters: {
        jsCode: "return $('Entscheiden').first().json.speichern.positionen.map((json) => ({ json }))",
      },
    },
    {
      id: ID(14),
      name: 'Positionen speichern',
      type: 'n8n-nodes-base.supabase',
      typeVersion: 1,
      position: [2460, 460],
      parameters: {
        operation: 'create',
        tableId: 'anfrage_positionen',
        dataToSend: 'defineBelow',
        fieldsUi: {
          fieldValues: [
            { fieldId: 'anfrage_id', fieldValue: '={{ $json.anfrage_id }}' },
            { fieldId: 'artikel_id', fieldValue: '={{ $json.artikel_id }}' },
            { fieldId: 'menge', fieldValue: '={{ $json.menge }}' },
          ],
        },
      },
      onError: 'continueRegularOutput',
    },
    {
      id: ID(15),
      name: 'Speicherfehler melden',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2680, 460],
      parameters: {
        // Continue On Fail löst den Fehler-Workflow nie aus. Hier wird aus dem stillen Fehler ein echter,
        // nachdem die Telegram-Nachricht schon raus ist.
        jsCode:
          "const fehler = [...$('Anfrage speichern').all(), ...$('Positionen speichern').all()].filter((i) => i.json.error)\n" +
          'if (fehler.length) {\n' +
          '  const e = fehler[0].json.error\n' +
          "  throw new Error('Speichern in Supabase fehlgeschlagen: ' + (typeof e === 'string' ? e : (e.message ?? JSON.stringify(e))))\n" +
          '}\n' +
          'return [{ json: { gespeichert: true } }]',
      },
    },
    // Sperre, Doppelung, ungültige Anfrage
    {
      id: ID(16),
      name: 'Antwort',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [2020, 700],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify($json.antwort) }}',
        options: { responseCode: '={{ $json.status }}' },
      },
    },
  ]

  const zu = (name) => ({ node: name, type: 'main', index: 0 })
  const connections = {
    Webhook: { main: [[zu('Plaetze laden')]] },
    'Plaetze laden': { main: [[zu('Artikel laden')]] },
    'Artikel laden': { main: [[zu('Letzte Anfrage am Platz')]] },
    'Letzte Anfrage am Platz': { main: [[zu('Doppelte Anfrage pruefen')]] },
    'Doppelte Anfrage pruefen': { main: [[zu('Entscheiden')]] },
    Entscheiden: { main: [[zu('Senden?')]] },
    'Senden?': { main: [[zu('Telegram senden'), zu('Anfrage speichern')], [zu('Antwort')]] },
    'Telegram senden': { main: [[zu('Antwort ok')]] },
    'Anfrage speichern': { main: [[zu('Positionen vorbereiten')]] },
    'Positionen vorbereiten': { main: [[zu('Positionen speichern')]] },
    'Positionen speichern': { main: [[zu('Speicherfehler melden')]] },
  }

  return {
    name: 'Salon Dawiid · Anfragen',
    nodes,
    connections,
    active: false,
    settings: { executionOrder: 'v1' },
    pinData: {},
  }
}

export function schreibeWorkflow() {
  const code = readFileSync(HIER('./anfrage-entscheiden.cjs'), 'utf8')
  return `${JSON.stringify(baueWorkflow(code), null, 2)}\n`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(HIER('./anfragen-workflow.json'), schreibeWorkflow())
  console.log('n8n/anfragen-workflow.json geschrieben')
}
