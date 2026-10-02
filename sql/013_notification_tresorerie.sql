-- Restreint, parmi les trésoriers (rôle owner) d'un groupe, ceux qui
-- reçoivent effectivement les e-mails de notes de frais/dépenses/recettes.
-- Présence de ligne = ce trésorier reçoit les mails.
CREATE TABLE IF NOT EXISTS scouticket_notification_tresorerie (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, organization_id)
);

-- Préserve le comportement actuel au déploiement : tous les trésoriers
-- existants continuent de recevoir les mails tant qu'un responsable ne
-- décoche pas explicitement l'un d'eux.
INSERT INTO scouticket_notification_tresorerie (user_id, organization_id)
SELECT "userId", "organizationId" FROM member WHERE role = 'owner'
ON CONFLICT DO NOTHING;
