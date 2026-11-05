-- pgTAP-Tests für Phase B: Zeiterfassung der Umfrage.
-- Ausführen: `supabase test db`
begin;
select plan(64);

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------
create function pg_temp.anmelden(p_uid text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end
$$;

create function pg_temp.mkey(p_versatz int) returns text
language sql as $$
  select to_char(date_trunc('month', now() at time zone 'Europe/Berlin') + make_interval(months => p_versatz), 'YYYY-MM')
$$;

-- Zeit einer Sitzung zurückdrehen (läuft als postgres, damit der Test „vergangene“ Zeit simulieren kann)
create function pg_temp.zeit_setzen(p_sitzung uuid, p_seit_start int, p_seit_herzschlag int) returns void
language plpgsql security definer as $$
begin
  update public.umfrage_sitzungen
     set gestartet_am = now() - make_interval(secs => p_seit_start),
         letzter_herzschlag_am = now() - make_interval(secs => p_seit_herzschlag)
   where id = p_sitzung;
end
$$;

-- Gültige Abgabe: Verhalten 1 und 2 für Anna, Berta, Cora. p_ent = Person der Entwicklung des Monats.
create function pg_temp.payload(p_monat text, p_ent uuid) returns jsonb
language sql as $$
  select jsonb_build_object(
    'monat', p_monat,
    'gestartet_am', (now() - interval '10 minutes')::text,
    'zeitpunkt', now()::text,
    'version', 'test',
    'bewertungen', (
      select jsonb_agg(jsonb_build_object('verhalten_nr', n, 'bewertete_person_id', pid, 'note', 3, 'kommentar', ''))
      from unnest(array[1, 2]) n
      cross join unnest(array['11111111-0000-0000-0000-00000000000a',
                              '11111111-0000-0000-0000-00000000000b',
                              '11111111-0000-0000-0000-00000000000c']::uuid[]) pid),
    'entwicklung', jsonb_build_object('person_id', p_ent, 'begruendung', 'Gute Entwicklung')
  )
$$;

-- ---------------------------------------------------------------------------
-- Testdaten (als postgres, alles wird am Ende zurückgerollt)
-- ---------------------------------------------------------------------------
insert into public.salons (id, name, start_monat) values
  ('cccccccc-0000-0000-0000-00000000000c', 'Zeitsalon U',
   (date_trunc('month', now() at time zone 'Europe/Berlin') - interval '2 months')::date),
  ('dddddddd-0000-0000-0000-00000000000d', 'Zeitsalon V',
   (date_trunc('month', now() at time zone 'Europe/Berlin') - interval '2 months')::date);

insert into public.verhalten (id, salon_id, nr, grundpfeiler, saeule, titel, aktiv) values
  ('20000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-00000000000c', 1, 'GP 1', 'Säule 1', 'Verhalten Eins', true),
  ('20000000-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-00000000000c', 2, 'GP 1', 'Säule 2', 'Verhalten Zwei', true);

insert into public.personen (id, salon_id, name, email, rolle, nimmt_an_teamumfrage, aktiv) values
  ('11111111-0000-0000-0000-00000000000a', 'cccccccc-0000-0000-0000-00000000000c', 'Anna Test',  'anna@test.example',  'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000b', 'cccccccc-0000-0000-0000-00000000000c', 'Berta Test', 'berta@test.example', 'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-00000000000c', 'Cora Test',  'cora@test.example',  'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-00000000000e', 'cccccccc-0000-0000-0000-00000000000c', 'Chef Test',  'chef@test.example',  'verantwortlicher', false, true),
  ('11111111-0000-0000-0000-00000000000f', 'dddddddd-0000-0000-0000-00000000000d', 'Xaver Test', 'xaver@test.example', 'mitarbeiter',      true,  true),
  ('11111111-0000-0000-0000-000000000010', 'dddddddd-0000-0000-0000-00000000000d', 'Chef Zwei',  'chef2@test.example', 'verantwortlicher', false, true);
insert into auth.users (id, email) values
  ('22222222-0000-0000-0000-00000000000a', 'anna@test.example'),
  ('22222222-0000-0000-0000-00000000000b', 'berta@test.example'),
  ('22222222-0000-0000-0000-00000000000c', 'cora@test.example'),
  ('22222222-0000-0000-0000-00000000000e', 'chef@test.example'),
  ('22222222-0000-0000-0000-00000000000f', 'xaver@test.example'),
  ('22222222-0000-0000-0000-000000000010', 'chef2@test.example');

-- ---------------------------------------------------------------------------
-- Anna: Sitzung beginnen, fortsetzen, Zeit buchen
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000a');
set local role authenticated;

create temp table start1 as select public.umfrage_starten((pg_temp.mkey(0) || '-01')::date) as j;
grant all on start1 to public;
select ok((select (j->>'sitzung') is not null from start1), 'Start: Sitzung wird angelegt');
select is((select (j->>'aktive_sek')::int from start1), 0, 'Start: aktive Zeit 0');
select is((select (j->>'wiederaufgenommen')::boolean from start1), false, 'Start: neue Sitzung ist nicht wiederaufgenommen');
select is((select j->'schritte' from start1), '{}'::jsonb, 'Start: noch keine Schrittzeiten');

-- Zweiter Aufruf (Neuladen, anderes Gerät): dieselbe Sitzung, als wiederaufgenommen gekennzeichnet
create temp table start2 as select public.umfrage_starten((pg_temp.mkey(0) || '-01')::date) as j;
grant all on start2 to public;
select is((select j->>'sitzung' from start2), (select j->>'sitzung' from start1), 'Neuladen: dieselbe Sitzung');
select is((select (j->>'wiederaufgenommen')::boolean from start2), true, 'Neuladen: „wiederaufgenommen“');

-- Sitzung 120 s alt, letzter Herzschlag vor 120 s: 100 s aktiv sind plausibel
reset role;
select pg_temp.zeit_setzen((select (j->>'sitzung')::uuid from start1), 120, 120);
set local role authenticated;

select is((public.umfrage_heartbeat((select (j->>'sitzung')::uuid from start1), 100, null))->>'aktive_sek', '100',
          'Herzschlag: plausible Zeit wird übernommen');

-- aufgeblähter Wert: höchstens die Zeit seit dem Start (in einer Transaktion steht now() still, deshalb die Zeit zurückdrehen)
reset role;
select pg_temp.zeit_setzen((select (j->>'sitzung')::uuid from start1), 120, 120);
set local role authenticated;
select ok((select w between 120 and 122 from (select ((public.umfrage_heartbeat((select (j->>'sitzung')::uuid from start1), 100000, null))->>'aktive_sek')::int as w) q),
          'Herzschlag: aufgeblähter Wert wird auf die Zeit seit dem Start gekappt');

-- nie weniger als bisher
select ok(((public.umfrage_heartbeat((select (j->>'sitzung')::uuid from start1), 5, null))->>'aktive_sek')::int >= 120,
          'Herzschlag: kleinerer Wert verringert die Zeit nicht');

-- Deckel seit letztem Herzschlag: Start vor 1 Stunde, letzter Herzschlag vor 20 s, aktuell ~120 s
reset role;
select pg_temp.zeit_setzen((select (j->>'sitzung')::uuid from start1), 3600, 20);
set local role authenticated;
select ok((select w between 140 and 152 from (select ((public.umfrage_heartbeat((select (j->>'sitzung')::uuid from start1), 3000, null))->>'aktive_sek')::int as w) q),
          'Herzschlag: höchstens die Serverzeit seit dem letzten Herzschlag plus Toleranz mehr');

-- Schrittzeiten
reset role;
select pg_temp.zeit_setzen((select (j->>'sitzung')::uuid from start1), 3600, 60);
set local role authenticated;
select lives_ok($$ select public.umfrage_heartbeat((select (j->>'sitzung')::uuid from start1), 180,
                    '{"v1": 50, "entwicklung": 30, "unsinn": 9, "v2": "abc"}'::jsonb) $$, 'Herzschlag mit Schrittzeiten');
reset role;
select is((select aktive_sek from public.umfrage_schrittzeiten
            where sitzung_id = (select (j->>'sitzung')::uuid from start1) and schritt = 'v1'), 50, 'Schrittzeit v1');
select is((select aktive_sek from public.umfrage_schrittzeiten
            where sitzung_id = (select (j->>'sitzung')::uuid from start1) and schritt = 'entwicklung'), 30, 'Schrittzeit entwicklung');
select is((select count(*) from public.umfrage_schrittzeiten
            where sitzung_id = (select (j->>'sitzung')::uuid from start1)), 2::bigint,
          'Ungültige Schritte werden ignoriert');

-- Schrittzeiten zusammen höchstens die aktive Zeit
select pg_temp.zeit_setzen((select (j->>'sitzung')::uuid from start1), 3600, 10);
set local role authenticated;
select lives_ok($$ select public.umfrage_heartbeat((select (j->>'sitzung')::uuid from start1), 190,
                    '{"v1": 100000, "v2": 100000}'::jsonb) $$, 'Herzschlag mit aufgeblähten Schrittzeiten');
reset role;
select ok((select sum(aktive_sek) from public.umfrage_schrittzeiten
            where sitzung_id = (select (j->>'sitzung')::uuid from start1))
          <= (select aktive_sek from public.umfrage_sitzungen where id = (select (j->>'sitzung')::uuid from start1)),
          'Schrittzeiten zusammen höchstens die aktive Zeit');
select ok((select min(aktive_sek) from public.umfrage_schrittzeiten
            where sitzung_id = (select (j->>'sitzung')::uuid from start1) and schritt = 'v1') >= 50,
          'Schrittzeit sinkt nie');

-- Lücke zwischen Herzschlägen
select pg_temp.zeit_setzen((select (j->>'sitzung')::uuid from start1), 3600, 400);
set local role authenticated;
select lives_ok($$ select public.umfrage_heartbeat((select (j->>'sitzung')::uuid from start1), 200, null) $$, 'Herzschlag nach langer Lücke');
reset role;
select ok('heartbeat_luecke' = any (select unnest(kennzeichen) from public.umfrage_sitzungen
                                      where id = (select (j->>'sitzung')::uuid from start1)),
          'Kennzeichen „heartbeat_luecke“');

-- ---------------------------------------------------------------------------
-- Zugriffsschutz
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000b');
set local role authenticated;
select throws_ok($$ select public.umfrage_heartbeat((select (j->>'sitzung')::uuid from start1), 10, null) $$,
                 '42501', 'Sitzung nicht gefunden.', 'Fremde Sitzung: kein Herzschlag');
select throws_ok($$ select public.umfrage_heartbeat('99999999-9999-9999-9999-999999999999', 10, null) $$,
                 '42501', 'Sitzung nicht gefunden.', 'Unbekannte Sitzung sieht genauso aus wie eine fremde');
select throws_ok($$ select public.umfrage_heartbeat('99999999-9999-9999-9999-999999999999', -5, null) $$,
                 '42501', null, 'Ungültige Sitzung zuerst abgelehnt');
select throws_ok($$ select * from public.umfrage_sitzungen $$, '42501', null, 'Sitzungen sind für Teilnehmer gesperrt');
select throws_ok($$ select * from public.umfrage_schrittzeiten $$, '42501', null, 'Schrittzeiten sind für Teilnehmer gesperrt');
select throws_ok($$ select public.zeit_auswertung() $$, '42501', 'Nur für Verantwortliche und Admins.', 'Mitarbeiter: keine Zeit-Auswertung');

select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
select throws_ok($$ select public.umfrage_starten((pg_temp.mkey(0) || '-01')::date) $$,
                 '42501', 'Du nimmst nicht an der Teamumfrage teil.', 'Verantwortlicher ohne Teilnahme: kein Start');

reset role;
set local role anon;
select throws_ok($$ select public.umfrage_starten((pg_temp.mkey(0) || '-01')::date) $$, '42501', null, 'anon: umfrage_starten gesperrt');
select throws_ok($$ select public.umfrage_einreichen_v3('{}'::jsonb) $$, '42501', null, 'anon: umfrage_einreichen_v3 gesperrt');
select throws_ok($$ select public.zeit_auswertung() $$, '42501', null, 'anon: zeit_auswertung gesperrt');
reset role;

-- ---------------------------------------------------------------------------
-- Berta: zu schnell abgegeben
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000b');
set local role authenticated;
create temp table start_b as select public.umfrage_starten((pg_temp.mkey(0) || '-01')::date) as j;
grant all on start_b to public;
reset role;
select pg_temp.zeit_setzen((select (j->>'sitzung')::uuid from start_b), 30, 30);
set local role authenticated;

-- Unvollständige Abgabe schlägt fehl und lässt die Sitzung offen
select throws_ok(
  format($$ select public.umfrage_einreichen_v3(%L::jsonb, %L::uuid, 3, null) $$,
         jsonb_build_object('monat', pg_temp.mkey(0), 'bewertungen', '[]'::jsonb), (select j->>'sitzung' from start_b)),
  '22023', null, 'Unvollständige Abgabe wird abgelehnt');
reset role;
select is((select status from public.umfrage_sitzungen where id = (select (j->>'sitzung')::uuid from start_b)),
          'laufend', 'Nach abgelehnter Abgabe bleibt die Sitzung offen');
set local role authenticated;

select lives_ok(
  format($$ select public.umfrage_einreichen_v3(%L::jsonb, %L::uuid, 3, null) $$,
         pg_temp.payload(pg_temp.mkey(0), '11111111-0000-0000-0000-00000000000a'), (select j->>'sitzung' from start_b)),
  'Abgabe mit Sitzung (3 s aktiv)');
reset role;
select is((select status from public.umfrage_sitzungen where id = (select (j->>'sitzung')::uuid from start_b)),
          'abgegeben', 'Sitzung ist abgeschlossen');
select ok('zu_schnell' = any (select unnest(kennzeichen) from public.umfrage_sitzungen where id = (select (j->>'sitzung')::uuid from start_b)),
          'Kennzeichen „zu_schnell“ (3 s für 2 Verhalten, Mindestzeit 10 s)');
select is((select a.ausfuelldauer_sek from public.umfrage_abgaben a
            join public.umfrage_sitzungen u on u.abgabe_id = a.id where u.id = (select (j->>'sitzung')::uuid from start_b)),
          null, 'Zu schnell: keine gültige Ausfülldauer');
select is((select count(*) from public.umfrage_abgaben where feedbackgeber_id = '11111111-0000-0000-0000-00000000000b'),
          1::bigint, 'Die Abgabe ist gespeichert (nichts wird verworfen)');

-- ---------------------------------------------------------------------------
-- Anna: gültig abgegeben mit 400 s aktiver Zeit
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000a');
reset role;
select pg_temp.zeit_setzen((select (j->>'sitzung')::uuid from start1), 600, 30);
update public.umfrage_sitzungen set aktive_sek = 400 where id = (select (j->>'sitzung')::uuid from start1);
set local role authenticated;
select lives_ok(
  format($$ select public.umfrage_einreichen_v3(%L::jsonb, %L::uuid, 420, null) $$,
         pg_temp.payload(pg_temp.mkey(0), '11111111-0000-0000-0000-00000000000b'), (select j->>'sitzung' from start1)),
  'Abgabe mit Sitzung (ca. 400 s aktiv)');
reset role;
select ok((select aktive_sek from public.umfrage_sitzungen where id = (select (j->>'sitzung')::uuid from start1)) between 400 and 430,
          'Letzter Zählerstand wird vor dem Abschluss gebucht');
select ok(not ('zu_schnell' = any (select unnest(kennzeichen) from public.umfrage_sitzungen where id = (select (j->>'sitzung')::uuid from start1))),
          'Anna: nicht „zu_schnell“');
select ok((select a.ausfuelldauer_sek from public.umfrage_abgaben a
            join public.umfrage_sitzungen u on u.abgabe_id = a.id where u.id = (select (j->>'sitzung')::uuid from start1)) between 400 and 430,
          'Gültige Zeit steht in ausfuelldauer_sek');

-- Zweite Abgabe im selben Monat wird abgelehnt, auch ein neuer Start
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000a');
set local role authenticated;
select throws_ok($$ select public.umfrage_starten((pg_temp.mkey(0) || '-01')::date) $$,
                 '23505', 'Du hast die Umfrage für diesen Monat bereits abgegeben.', 'Nach der Abgabe kein neuer Start');
select throws_ok(
  format($$ select public.umfrage_einreichen_v3(%L::jsonb, null, null, null) $$,
         pg_temp.payload(pg_temp.mkey(0), '11111111-0000-0000-0000-00000000000b')),
  '23505', null, 'Zweite Abgabe im Monat wird abgelehnt');

-- eigene Zeit
select is((select public.meine_ausfuellzeit((pg_temp.mkey(0) || '-01')::date)->>'aktive_sek')::int between 400 and 430, true,
          'meine_ausfuellzeit: eigene aktive Zeit');
select is(public.meine_ausfuellzeit((pg_temp.mkey(-1) || '-01')::date), null::jsonb, 'meine_ausfuellzeit: nichts für einen anderen Monat');

-- ---------------------------------------------------------------------------
-- Neu beginnen (Anna, Vormonat)
-- ---------------------------------------------------------------------------
create temp table start3 as select public.umfrage_starten((pg_temp.mkey(-1) || '-01')::date) as j;
grant all on start3 to public;
create temp table start4 as select public.umfrage_starten((pg_temp.mkey(-1) || '-01')::date, true) as j;
grant all on start4 to public;
select isnt((select j->>'sitzung' from start4), (select j->>'sitzung' from start3), 'Neu beginnen: neue Sitzung');
select is((select (j->>'wiederaufgenommen')::boolean from start4), false, 'Neu beginnen: nicht „wiederaufgenommen“');
reset role;
select is((select status from public.umfrage_sitzungen where id = (select (j->>'sitzung')::uuid from start3)),
          'neu_begonnen', 'Neu beginnen: alte Sitzung beendet');
select ok('neu_begonnen' = any (select unnest(kennzeichen) from public.umfrage_sitzungen where id = (select (j->>'sitzung')::uuid from start3)),
          'Neu beginnen: Kennzeichen „neu_begonnen“');
select is((select count(*) from public.umfrage_sitzungen
            where person_id = '11111111-0000-0000-0000-00000000000a' and monat = (pg_temp.mkey(-1) || '-01')::date and status = 'laufend'),
          1::bigint, 'Es gibt genau eine laufende Sitzung');

-- ---------------------------------------------------------------------------
-- Cora: ohne Sitzung abgegeben
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000c');
set local role authenticated;
select lives_ok(
  format($$ select public.umfrage_einreichen_v3(%L::jsonb) $$, pg_temp.payload(pg_temp.mkey(0), '11111111-0000-0000-0000-00000000000a')),
  'Abgabe ohne Sitzung');
reset role;
select ok('ohne_sitzung' = any (select unnest(kennzeichen) from public.umfrage_sitzungen
                                  where person_id = '11111111-0000-0000-0000-00000000000c' and monat = (pg_temp.mkey(0) || '-01')::date),
          'Kennzeichen „ohne_sitzung“');
select is((select a.ausfuelldauer_sek from public.umfrage_abgaben a where a.feedbackgeber_id = '11111111-0000-0000-0000-00000000000c'),
          null, 'Geräteuhr wird nicht übernommen');
set local role authenticated;
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000c');
select is(public.meine_ausfuellzeit((pg_temp.mkey(0) || '-01')::date), null::jsonb, 'ohne Sitzung: keine geprüfte Zeit');
reset role;

-- ---------------------------------------------------------------------------
-- Auswertung für die Leitung
-- (Hinweis: flüchtige Funktionen nie direkt in BETWEEN verwenden, der Ausdruck würde zweimal ausgewertet)
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('22222222-0000-0000-0000-00000000000e');
set local role authenticated;
create temp table zeit_j as select public.zeit_auswertung((pg_temp.mkey(0) || '-01')::date) as j;
grant all on zeit_j to public;
select is((select jsonb_array_length(j->'personen') from zeit_j), 3, 'Auswertung: drei abgegebene Sitzungen');
select is((select (j->'zusammenfassung'->>'abgegeben')::int from zeit_j), 3, 'Auswertung: abgegeben');
select is((select (j->'zusammenfassung'->>'zaehlt')::int from zeit_j), 1, 'Auswertung: nur Anna zählt (Berta zu schnell, Cora ohne Sitzung)');
select ok((select (j->'zusammenfassung'->>'median_sek')::int from zeit_j) between 400 and 430, 'Auswertung: Median aus den zählenden Sitzungen');
select ok((select (j->'zusammenfassung'->>'min_sek')::int from zeit_j) = (select (j->'zusammenfassung'->>'max_sek')::int from zeit_j),
          'Auswertung: Spanne bei einer Person');
select is((select (p->>'zaehlt')::boolean from zeit_j, jsonb_array_elements(j->'personen') p where p->>'name' = 'Berta Test'),
          false, 'Auswertung: Berta zählt nicht, bleibt aber sichtbar');
select is((select jsonb_array_length(j->'verhalten') from zeit_j), 2, 'Auswertung: Zeit je Verhalten (v1 und v2)');
reset role;
select is((select jsonb_array_length(j->'heatmap') from zeit_j), (select count(*)::int from public.umfrage_schrittzeiten z join public.umfrage_sitzungen u on u.id = z.sitzung_id where u.status = 'abgegeben'), 'Auswertung: Heatmap enthält alle Schrittzeiten abgegebener Sitzungen');
set local role authenticated;
select is((select (j->>'abgaben_ohne_zeit')::int from zeit_j), 0, 'Auswertung: alle Abgaben haben eine Sitzung');
select is((select j->>'monat' from zeit_j), pg_temp.mkey(0), 'Auswertung: Monat');

-- Salon-Grenze: Verantwortlicher eines anderen Salons sieht nichts
select pg_temp.anmelden('22222222-0000-0000-0000-000000000010');
select is((select jsonb_array_length(public.zeit_auswertung((pg_temp.mkey(0) || '-01')::date)->'personen')), 0,
          'Salon-Grenze: anderer Salon sieht keine Sitzungen');

select * from finish();
rollback;
