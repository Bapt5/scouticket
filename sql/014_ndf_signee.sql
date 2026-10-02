-- Active/désactive, par groupe, le processus de validation des notes de
-- frais par signature avant envoi au trésorier.
ALTER TABLE scouticket_group_data
  ADD COLUMN IF NOT EXISTS ndf_signee_actif BOOLEAN NOT NULL DEFAULT FALSE;
