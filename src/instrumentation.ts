import type { Instrumentation } from "next";
import { journal } from "@/lib/logger";

export const onRequestError: Instrumentation.onRequestError = (
  erreur,
  requete,
  contexte,
) => {
  journal.erreur("next.exception_serveur", {
    categorie: "framework",
    erreur,
    methode: requete.method,
    route: requete.path.split("?")[0],
    details: {
      typeRoute: contexte.routeType,
      cheminRoute: contexte.routePath,
    },
  });
};
