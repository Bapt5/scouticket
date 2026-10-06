"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LigneComparaison } from "@/lib/budgetPilotage";
import { formaterMontantHistorique } from "@/lib/historique";

const formaterAxe = (valeur: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(valeur);

interface GraphiqueComparaisonProps {
  readonly lignes: readonly LigneComparaison[];
  readonly libelleAnnee: string;
  readonly libelleAnneePrecedente: string;
}

/** Prévu et réalisé de l'année, face au réalisé de l'année précédente, par poste. */
export function GraphiqueComparaison({
  lignes,
  libelleAnnee,
  libelleAnneePrecedente,
}: GraphiqueComparaisonProps) {
  const noms = {
    prevu: `Prévu ${libelleAnnee}`,
    realise: `Réalisé ${libelleAnnee}`,
    precedent: `Réalisé ${libelleAnneePrecedente}`,
  };
  const donnees = lignes.map((ligne) => ({
    nom: ligne.label,
    [noms.prevu]: ligne.budget ?? 0,
    [noms.realise]: ligne.realise,
    [noms.precedent]: ligne.realisePrecedent ?? 0,
  }));
  return (
    <div
      className="h-80"
      role="img"
      aria-label={`Comparaison du réalisé ${libelleAnnee} avec ${libelleAnneePrecedente}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={donnees} margin={{ bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="nom"
            interval={0}
            angle={-35}
            textAnchor="end"
            height={70}
            tick={{ fontSize: 11 }}
          />
          <YAxis tickFormatter={formaterAxe} width={70} />
          <Tooltip
            formatter={(valeur) => formaterMontantHistorique(Number(valeur))}
          />
          <Legend verticalAlign="top" />
          <Bar dataKey={noms.prevu} fill="#94A3B8" isAnimationActive={false} />
          <Bar
            dataKey={noms.realise}
            fill="#1E3A8A"
            isAnimationActive={false}
          />
          <Bar
            dataKey={noms.precedent}
            fill="#D97706"
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
