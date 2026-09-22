import { pool } from "@/lib/baseDeDonnees";

export type InvitationBrute = {
  id: string;
  email: string;
  status: string;
  expiresAt: Date;
  organizationId: string;
  role: string;
  nomGroupe: string;
};

export type InvitationValide = InvitationBrute;

/** Recherche une invitation quel que soit son statut (en attente, acceptée, expirée...). */
export async function recupererInvitationBrute(
  identifiantInvitation: string,
): Promise<InvitationBrute | null> {
  const resultat = await pool.query<{
    id: string;
    email: string;
    status: string;
    expiresAt: Date;
    organizationId: string;
    role: string;
    name: string;
  }>(
    `SELECT invitation.id, invitation.email, invitation.status,
            invitation."expiresAt", invitation."organizationId", invitation.role,
            organization.name
       FROM invitation
       JOIN organization ON organization.id = invitation."organizationId"
      WHERE invitation.id = $1`,
    [identifiantInvitation],
  );
  const invitation = resultat.rows[0];
  if (!invitation) return null;

  return {
    id: invitation.id,
    email: invitation.email,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    organizationId: invitation.organizationId,
    role: invitation.role,
    nomGroupe: invitation.name,
  };
}

/**
 * Recherche une invitation encore en attente et non expirée.
 * Retourne null pour toute autre situation (introuvable, expirée, déjà traitée),
 * laissant à l'appelant le soin de distinguer ces cas s'il en a besoin.
 */
export async function recupererInvitationValide(
  identifiantInvitation: string,
): Promise<InvitationValide | null> {
  const invitation = await recupererInvitationBrute(identifiantInvitation);
  if (
    !invitation ||
    invitation.status !== "pending" ||
    invitation.expiresAt <= new Date()
  )
    return null;

  return invitation;
}
