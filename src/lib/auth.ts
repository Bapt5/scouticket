import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { i18n, locales } from "@better-auth/i18n";
import { nextCookies } from "better-auth/next-js";
import { pool } from "@/lib/baseDeDonnees";
import { envoyerEmailInvitation } from "@/lib/emailInvitation";
import {
  envoyerEmailReinitialisationMotDePasse,
  envoyerEmailVerificationCompte,
} from "@/lib/emailAuthentification";
import { journal } from "@/lib/logger";
import { journaliserAuditAuthentification } from "@/lib/auditAuthentification";

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.BETTER_AUTH_URL, process.env.APP_URL].filter(
    (origine): origine is string => Boolean(origine),
  ),
  rateLimit: {
    enabled: true,
    storage: "database",
  },
  advanced: {
    ipAddress: {
      // Cloudflare Tunnel transmet l'adresse du visiteur dans cet en-tête.
      ipAddressHeaders: ["cf-connecting-ip"],
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    async sendResetPassword({ user, url }) {
      try {
        await envoyerEmailReinitialisationMotDePasse({
          destinataire: user.email,
          url,
        });
      } catch (erreur) {
        journal.erreur("auth.reinitialisation_mot_de_passe_non_envoyee", {
          categorie: "authentification",
          erreur,
        });
        throw erreur;
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      try {
        await envoyerEmailVerificationCompte({
          destinataire: user.email,
          url,
        });
      } catch (erreur) {
        journal.erreur("auth.verification_email_non_envoyee", {
          categorie: "authentification",
          erreur,
        });
        throw erreur;
      }
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  account: {
    accountLinking: { trustedProviders: ["google"] },
  },
  hooks: {
    after: createAuthMiddleware(async (contexte) => {
      const retour = contexte.context.returned;
      let codeErreur =
        typeof retour === "object" && retour !== null && "code" in retour
          ? retour.code
          : undefined;
      if (retour instanceof Response && retour.status >= 400) {
        const corps = (await retour
          .clone()
          .json()
          .catch(() => null)) as unknown;
        codeErreur =
          typeof corps === "object" && corps !== null && "code" in corps
            ? corps.code
            : undefined;
      }
      const statutErreur =
        typeof retour === "object" && retour !== null && "statusCode" in retour
          ? retour.statusCode
          : undefined;
      journaliserAuditAuthentification({
        chemin: contexte.path,
        resultat:
          typeof codeErreur === "string" ||
          (typeof statutErreur === "number" && statutErreur >= 400)
            ? "echec"
            : "succes",
        contexte: contexte.context,
        corps: contexte.body,
        // La réponse Better Auth sert de repli si la session est absente du hook.
        retour,
        codeErreur:
          typeof codeErreur === "string"
            ? codeErreur
            : typeof statutErreur === "number"
              ? `HTTP_${statutErreur}`
              : undefined,
      });
    }),
  },
  plugins: [
    organization({
      invitationExpiresIn: 15 * 24 * 60 * 60,
      async sendInvitationEmail(data) {
        await envoyerEmailInvitation({
          destinataire: data.email,
          nomGroupe: data.organization.name,
          nomInvitant: data.inviter.user.name,
          invitationId: data.id,
        });
      },
    }),
    i18n({
      translations: {
        fr: locales.fr,
      },
    }),
    nextCookies(),
  ],
});
