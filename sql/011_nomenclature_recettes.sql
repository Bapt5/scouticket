-- Nomenclature et compteurs des recettes, indépendants de ceux des dépenses.
-- L'année comptable (mois/jour de début, format) reste partagée avec les
-- dépenses (colonnes annee_comptable_* de 007_nomenclature_justificatifs.sql).
-- nomenclature_format_recette NULL = comportement historique (aucun compteur
-- utilisé pour les recettes).
ALTER TABLE scouticket_group_data
  ADD COLUMN IF NOT EXISTS nomenclature_format_recette TEXT,
  ADD COLUMN IF NOT EXISTS compteur_global_recette INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compteurs_comptables_recette JSONB NOT NULL DEFAULT '{}'::jsonb;
