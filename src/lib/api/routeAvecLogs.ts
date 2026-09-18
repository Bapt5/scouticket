import { NextResponse } from "next/server";
import { journal } from "@/lib/logger";
import { recupererSession } from "@/lib/sessionServeur";

type TraitementRoute = () => Response | Promise<Response>;

function cheminSansParametres(requete: Request) {
  try {
    return new URL(requete.url).pathname;
  } catch {
    return "inconnu";
  }
}

/**
 * Exécute une route API en loggant les erreurs et les requêtes invalides.
 * @params requete - La requête HTTP entrante.
 * @params traitementRoute - La fonction de traitement de la route.
 */
export async function executerRouteAvecLogs(
  requete: Request,
  traitementRoute: TraitementRoute,
): Promise<Response> {
  // Sert à corréler la réponse envoyée au client avec les journaux serveur.
  const identifiantRequete = crypto.randomUUID();
  const contexte: {
    categorie: "api";
    identifiantRequete: string;
    identifiantUtilisateur: string | null;
    methode: string;
    route: string;
  } = {
    categorie: "api",
    identifiantRequete,
    identifiantUtilisateur: null,
    methode: requete.method,
    route: cheminSansParametres(requete),
  };

  try {
    const session = await recupererSession();
    contexte.identifiantUtilisateur = session?.user.id ?? null;
    const reponse = await traitementRoute();

    // Ajout de l'identifiant de requête aux entêtes client
    const entetes = new Headers(reponse.headers);
    entetes.set("X-Request-Id", identifiantRequete);

    if (reponse.status >= 500) {
      // Les erreurs serveur et les requêtes invalides sont distinguées dans les logs.
      journal.erreur("api.reponse_serveur_en_erreur", {
        ...contexte,
        statutHttp: reponse.status,
      });
    } else if (reponse.status >= 400) {
      journal.avertissement("api.requete_rejetee", {
        ...contexte,
        statutHttp: reponse.status,
      });
    }

    return new Response(reponse.body, {
      status: reponse.status,
      statusText: reponse.statusText,
      headers: entetes,
    });
  } catch (erreur) {
    journal.erreur("api.exception_non_interceptee", {
      ...contexte,
      erreur,
    });
    // Ne jamais exposer le détail d'une exception au client.
    return NextResponse.json(
      { error: "Erreur interne" },
      {
        status: 500,
        headers: { "X-Request-Id": identifiantRequete },
      },
    );
  }
}
