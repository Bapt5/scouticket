-- convertir_justificatifs_pdf : conversion de tous les justificatifs en PDF avant l'envoi par e-mail.
ALTER TABLE scouticket_group_data
  ADD COLUMN IF NOT EXISTS convertir_justificatifs_pdf BOOLEAN NOT NULL DEFAULT FALSE;
