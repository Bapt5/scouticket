-- Paramètres activables du groupe (page « Paramètres du groupe »).
-- scan_justificatifs_actif : recadrage automatique des justificatifs (Scanic).
ALTER TABLE scouticket_group_data
  ADD COLUMN IF NOT EXISTS scan_justificatifs_actif BOOLEAN NOT NULL DEFAULT FALSE;
