-- Suivi budgétaire, activable par groupe (nécessite l'historique).
-- Les postes budgétaires sont distincts des catégories comptables : une
-- dépense ou une recette (une ligne d'historique) est rattachée à un seul
-- poste. Aucune donnée personnelle ni justificatif : uniquement des libellés
-- et des montants. Tout est supprimé quand l'option est désactivée.
ALTER TABLE scouticket_group_data
  ADD COLUMN IF NOT EXISTS budget_actif BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS scouticket_postes_budgetaires (
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  -- Un poste est soit une dépense, soit une recette.
  domaine TEXT NOT NULL CHECK (domaine IN ('depense', 'recette')),
  label TEXT NOT NULL,
  ordre INTEGER NOT NULL,
  PRIMARY KEY (organization_id, id)
);

-- Budget prévisionnel d'un poste pour une année comptable (année de début).
CREATE TABLE IF NOT EXISTS scouticket_budgets_postes (
  organization_id TEXT NOT NULL,
  poste_id TEXT NOT NULL,
  annee_debut INTEGER NOT NULL,
  montant NUMERIC(12, 2) NOT NULL CHECK (montant >= 0),
  PRIMARY KEY (organization_id, poste_id, annee_debut),
  FOREIGN KEY (organization_id, poste_id)
    REFERENCES scouticket_postes_budgetaires (organization_id, id) ON DELETE CASCADE
);

-- Copie texte du libellé : supprimer ou renommer un poste ne modifie pas
-- l'historique, la ligne passe simplement en « Non affecté » (poste_id NULL).
ALTER TABLE scouticket_historique
  ADD COLUMN IF NOT EXISTS poste_id TEXT,
  ADD COLUMN IF NOT EXISTS poste_label TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scouticket_historique_poste_fk'
  ) THEN
    ALTER TABLE scouticket_historique
      ADD CONSTRAINT scouticket_historique_poste_fk
      FOREIGN KEY (organization_id, poste_id)
      REFERENCES scouticket_postes_budgetaires (organization_id, id)
      ON DELETE SET NULL (poste_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS scouticket_historique_organisation_poste_idx
  ON scouticket_historique (organization_id, poste_id);
