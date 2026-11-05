-- ============================================================================
-- Nach dem Deploy der neuen Oberfläche (Version 1.2): alte Abgabe-Funktion sperren
--
-- Von HAND im SQL-Editor ausführen, ERST WENN die neue Version der Plattform (mit Zeiterfassung) auf Netlify
-- online ist und eine Probe-Abgabe geklappt hat. KEINE nummerierte Migration: Die GitHub-Integration würde sie
-- sonst sofort anwenden, und die noch laufende alte Oberfläche könnte nicht mehr abgeben.
--
-- Warum: Die neue Oberfläche gibt über `umfrage_einreichen_v3` ab, die die Zeit der Sitzung mitschickt.
-- Bleibt `umfrage_einreichen_v2` für Anmeldungen offen, lässt sich die Zeiterfassung umgehen (Abgabe ohne Sitzung).
-- `umfrage_einreichen_v3` ruft `v2` intern auf (SECURITY DEFINER) und funktioniert weiter. Das ist getestet:
-- Alle Tests der Zeiterfassung laufen auch mit gesperrter `v2`.
--
-- Wiederholbar. Rückgängig:  grant execute on function public.umfrage_einreichen_v2(jsonb) to authenticated;
-- ============================================================================

revoke execute on function public.umfrage_einreichen_v2(jsonb) from public, anon, authenticated;

-- Prüfen: authenticated darf v3, aber nicht mehr v2 ausführen
select has_function_privilege('authenticated', 'public.umfrage_einreichen_v2(jsonb)', 'execute') as v2_offen,
       has_function_privilege('authenticated', 'public.umfrage_einreichen_v3(jsonb, uuid, integer, jsonb)', 'execute') as v3_offen;
-- Erwartet: v2_offen = false, v3_offen = true
