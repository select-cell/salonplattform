-- pgTAP-Tests für das Bestellsystem: Startdaten, wer was lesen darf, Constraints.
-- Ausführen: `supabase test db`
begin;
select plan(28);

-- Meldet den Test als eingeloggten Nutzer an (setzt die JWT-Claims, die auth.uid() liest).
create function pg_temp.anmelden(p_uid text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end
$$;

-- ---------------------------------------------------------------------------
-- Startdaten aus der Migration (Salon Dawiid)
-- ---------------------------------------------------------------------------
select is((select count(*) from public.plaetze p join public.salons s on s.id = p.salon_id
            where s.name = 'Dawiid' and p.aktiv and p.platz between 1 and 7),
          7::bigint, 'Startdaten: Plätze 1 bis 7 für Dawiid');
select is((select array_agg(a.id order by a.sortierung) from public.artikel a
            join public.salons s on s.id = a.salon_id where s.name = 'Dawiid'),
          array['wasser', 'apfelschorle'], 'Startdaten: Wasser und Apfelschorle, in dieser Reihenfolge');

-- ---------------------------------------------------------------------------
-- Testdaten (laufen als postgres, alles wird am Ende zurückgerollt)
-- ---------------------------------------------------------------------------
insert into public.salons (id, name, start_monat) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Testsalon A', '2026-10-01');
insert into public.plaetze (platz, salon_id, aktiv) values
  (98, 'aaaaaaaa-0000-0000-0000-00000000000a', false),
  (99, 'aaaaaaaa-0000-0000-0000-00000000000a', true);
insert into public.artikel (id, salon_id, name, aktiv) values
  ('test_aus', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ausgeblendet', false),
  ('test_an',  'aaaaaaaa-0000-0000-0000-00000000000a', 'Sichtbar',     true);
insert into public.anfragen (id, platz) values
  ('00000000-0000-0000-0000-0000000000a1', 99);
insert into public.anfrage_positionen (anfrage_id, artikel_id, menge) values
  ('00000000-0000-0000-0000-0000000000a1', 'test_an', 2);

-- ---------------------------------------------------------------------------
-- Constraints (als Besitzer; so sieht es n8n mit dem Service-Key)
-- ---------------------------------------------------------------------------
select throws_ok($$ insert into public.anfrage_positionen (anfrage_id, artikel_id, menge)
                     values ('00000000-0000-0000-0000-0000000000a1', 'wasser', 0) $$,
  '23514', null, 'Menge 0 wird abgelehnt');
select throws_ok($$ insert into public.anfrage_positionen (anfrage_id, artikel_id, menge)
                     values ('00000000-0000-0000-0000-0000000000a1', 'wasser', 11) $$,
  '23514', null, 'Menge 11 wird abgelehnt');
select lives_ok($$ insert into public.anfrage_positionen (anfrage_id, artikel_id, menge)
                    values ('00000000-0000-0000-0000-0000000000a1', 'wasser', 10) $$,
  'Menge 10 ist erlaubt');
select throws_ok($$ insert into public.anfrage_positionen (anfrage_id, artikel_id, menge)
                     values ('00000000-0000-0000-0000-0000000000a1', 'wasser', 1) $$,
  '23505', null, 'Derselbe Artikel nur einmal je Anfrage');
select throws_ok($$ insert into public.anfrage_positionen (anfrage_id, artikel_id, menge)
                     values ('00000000-0000-0000-0000-0000000000a1', 'gibt_es_nicht', 1) $$,
  '23503', null, 'Unbekannter Artikel wird abgelehnt');
select throws_ok($$ insert into public.anfragen (id, platz)
                     values ('00000000-0000-0000-0000-0000000000a2', 12345) $$,
  '23503', null, 'Unbekannter Platz wird abgelehnt');
select throws_ok($$ insert into public.anfragen (id, platz)
                     values ('00000000-0000-0000-0000-0000000000a1', 99) $$,
  '23505', null, 'Dieselbe anfrage_id kann nicht zweimal gespeichert werden');
select throws_ok($$ insert into public.artikel (id, salon_id, name)
                     values ('Mit Leerzeichen', 'aaaaaaaa-0000-0000-0000-00000000000a', 'x') $$,
  '23514', null, 'Artikel-ID nur aus Kleinbuchstaben, Ziffern und Unterstrich');
select throws_ok($$ insert into public.plaetze (platz, salon_id)
                     values (0, 'aaaaaaaa-0000-0000-0000-00000000000a') $$,
  '23514', null, 'Platznummer muss positiv sein');

select is((select count(*) from public.anfrage_positionen where anfrage_id = '00000000-0000-0000-0000-0000000000a1'),
          2::bigint, 'Vor dem Löschen: zwei Positionen');
delete from public.anfragen where id = '00000000-0000-0000-0000-0000000000a1';
select is((select count(*) from public.anfrage_positionen where anfrage_id = '00000000-0000-0000-0000-0000000000a1'),
          0::bigint, 'Positionen verschwinden mit ihrer Anfrage');

-- neue Anfrage für die Zugriffstests unten
insert into public.anfragen (id, platz) values ('00000000-0000-0000-0000-0000000000b1', 99);

-- ---------------------------------------------------------------------------
-- Service-Key (n8n): darf schreiben
-- ---------------------------------------------------------------------------
set local role service_role;
select lives_ok($$ insert into public.anfragen (id, platz) values ('00000000-0000-0000-0000-0000000000b2', 99) $$,
  'service_role (n8n) darf Anfragen speichern');
select lives_ok($$ insert into public.anfrage_positionen (anfrage_id, artikel_id, menge)
                    values ('00000000-0000-0000-0000-0000000000b2', 'test_an', 1) $$,
  'service_role (n8n) darf Positionen speichern');
reset role;

-- ---------------------------------------------------------------------------
-- Nicht eingeloggt (anon): nur die aktive Speisekarte lesen
-- ---------------------------------------------------------------------------
select pg_temp.anmelden('');
set local role anon;

select is((select count(*) from public.plaetze where platz = 99), 1::bigint, 'anon sieht aktive Plätze');
select is((select count(*) from public.plaetze where platz = 98), 0::bigint, 'anon sieht inaktive Plätze nicht');
select is((select count(*) from public.artikel where id = 'test_an'),  1::bigint, 'anon sieht aktive Artikel');
select is((select count(*) from public.artikel where id = 'test_aus'), 0::bigint, 'anon sieht ausgeblendete Artikel nicht');

select throws_ok($$ select * from public.anfragen $$,           '42501', null, 'anon kann anfragen nicht lesen');
select throws_ok($$ select * from public.anfrage_positionen $$, '42501', null, 'anon kann anfrage_positionen nicht lesen');
select throws_ok($$ insert into public.anfragen (id, platz) values ('00000000-0000-0000-0000-0000000000c1', 99) $$,
  '42501', null, 'anon kann keine Anfrage anlegen (nur über n8n)');
select throws_ok($$ update public.artikel set name = 'Gehackt' $$, '42501', null, 'anon kann die Speisekarte nicht ändern');
select throws_ok($$ insert into public.plaetze (platz, salon_id) values (50, 'aaaaaaaa-0000-0000-0000-00000000000a') $$,
  '42501', null, 'anon kann keine Plätze anlegen');

-- ---------------------------------------------------------------------------
-- Eingeloggt (z. B. Teammitglied am QR-Code): gleiche Rechte wie anon
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.anmelden('00000000-0000-0000-0000-0000000000f1');
set local role authenticated;

select is((select count(*) from public.artikel where id = 'test_an'), 1::bigint, 'eingeloggt: Speisekarte lesbar');
select throws_ok($$ select * from public.anfragen $$, '42501', null, 'eingeloggt: anfragen gesperrt');
select throws_ok($$ select * from public.anfrage_positionen $$, '42501', null, 'eingeloggt: anfrage_positionen gesperrt');
select throws_ok($$ delete from public.anfragen $$, '42501', null, 'eingeloggt: keine Anfragen löschen');

select * from finish();
rollback;
