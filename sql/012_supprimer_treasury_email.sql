-- Le trésorier est désormais un rôle porté par un compte membre (owner),
-- non plus une adresse e-mail libre confirmée par lien de vérification.
DROP INDEX IF EXISTS scouticket_group_data_treasury_email_unique;

ALTER TABLE scouticket_group_data
  DROP COLUMN IF EXISTS treasury_email,
  DROP COLUMN IF EXISTS treasury_verification;
