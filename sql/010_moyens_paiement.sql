-- moyens_paiement : liste des moyens de paiement du groupe pour les dépenses (NULL = liste par défaut).
ALTER TABLE scouticket_group_data
  ADD COLUMN IF NOT EXISTS moyens_paiement JSONB;
