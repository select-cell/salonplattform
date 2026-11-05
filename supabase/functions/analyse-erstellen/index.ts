// Edge Function `analyse-erstellen` (Erweiterung E). verify_jwt: AN. Kein service_role-Schlüssel:
// die Function ruft die Datenbank-Funktionen mit der Anmeldung der Leitung auf.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   AI_PROVIDER         "claude" oder "webhook"
//   ANTHROPIC_API_KEY   bei claude
//   ANTHROPIC_MODEL     bei claude (optional, sonst ein Standardmodell)
//   AI_WEBHOOK_URL      bei webhook (https)
//   AI_WEBHOOK_SECRET   bei webhook (optional)
// SUPABASE_URL und SUPABASE_ANON_KEY setzt die Laufzeit selbst.
//
// Die Logik steht in analyse.ts (mit Tests in analyse.test.ts).
import { behandleAnfrage } from './analyse.ts'

Deno.serve((req: Request) => behandleAnfrage(req, Deno.env.toObject(), fetch))
