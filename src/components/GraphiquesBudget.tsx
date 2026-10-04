"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LigneSuiviBudget } from "@/lib/budget";
import { formaterMontantHistorique } from "@/lib/historique";

/** Palette distincte (couleurs des unités SGDF puis complémentaires). */
const PALETTE = [
  "#0072CE",
  "#F28C00",
  "#6CC24A",
  "#E30613",
  "#00A19A",
  "#1E3A8A",
  "#8E44AD",
  "#B8860B",
  "#6B7280",
  "#D6336C",
  "#2F9E44",
  "#5F3DC4",
];

const couleurPoste = (index: number) => PALETTE[index % PALETTE.length];

const formaterAxe = (valeur: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(valeur);

interface GraphiquesBudgetProps {
  readonly lignes: readonly LigneSuiviBudget[];
}

function CamembertPostes({
  titre,
  donnees,
}: {
  readonly titre: string;
  readonly donnees: { nom: string; valeur: number; couleur: string }[];
}) {
  return (
    <figure className="min-w-0 flex-1 basis-64">
      <figcaption className="mb-2 text-center text-sm font-semibold text-zinc-800">
        {titre}
      </figcaption>
      {donnees.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">
          Aucune donnée.
        </p>
      ) : (
        <div className="h-64" role="img" aria-label={titre}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donnees}
                dataKey="valeur"
                nameKey="nom"
                innerRadius={40}
                outerRadius={90}
                paddingAngle={1}
                isAnimationActive={false}
              >
                {donnees.map((element) => (
                  <Cell key={element.nom} fill={element.couleur} />
                ))}
              </Pie>
              <Tooltip
                formatter={(valeur) =>
                  formaterMontantHistorique(Number(valeur))
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

/** Camemberts (prévu, réalisé) et barres prévu / réalisé par poste. */
export function GraphiquesBudget({ lignes }: GraphiquesBudgetProps) {
  // La couleur d'un poste reste la même dans tous les graphiques.
  const avecCouleur = lignes.map((ligne, index) => ({
    ...ligne,
    couleur: couleurPoste(index),
  }));
  const prevu = avecCouleur
    .filter((ligne) => (ligne.budget ?? 0) > 0)
    .map((ligne) => ({
      nom: ligne.label,
      valeur: ligne.budget ?? 0,
      couleur: ligne.couleur,
    }));
  const realise = avecCouleur
    .filter((ligne) => ligne.realise > 0)
    .map((ligne) => ({
      nom: ligne.label,
      valeur: ligne.realise,
      couleur: ligne.couleur,
    }));
  const barres = avecCouleur.map((ligne) => ({
    nom: ligne.label,
    Prévu: ligne.budget ?? 0,
    Réalisé: ligne.realise,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-6">
        <CamembertPostes titre="Répartition du prévu" donnees={prevu} />
        <CamembertPostes titre="Répartition du réalisé" donnees={realise} />
      </div>
      <figure>
        <figcaption className="mb-2 text-center text-sm font-semibold text-zinc-800">
          Prévu et réalisé par poste
        </figcaption>
        <div
          className="h-80"
          role="img"
          aria-label="Prévu et réalisé par poste"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barres} margin={{ bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="nom"
                interval={0}
                angle={-35}
                textAnchor="end"
                height={70}
                tick={{ fontSize: 11 }}
              />
              <YAxis tickFormatter={formaterAxe} width={60} />
              <Tooltip
                formatter={(valeur) =>
                  formaterMontantHistorique(Number(valeur))
                }
              />
              <Legend verticalAlign="top" />
              <Bar dataKey="Prévu" fill="#94A3B8" isAnimationActive={false} />
              <Bar dataKey="Réalisé" fill="#1E3A8A" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  );
}
