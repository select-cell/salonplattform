// Edge Function `agenda-versand` (Erweiterung F). verify_jwt: AUS, weil der Zeitplan (pg_cron) keinen JWT hat.
// Stattdessen prüft die Function den Header `x-cron-secret` in gleicher Zeit.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   CRON_SECRET      dasselbe Geheimnis wie im Zeitplan (supabase/versand_einrichten.sql)
//   RESEND_API_KEY   API-Schlüssel von Resend
//   MAIL_ABSENDER    z. B. „Salon <agenda@deine-domain.de>“, die Domain muss bei Resend bestätigt sein
//   PLATTFORM_URL    Adresse der Plattform für den Link in der Mail, z. B. https://dawiid.netlify.app
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase der Function selbst bereit. Der Schlüssel steht nie im
// Frontend, in der .env oder im Repo.
//
// Probelauf (zeigt, was fällig wäre, ohne etwas zu senden):
//   curl -X POST https://<REFERENZ>.supabase.co/functions/v1/agenda-versand \
//     -H "x-cron-secret: <CRON_SECRET>" -H "content-type: application/json" -d '{"trocken": true}'
//
// Die Logik steht in versand.ts (mit Tests in versand.test.ts).
import { behandleAnfrage } from './versand.ts'

Deno.serve((req: Request) => behandleAnfrage(req, Deno.env.toObject(), fetch))
