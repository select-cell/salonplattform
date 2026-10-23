-- ============================================================================
-- Verhalten 1 hatte in der Vorlage abweichende Stufennamen ("4 – Sehr gut",
-- "5 – Prägend / High Performer"). Alle 20 Verhalten sollen dieselbe Skala zeigen:
-- 1 Bewusstsein, 2 Aufbau, 3 Stabilität, 4 Profi, 5 High Performer.
-- Betrifft nur die Bezeichnung, Prozente, Leitsätze und Punkte bleiben unverändert.
-- ============================================================================

update public.verhalten_kriterien k
   set bezeichnung = '4 – Profi'
  from public.verhalten v
 where k.verhalten_id = v.id and v.nr = 1 and k.stufe = 4 and k.bezeichnung = '4 – Sehr gut';

update public.verhalten_kriterien k
   set bezeichnung = '5 – High Performer'
  from public.verhalten v
 where k.verhalten_id = v.id and v.nr = 1 and k.stufe = 5 and k.bezeichnung = '5 – Prägend / High Performer';
