-- Remplace la colonne units (JSONB) de scouticket_group_data par une table
-- normalisée, préalable à la gestion des accès par membre (voir 006).
CREATE TABLE IF NOT EXISTS scouticket_unites (
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL,
  ordre INTEGER NOT NULL,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, ordre)
);

CREATE INDEX IF NOT EXISTS scouticket_unites_organization_id_idx
  ON scouticket_unites (organization_id);

-- Reprise des unités existantes depuis la colonne JSONB, en conservant leur
-- ordre. L'id lisible du JSONB (ex. "farfadets") n'est pas repris : l'id est
-- un identifiant opaque généré ici, pour ne jamais devenir trompeur si le
-- libellé est renommé par la suite (voir appliquerUnites côté application,
-- qui génère de la même façon l'id de toute unité créée après cette migration).
INSERT INTO scouticket_unites (organization_id, id, label, color, ordre)
SELECT
  donnees.organization_id,
  gen_random_uuid()::text,
  unite.value ->> 'label',
  unite.value ->> 'color',
  unite.ordinality - 1
FROM scouticket_group_data donnees,
     jsonb_array_elements(donnees.units) WITH ORDINALITY AS unite(value, ordinality);

ALTER TABLE scouticket_group_data DROP COLUMN IF EXISTS units;
