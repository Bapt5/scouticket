-- Notes de frais kilométriques, par groupe : activation, taux du kilomètre
-- (en euros) et date de dernière mise à jour du taux.
ALTER TABLE scouticket_group_data
  ADD COLUMN IF NOT EXISTS ndf_km_actif BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ndf_km_taux NUMERIC(6, 4) NOT NULL DEFAULT 0.354,
  ADD COLUMN IF NOT EXISTS ndf_km_taux_maj DATE NOT NULL DEFAULT DATE '2025-11-05';
