-- Historique des dépenses, recettes et notes de frais, activable par groupe.
-- Une ligne = une entrée de nomenclature (un justificatif ; une note de frais
-- signée n'en produit qu'une). Les justificatifs, le RIB et tout autre fichier
-- ne sont jamais stockés : seules les données comptables le sont. Tout est
-- supprimé quand l'option est désactivée ou quand le groupe est supprimé.
ALTER TABLE scouticket_group_data
  ADD COLUMN IF NOT EXISTS historique_actif BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS scouticket_historique (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- Regroupe les lignes issues d'un même envoi (même e-mail).
  envoi_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('depense', 'recette', 'note-de-frais')),
  date DATE NOT NULL,
  -- Copies texte : renommer ou supprimer une unité ne modifie pas l'historique.
  unite_id TEXT,
  unite_label TEXT NOT NULL,
  unite_couleur TEXT NOT NULL,
  -- Référence de nomenclature de l'e-mail : jamais modifiable (NULL sans format).
  reference TEXT,
  mode_paiement TEXT NOT NULL DEFAULT '',
  activite TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  montant_total NUMERIC(12, 2) NOT NULL,
  -- [{ "categorie": "...", "montant": 12.5 }, ...]
  lignes JSONB NOT NULL,
  -- NULL une fois le compte de l'auteur supprimé (affiché « Ancien membre »).
  auteur_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le TIMESTAMPTZ,
  modifie_par_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id, unite_id)
    REFERENCES scouticket_unites (organization_id, id) ON DELETE SET NULL (unite_id)
);

CREATE INDEX IF NOT EXISTS scouticket_historique_organisation_date_idx
  ON scouticket_historique (organization_id, date DESC);
CREATE INDEX IF NOT EXISTS scouticket_historique_organisation_unite_idx
  ON scouticket_historique (organization_id, unite_id);
