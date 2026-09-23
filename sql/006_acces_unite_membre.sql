-- Restreint, par membre, les unités pour lesquelles il peut soumettre une
-- dépense. Absence de ligne = aucun accès. Les responsables (owner/admin) ne
-- sont jamais restreints : cette vérification est faite en application, pas
-- en base, et ne concerne donc que les membres simples.
CREATE TABLE IF NOT EXISTS scouticket_acces_unite_membre (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  unite_id TEXT NOT NULL,
  PRIMARY KEY (user_id, organization_id, unite_id),
  FOREIGN KEY (organization_id, unite_id)
    REFERENCES scouticket_unites (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS scouticket_acces_unite_membre_org_idx
  ON scouticket_acces_unite_membre (organization_id, unite_id);

-- Préserve le comportement actuel au déploiement : chaque membre existant
-- conserve l'accès à toutes les unités déjà présentes dans son groupe. Les
-- membres/unités créés après cette migration nécessitent une attribution
-- explicite par un responsable.
INSERT INTO scouticket_acces_unite_membre (user_id, organization_id, unite_id)
SELECT member."userId", member."organizationId", unite.id
FROM member
JOIN scouticket_unites unite ON unite.organization_id = member."organizationId"
ON CONFLICT DO NOTHING;
