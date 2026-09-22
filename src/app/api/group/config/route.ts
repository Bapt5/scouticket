import { NextResponse } from "next/server";
import { z } from "zod";
import { validerUnites } from "@/lib/group";
import { recupererGroupeActif, recupererRoleMembre } from "@/lib/groupServer";
import { recupererContexteGroupe } from "@/lib/sessionServeur";
import { pool } from "@/lib/baseDeDonnees";
import {
  creerUrlVerificationTresorerie,
  construireValidationTresorerie,
} from "@/lib/treasuryVerification";
import { envoyerEmailValidationTresorerie } from "@/lib/treasuryEmail";
import { verifierOrigineRequete } from "@/lib/api/securiteRequetes";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";

const bodySchema = z.object({
  treasuryEmail: z.string().email(),
  units: z.unknown(),
});

function isAdmin(role: string | null) {
  // Seuls les propriétaires et administrateurs peuvent modifier la configuration.
  return role === "admin" || role === "owner";
}

/** Récupère la configuration et les droits de l'utilisateur pour son groupe actif. */
export async function GET(requete: Request) {
  return executerRouteAvecLogs(requete, async () => {
    const { identifiantOrganisation, identifiantUtilisateur } =
      await recupererContexteGroupe();
    if (!identifiantOrganisation || !identifiantUtilisateur)
      return NextResponse.json(
        { error: "Sélectionnez un groupe" },
        { status: 400 },
      );
    const group = await recupererGroupeActif(identifiantOrganisation);
    const role = await recupererRoleMembre(
      identifiantUtilisateur,
      identifiantOrganisation,
    );
    const preference = await pool.query<{ unit_id: string }>(
      // Cette préférence est propre à l'utilisateur, contrairement aux unités du groupe.
      `SELECT unit_id FROM scouticket_user_unit_preference
        WHERE user_id = $1 AND organization_id = $2`,
      [identifiantUtilisateur, identifiantOrganisation],
    );
    return NextResponse.json({
      groupName: group.organisation.name,
      units: group.unites,
      configured: Boolean(group.emailTresorerie && group.unites.length),
      treasuryVerified: group.validation.status === "verified",
      isAdmin: isAdmin(role),
      treasuryEmail: isAdmin(role) ? group.emailTresorerie : undefined,
      unitPreference: preference.rows[0]?.unit_id ?? "",
    });
  });
}

/** Enregistre la configuration du groupe et demande une nouvelle validation de trésorerie. */
export async function POST(req: Request) {
  return executerRouteAvecLogs(req, async () => {
    const { identifiantOrganisation, identifiantUtilisateur } =
      await recupererContexteGroupe();
    const role =
      identifiantOrganisation && identifiantUtilisateur
        ? await recupererRoleMembre(
            identifiantUtilisateur,
            identifiantOrganisation,
          )
        : null;
    if (!identifiantOrganisation || !isAdmin(role))
      return NextResponse.json(
        { error: "Accès réservé aux responsables du groupe" },
        { status: 403 },
      );
    // Empêche qu'un autre site déclenche cette modification au nom d'un administrateur.
    const originError = verifierOrigineRequete(req);
    if (originError) return originError;

    // Récupération des paramètres de la requête.
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    const units = parsed.success ? validerUnites(parsed.data.units) : null;
    if (!parsed.success || !units)
      return NextResponse.json(
        { error: "Configuration invalide" },
        { status: 400 },
      );

    const group = await recupererGroupeActif(identifiantOrganisation);
    // La contrainte SQL compare également les adresses sans tenir compte de la casse.
    const emailTresorerie = parsed.data.treasuryEmail.toLowerCase();
    // Une modification génère un nouveau jeton : l'ancienne validation ne reste pas valable.
    const { token, verification } = construireValidationTresorerie();
    try {
      await pool.query(
        `INSERT INTO scouticket_group_data
        (organization_id, units, treasury_email, treasury_verification)
       VALUES ($1, $2::jsonb, $3, $4::jsonb)
       ON CONFLICT (organization_id) DO UPDATE
       SET units = EXCLUDED.units, treasury_email = EXCLUDED.treasury_email,
           treasury_verification = EXCLUDED.treasury_verification`,
        [
          identifiantOrganisation,
          JSON.stringify(units),
          emailTresorerie,
          JSON.stringify(verification),
        ],
      );
    } catch (erreur) {
      // Seule la contrainte d'unicité est transformée en erreur métier ; les autres erreurs restent journalisées.
      if (
        typeof erreur === "object" &&
        erreur !== null &&
        "code" in erreur &&
        erreur.code === "23505"
      )
        return NextResponse.json(
          {
            error:
              "Cette adresse e-mail est déjà utilisée par un autre groupe.",
          },
          { status: 409 },
        );
      throw erreur;
    }
    // La validation est enregistrée avant l'envoi pour que le lien reçu soit utilisable.
    const url = creerUrlVerificationTresorerie(identifiantOrganisation, token);
    await envoyerEmailValidationTresorerie({
      destinataire: emailTresorerie,
      nomGroupe: group.organisation.name,
      url,
    });
    return NextResponse.json({ success: true });
  });
}
