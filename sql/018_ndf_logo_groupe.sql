-- Logo personnalisé du groupe pour le PDF de la note de frais signée.
-- Image normalisée côté serveur (PNG, taille bornée) ; NULL = logo SGDF par défaut.
-- Donnée institutionnelle (pas une donnée personnelle), supprimée avec le groupe.
ALTER TABLE scouticket_group_data
  ADD COLUMN IF NOT EXISTS ndf_logo BYTEA NULL,
  ADD COLUMN IF NOT EXISTS ndf_logo_type TEXT NULL;
