-- ============================================================================
-- Rituale gehören nicht in die Plattform (Entscheidung des Salons).
--
-- Die Tabellen und bisherigen Ritual-Abgaben bleiben erhalten. Die Rituale werden nur
-- deaktiviert: Die Umfrage zeigt sie nicht mehr, und umfrage_einreichen_v2 verlangt keine
-- Antworten dazu. Rückgängig: update public.rituale set aktiv = true;
-- ============================================================================

update public.rituale set aktiv = false where aktiv;
