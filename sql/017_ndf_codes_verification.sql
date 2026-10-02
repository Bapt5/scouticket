-- Codes de vérification (OTP) envoyés par e-mail à chaque tentative de
-- signature : preuve que le signataire a bien accès à sa messagerie au
-- moment de l'acte. À usage unique, courte durée de vie, tentatives
-- limitées. Ne contient jamais le code en clair (`code_hash`). Les lignes
-- d'une note sont supprimées à la clôture du circuit (validée ou refusée).
CREATE TABLE IF NOT EXISTS scouticket_ndf_codes_verification (
  id TEXT PRIMARY KEY,
  note_de_frais_id TEXT NOT NULL
    REFERENCES scouticket_notes_de_frais_signees(id) ON DELETE CASCADE,
  etape TEXT NOT NULL CHECK (etape IN ('beneficiaire', 'responsable', 'tresorier')),
  user_id TEXT NOT NULL REFERENCES "user"(id),
  code_hash TEXT NOT NULL,
  expire_le TIMESTAMPTZ NOT NULL,
  utilise BOOLEAN NOT NULL DEFAULT FALSE,
  tentatives INTEGER NOT NULL DEFAULT 0,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ndf_codes_verification_note_de_frais_idx
  ON scouticket_ndf_codes_verification (note_de_frais_id, etape);
