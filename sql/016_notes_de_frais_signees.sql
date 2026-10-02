-- Circuit de signature électronique des notes de frais (bénéficiaire ->
-- responsable -> trésorier), actif quand `ndf_signee_actif` l'est pour le
-- groupe. Le PDF (note de frais + justificatifs + 3 pages de signature) n'est
-- persisté que le temps du circuit : chaque signataire y ajoute sa signature
-- électronique (PAdES, voir src/lib/ndfSignature/pdfSignature.ts). Dès que le
-- circuit se termine (validée ou refusée), la ligne est SUPPRIMÉE avec son
-- PDF et ses codes de vérification : la preuve des signatures (identité,
-- IP, user-agent, dates du code de vérification) est portée par le PDF signé
-- lui-même, envoyé par e-mail. Rien ne reste en base.
CREATE TABLE IF NOT EXISTS scouticket_notes_de_frais_signees (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  beneficiaire_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  -- Signataires résolus une seule fois, au dépôt, en appliquant la règle de
  -- remplacement en cas de conflit d'intérêt (documentée dans
  -- docs/technical/scan-justificatifs.md).
  responsable_signataire_user_id TEXT REFERENCES "user"(id),
  tresorier_signataire_user_id TEXT REFERENCES "user"(id),
  statut TEXT NOT NULL CHECK (
    statut IN (
      'en_attente_beneficiaire',
      'en_attente_responsable',
      'en_attente_tresorier'
    )
  ),
  -- Données nécessaires pour reconstruire l'e-mail final (équivalent
  -- DonneesEmailDepense/detailsDepenses). Le RIB éventuel y figure en base64 :
  -- il disparaît avec la ligne à la fin du circuit.
  donnees_ndf JSONB NOT NULL,
  -- SHA-256 du document initial (note, justificatifs, pages de signature
  -- vides), imprimé dans le dossier de preuve de chaque signature.
  document_hash TEXT NOT NULL,
  -- PDF en cours de signature : chaque signataire y ajoute sa signature.
  pdf_document BYTEA NOT NULL,
  -- Sert à repérer les circuits abandonnés (aucune purge automatique pour l'instant).
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_de_frais_signees_organisation_statut_idx
  ON scouticket_notes_de_frais_signees (organization_id, statut);
CREATE INDEX IF NOT EXISTS notes_de_frais_signees_beneficiaire_idx
  ON scouticket_notes_de_frais_signees (beneficiaire_user_id);
