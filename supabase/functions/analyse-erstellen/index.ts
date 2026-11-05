// Edge Function `analyse-erstellen` (Erweiterung E). verify_jwt: AN. Kein service_role-Schlüssel:
// die Function ruft die Datenbank-Funktionen mit der Anmeldung der Leitung auf.
//
// Der n8n-Webhook steht fest im Code (STANDARD_WEBHOOK_URL in analyse.ts): ohne weitere Einstellung gehen alle KI-Aufgaben dorthin.
// Secrets (Supabase → Edge Functions → Secrets), alle optional:
//   AI_WEBHOOK_SECRET   das Geheimnis des Webhooks (gehört nicht in den Code)
//   AI_PROVIDER         "webhook" (Standard) oder "claude"
//   AI_WEBHOOK_URL      überschreibt die Adresse im Code (https)
//   ANTHROPIC_API_KEY   bei claude
//   ANTHROPIC_MODEL     bei claude (optional, sonst ein Standardmodell)
// SUPABASE_URL und SUPABASE_ANON_KEY setzt die Laufzeit selbst.
//
// Die Logik steht in analyse.ts (mit Tests in analyse.test.ts).
import { behandleAnfrage } from './analyse.ts'

Deno.serve((req: Request) => behandleAnfrage(req, Deno.env.toObject(), fetch))
