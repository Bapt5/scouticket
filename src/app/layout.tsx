import type { Metadata } from "next";
import { RegisterServiceWorker } from "@/components/register-sw";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://app.scoutreso.me"),
  title: {
    default: "Scoutréso",
    template: "%s | Scoutréso",
  },
  description:
    "Envoyez vos justificatifs et notes de frais à la trésorerie de votre groupe scout.",
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "Scoutréso",
    title: "Scoutréso",
    description:
      "Envoyez vos justificatifs et notes de frais à la trésorerie de votre groupe scout.",
    images: [{ url: "/og-scoutreso.png", width: 1730, height: 909 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Scoutréso",
    description:
      "Envoyez vos justificatifs et notes de frais à la trésorerie de votre groupe scout.",
    images: ["/og-scoutreso.png"],
  },
};

// Mesure d'audience Umami, chargée uniquement si les deux variables sont définies.
const urlScriptAudience = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL;
const identifiantSiteAudience = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

export function generateViewport() {
  return {
    themeColor: [
      {
        color: "#18181B",
      },
    ],
  };
}

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <meta name="theme-color" content="#18181B" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Scoutréso" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.json" />
        {urlScriptAudience && identifiantSiteAudience && (
          <script
            defer
            src={urlScriptAudience}
            data-website-id={identifiantSiteAudience}
          />
        )}
      </head>
      <body className="font-sans">
        <RegisterServiceWorker />
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  );
}
