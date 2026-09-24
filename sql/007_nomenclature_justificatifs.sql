-- Nomenclature personnalisée des justificatifs : paramètres du groupe et
-- compteurs de numérotation, stockés sur la ligne du groupe.
-- nomenclature_format NULL = comportement historique (aucun compteur utilisé).
-- compteurs_comptables : dernier numéro attribué par année comptable, indexé
-- par l'année de début (ex. {"2025": 12}).
ALTER TABLE scouticket_group_data
  ADD COLUMN IF NOT EXISTS nomenclature_format TEXT,
  ADD COLUMN IF NOT EXISTS annee_comptable_debut_mois SMALLINT NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS annee_comptable_debut_jour SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS annee_comptable_format TEXT NOT NULL DEFAULT 'debut-fin'
    CHECK (annee_comptable_format IN ('debut', 'fin', 'debut-fin')),
  ADD COLUMN IF NOT EXISTS compteur_global INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compteurs_comptables JSONB NOT NULL DEFAULT '{}'::jsonb;
