-- Ne modifie pas les données existantes : une collision historique doit être résolue explicitement.
DO $$
BEGIN
  IF EXISTS (
    SELECT lower(treasury_email)
      FROM scouticket_group_data
     WHERE treasury_email <> ''
     GROUP BY lower(treasury_email)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Des adresses de trésorerie sont déjà partagées entre plusieurs groupes. Corrigez-les avant d’appliquer cette migration.';
  END IF;
END $$;

-- La casse ne doit pas permettre d'utiliser deux fois la même boîte e-mail.
CREATE UNIQUE INDEX scouticket_group_data_treasury_email_unique
  ON scouticket_group_data (lower(treasury_email))
  WHERE treasury_email <> '';
