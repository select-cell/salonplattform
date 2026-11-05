-- ============================================================================
-- Versand einrichten (Erweiterung F): Zeitplan für die Edge Function `agenda-versand`
--
-- Von HAND im SQL-Editor ausführen, NACHDEM
--   1. die Edge Function `agenda-versand` veröffentlicht ist (verify_jwt AUS),
--   2. die Secrets gesetzt sind (CRON_SECRET, RESEND_API_KEY, MAIL_ABSENDER, PLATTFORM_URL),
--   3. bei Resend die Absender-Domain bestätigt ist,
--   4. Termine unter Leitung → Termine eingetragen sind.
--
-- Das Skript ist KEINE nummerierte Migration: Es enthält ein Geheimnis. Trage unten GENAU zwei Werte ein
-- (die beiden Zeilen direkt hinter „declare“, sonst nichts ändern):
--   __CRON_SECRET__        dasselbe Geheimnis wie das Secret CRON_SECRET der Edge Function (mindestens 24 Zeichen)
--   __PROJEKT_REFERENZ__   Supabase → Project Settings → General → Reference ID (20 Kleinbuchstaben und Ziffern)
-- Mit einem Platzhalter oder einem ungültigen Wert bricht das Skript ab, bevor etwas geändert wird.
--
-- Was es tut: schaltet pg_cron und pg_net ein, legt Geheimnis und Projekt-Referenz im Vault ab (verschlüsselt, nicht
-- im Text des Zeitplans) und plant alle 15 Minuten einen Aufruf der Function ein. Die Datenbank entscheidet, was
-- fällig ist; ein Lauf ohne Fälligkeit tut nichts. Wiederholbar: ein zweiter Lauf ersetzt Geheimnis und Zeitplan.
--
-- Anhalten:   select cron.unschedule('agenda-versand');
-- Prüfen:     select * from cron.job where jobname = 'agenda-versand';
--             select * from cron.job_run_details order by start_time desc limit 5;
-- ============================================================================

do $$
declare
  v_secret text := '__CRON_SECRET__';
  v_ref    text := '__PROJEKT_REFERENZ__';
  v_id     uuid;
begin
  -- 1. prüfen, bevor etwas geändert wird
  if v_secret like '\_\_%' or v_ref like '\_\_%' then
    raise exception 'Bitte zuerst CRON_SECRET und PROJEKT_REFERENZ in den Zeilen hinter „declare“ eintragen.';
  end if;
  if char_length(v_secret) < 24 then
    raise exception 'Das CRON_SECRET ist zu kurz (mindestens 24 Zeichen).';
  end if;
  if v_ref !~ '^[a-z0-9]{20}$' then
    raise exception 'Die Projekt-Referenz sieht ungültig aus (20 Kleinbuchstaben und Ziffern erwartet).';
  end if;

  -- 2. Erweiterungen
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  execute 'create extension if not exists pg_net with schema extensions';

  -- 3. Geheimnis und Referenz im Vault
  select id into v_id from vault.secrets where name = 'agenda_versand_cron_secret';
  if v_id is null then
    perform vault.create_secret(v_secret, 'agenda_versand_cron_secret', 'Geheimnis für den Aufruf der Edge Function agenda-versand');
  else
    perform vault.update_secret(v_id, v_secret, 'agenda_versand_cron_secret', 'Geheimnis für den Aufruf der Edge Function agenda-versand');
  end if;
  v_id := null;
  select id into v_id from vault.secrets where name = 'agenda_versand_projekt';
  if v_id is null then
    perform vault.create_secret(v_ref, 'agenda_versand_projekt', 'Projekt-Referenz für den Aufruf der Edge Function agenda-versand');
  else
    perform vault.update_secret(v_id, v_ref, 'agenda_versand_projekt', 'Projekt-Referenz für den Aufruf der Edge Function agenda-versand');
  end if;

  -- 4. Alle 15 Minuten. cron.schedule mit gleichem Namen ersetzt den bestehenden Eintrag.
  perform cron.schedule(
    'agenda-versand',
    '*/15 * * * *',
    $job$
    select net.http_post(
      url     := 'https://' || (select decrypted_secret from vault.decrypted_secrets where name = 'agenda_versand_projekt')
                 || '.supabase.co/functions/v1/agenda-versand',
      headers := jsonb_build_object(
                   'content-type', 'application/json',
                   'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'agenda_versand_cron_secret')),
      body    := '{}'::jsonb,
      timeout_milliseconds := 20000)
    $job$);
end
$$;
