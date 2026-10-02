import { NextResponse } from "next/server";
import {
  estResponsable,
  recupererGroupeActif,
  recupererRoleMembre,
} from "@/lib/groupServer";
import {
  enregistrerLogoGroupe,
  ErreurLogo,
  normaliserLogo,
  recupererLogoGroupe,
  supprimerLogoGroupe,
  TAILLE_MAX_LOGO_OCTETS,
} from "@/lib/logoGroupe";
import { recupererContexteGroupe } from "@/lib/sessionServeur";
import {
  verifierOrigineRequete,
  verifierRateLimit,
  reponseRateLimit,
} from "@/lib/api/securiteRequetes";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import { jsonError } from "@/lib/api/utils";

/** Vérifie que l'appelant est responsable du groupe et que les NDF signées sont activées. */
async function verifierAccesResponsable(): Promise<
  { identifiantOrganisation: string } | { erreur: NextResponse }
> {
  const { identifiantOrganisation, identifiantUtilisateur } =
    await recupererContexteGroupe();
  const role =
    identifiantOrganisation && identifiantUtilisateur
      ? await recupererRoleMembre(
          identifiantUtilisateur,
          identifiantOrganisation,
        )
      : null;
  if (!identifiantOrganisation || !estResponsable(role))
    return {
      erreur: jsonError("Accès réservé aux responsables du groupe", 403),
    };
  const groupe = await recupererGroupeActif(identifiantOrganisation);
  if (!groupe.parametres.ndfSigneeActif)
    return {
      erreur: jsonError(
        "Activez les notes de frais signées pour personnaliser le logo",
        409,
      ),
    };
  return { identifiantOrganisation };
}

/** Logo personnalisé (PNG) du groupe actif, pour l'aperçu. 404 si absent ou NDF signées désactivées. */
export async function GET(requete: Request) {
  return executerRouteAvecLogs(requete, async () => {
    const { identifiantOrganisation, identifiantUtilisateur } =
      await recupererContexteGroupe();
    if (!identifiantOrganisation || !identifiantUtilisateur)
      return jsonError("Sélectionnez un groupe", 401);
    const logo = await recupererLogoGroupe(identifiantOrganisation);
    if (!logo) return jsonError("Aucun logo personnalisé", 404);
    return new NextResponse(new Uint8Array(logo), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}

/** Importe (remplace) le logo du groupe : responsables uniquement, NDF signées activées. */
export async function PUT(requete: Request) {
  return executerRouteAvecLogs(requete, async () => {
    const acces = await verifierAccesResponsable();
    if ("erreur" in acces) return acces.erreur;
    const erreurOrigine = verifierOrigineRequete(requete);
    if (erreurOrigine) return erreurOrigine;

    const limite = verifierRateLimit(
      `logo-groupe:${acces.identifiantOrganisation}`,
      10,
      60_000,
    );
    if (!limite.autorise) return reponseRateLimit(limite.attenteSecondes);

    // Rejet précoce sur la taille annoncée, avant de lire le corps.
    const tailleAnnoncee = Number(requete.headers.get("content-length") ?? 0);
    if (tailleAnnoncee > TAILLE_MAX_LOGO_OCTETS + 64 * 1024)
      return jsonError("Fichier trop volumineux (1 Mo maximum)", 413);

    const formulaire = await requete.formData().catch(() => null);
    const fichier = formulaire?.get("logo");
    if (!(fichier instanceof File)) return jsonError("Logo manquant", 400);

    try {
      const logo = await normaliserLogo(
        Buffer.from(await fichier.arrayBuffer()),
      );
      await enregistrerLogoGroupe(acces.identifiantOrganisation, logo);
    } catch (erreur) {
      if (erreur instanceof ErreurLogo) return jsonError(erreur.message, 400);
      throw erreur;
    }
    return NextResponse.json({ success: true });
  });
}

/** Supprime le logo personnalisé : retour au logo SGDF par défaut. */
export async function DELETE(requete: Request) {
  return executerRouteAvecLogs(requete, async () => {
    const acces = await verifierAccesResponsable();
    if ("erreur" in acces) return acces.erreur;
    const erreurOrigine = verifierOrigineRequete(requete);
    if (erreurOrigine) return erreurOrigine;
    await supprimerLogoGroupe(acces.identifiantOrganisation);
    return NextResponse.json({ success: true });
  });
}
