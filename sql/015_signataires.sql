-- Liste de priorité des signataires (Responsables de groupe et Trésoriers)
-- pour la validation par signature des notes de frais. Présence d'une ligne
-- = ce membre fait partie du circuit de signature de sa catégorie ; la
-- catégorie (admin/owner) est dérivée du rôle courant du membre, pas
-- stockée ici. `ordre` n'a de sens que comparé aux autres lignes de la même
-- catégorie.
CREATE TABLE IF NOT EXISTS scouticket_signataires (
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  ordre INTEGER NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);

-- Préserve un comportement neutre au déploiement : tous les responsables et
-- trésoriers actuels sont inclus par défaut, ordonnés alphabétiquement.
INSERT INTO scouticket_signataires (organization_id, user_id, ordre)
SELECT member."organizationId", member."userId",
       ROW_NUMBER() OVER (
         PARTITION BY member."organizationId", member.role
         ORDER BY "user".name, "user".email
       )
  FROM member
  JOIN "user" ON "user".id = member."userId"
 WHERE member.role IN ('admin', 'owner')
ON CONFLICT DO NOTHING;
