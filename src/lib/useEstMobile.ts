import { useSyncExternalStore } from "react";

const REQUETE_MOBILE = "(max-width: 767px)";

const matchMediaDisponible = () => typeof window.matchMedia === "function";

// Vrai sous le breakpoint `md` de Tailwind (largeur d'écran, pas user-agent) ;
// faux côté serveur et sans matchMedia.
export function useEstMobile() {
  return useSyncExternalStore(
    (notifier) => {
      if (!matchMediaDisponible()) return () => {};
      const media = window.matchMedia(REQUETE_MOBILE);
      media.addEventListener("change", notifier);
      return () => media.removeEventListener("change", notifier);
    },
    () => matchMediaDisponible() && window.matchMedia(REQUETE_MOBILE).matches,
    () => false,
  );
}
