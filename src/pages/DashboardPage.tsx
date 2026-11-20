import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, MessageSquareText, RefreshCw } from 'lucide-react';
import type { ConversationRecord, OrganizationRecord, StockAlert } from '../core/types.ts';
import { apiRequest } from '../lib/api.ts';
import { formatDateFr, formatDateTimeFr, formatMad, formatNumberFr } from '../lib/format.ts';
import { DataChart } from '../components/charts/DataVisualizer.tsx';
import { Button, Surface } from '../components/ui/primitives.tsx';
import type { NavPageId } from '../components/layout/AppShell.tsx';

interface DashboardPayload {
  organization: OrganizationRecord;
  kpis: {
    chiffreAffairesHt: number;
    ventesEncaisseesTtc: number;
    facturesImpayeesTtc: number;
    nbFacturesImpayees: number;
    margeBrute: number;
    tauxMargePct: number;
  };
  monthlyTrend: Record<string, unknown>[];
  categoryBreakdown: Record<string, unknown>[];
  overdueInvoices: Array<{
    numero: string;
    client: string;
    region: string;
    echeance: string;
    montant_ttc: number;
    statut: string;
  }>;
  activeAlertsCount: number;
  criticalAlerts: StockAlert[];
  recentConversations: ConversationRecord[];
  dataSourcesCount: number;
}

export function DashboardPage({
  onNavigate,
  onAlertsCountChange,
}: {
  onNavigate: (page: NavPageId) => void;
  onAlertsCountChange: (count: number) => void;
}) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await apiRequest<DashboardPayload>('/api/dashboard/overview');
      setData(payload);
      onAlertsCountChange(payload.activeAlertsCount);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement du tableau de bord.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 h-80 bg-white border border-slate-200 rounded-xl animate-pulse" />
          <div className="lg:col-span-4 h-80 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Surface className="p-8 text-center">
        <p className="text-sm text-red-600">{error || 'Données indisponibles.'}</p>
        <Button variant="outline" className="mt-4" onClick={loadDashboard}>
          <RefreshCw className="w-4 h-4" />
          Réessayer
        </Button>
      </Surface>
    );
  }

  const quotaPct = Math.min(
    100,
    Math.round((data.organization.queriesUsed / Math.max(1, data.organization.monthlyQueryLimit)) * 100)
  );

  return (
    <div className="space-y-6">
      {/* Intro & Context Strip */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-[#0F172A]">
            Vue exécutive — Exercice 2026
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Indicateurs calculés en lecture seule selon la couche métier sémantique · {data.dataSourcesCount} source{data.dataSourcesCount > 1 ? 's' : ''} connectée{data.dataSourcesCount > 1 ? 's' : ''} · Quota IA : {formatNumberFr(data.organization.queriesUsed)} / {formatNumberFr(data.organization.monthlyQueryLimit)} ({quotaPct} %)
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={loadDashboard}>
            <RefreshCw className="w-3.5 h-3.5" />
            Actualiser
          </Button>
          <Button size="sm" onClick={() => onNavigate('assistant')}>
            <MessageSquareText className="w-3.5 h-3.5" />
            Poser une question IA
          </Button>
        </div>
      </div>

      {/* 4 Semantic KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Surface className="p-5">
          <p className="text-xs font-medium text-slate-500">Chiffre d’affaires facturé (HT)</p>
          <p className="mt-2.5 text-2xl font-display font-bold text-[#0F172A] tabular-nums tracking-tight">
            {formatMad(data.kpis.chiffreAffairesHt)}
          </p>
          <p className="mt-2 text-xs text-slate-500">Hors avoirs annulés · Jan – Nov 2026</p>
        </Surface>

        <Surface className="p-5">
          <p className="text-xs font-medium text-slate-500">Ventes encaissées (TTC)</p>
          <p className="mt-2.5 text-2xl font-display font-bold text-[#0F172A] tabular-nums tracking-tight">
            {formatMad(data.kpis.ventesEncaisseesTtc)}
          </p>
          <p className="mt-2 text-xs text-emerald-700 font-medium">Factures réglées confirmées</p>
        </Surface>

        <Surface className="p-5">
          <p className="text-xs font-medium text-slate-500">Factures impayées (TTC)</p>
          <p className="mt-2.5 text-2xl font-display font-bold text-[#0F172A] tabular-nums tracking-tight">
            {formatMad(data.kpis.facturesImpayeesTtc)}
          </p>
          <p className="mt-2 text-xs text-amber-700 font-medium">
            {data.kpis.nbFacturesImpayees} factures en attente ou échues
          </p>
        </Surface>

        <Surface className="p-5">
          <p className="text-xs font-medium text-slate-500">Marge brute commerciale</p>
          <p className="mt-2.5 text-2xl font-display font-bold text-[#0F172A] tabular-nums tracking-tight">
            {formatMad(data.kpis.margeBrute)}
          </p>
          <p className="mt-2 text-xs text-[#4F46E5] font-medium tabular-nums">
            Taux de marge moyen : {formatNumberFr(data.kpis.tauxMargePct)} %
          </p>
        </Surface>
      </div>

      {/* Primary Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Surface className="lg:col-span-8 p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-base font-semibold text-[#0F172A]">
                Chiffre d’affaires HT et ventes encaissées TTC
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Évolution mensuelle consolidée à partir de la table invoices
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs font-medium text-[#4F46E5] hover:text-[#4338CA] inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              Ouvrir le rapport
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <DataChart
            rows={data.monthlyTrend}
            height={270}
            config={{
              type: 'area',
              xKey: 'mois',
              yKeys: ['chiffre_affaires_ht', 'ventes_encaissees_ttc'],
              title: 'Tendance mensuelle',
              valueFormat: 'currency',
            }}
          />
        </Surface>

        <Surface className="lg:col-span-4 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <h3 className="text-base font-semibold text-[#0F172A]">Alertes de stock actives</h3>
              <button
                type="button"
                onClick={() => onNavigate('alerts')}
                className="text-xs font-medium text-[#4F46E5] hover:text-[#4338CA] whitespace-nowrap cursor-pointer"
              >
                Tout voir
              </button>
            </div>
            {data.criticalAlerts.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">
                Aucune rupture imminente détectée sur vos entrepôts.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.criticalAlerts.map((alert) => (
                  <li key={alert.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#0F172A] truncate">
                          {alert.productName}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {alert.sku} · {alert.warehouse}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold font-mono tabular-nums whitespace-nowrap ${
                          alert.severity === 'critical' ? 'text-red-600' : 'text-amber-600'
                        }`}
                      >
                        {alert.currentStock} / {alert.minThreshold}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                      <AlertTriangle
                        className={`w-3.5 h-3.5 shrink-0 ${
                          alert.severity === 'critical' ? 'text-red-600' : 'text-amber-600'
                        }`}
                      />
                      Couverture estimée : {alert.daysRemaining} jour{alert.daysRemaining > 1 ? 's' : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button variant="outline" size="sm" className="w-full mt-5" onClick={() => onNavigate('alerts')}>
            Gérer les seuils de réapprovisionnement
          </Button>
        </Surface>
      </div>

      {/* Bottom Row: Margin by Category + Overdue Invoices + Recent AI */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Surface className="lg:col-span-5 p-6">
          <h3 className="text-base font-semibold text-[#0F172A] mb-1">
            Performance par catégorie de produits
          </h3>
          <p className="text-xs text-slate-500 mb-4">Chiffre d’affaires HT et marge brute réalisée</p>
          <DataChart
            rows={data.categoryBreakdown}
            height={240}
            config={{
              type: 'bar',
              xKey: 'categorie',
              yKeys: ['chiffre_affaires_ht', 'marge_brute'],
              title: 'Catégories',
              valueFormat: 'currency',
            }}
          />
        </Surface>

        <Surface className="lg:col-span-7 p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-base font-semibold text-[#0F172A]">
                Factures impayées prioritaires
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Suivi des encours clients en retard ou en attente de règlement
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('assistant')}
              className="text-xs font-medium text-[#4F46E5] hover:text-[#4338CA] whitespace-nowrap cursor-pointer"
            >
              Analyser avec l’IA
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-2 pr-3">Facture</th>
                  <th className="py-2 px-3">Client</th>
                  <th className="py-2 px-3">Échéance</th>
                  <th className="py-2 px-3">Statut</th>
                  <th className="py-2 pl-3 text-right">Montant TTC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {data.overdueInvoices.map((inv) => (
                  <tr key={inv.numero} className="hover:bg-slate-50/70">
                    <td className="py-2.5 pr-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                      {inv.numero}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[#0F172A] whitespace-nowrap">
                      {inv.client}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 text-xs whitespace-nowrap">
                      {formatDateFr(inv.echeance)}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-xs font-medium">
                      <span className={inv.statut === 'overdue' ? 'text-red-600' : 'text-amber-700'}>
                        {inv.statut === 'overdue' ? 'En retard' : 'En attente'}
                      </span>
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono tabular-nums font-medium text-[#0F172A] whitespace-nowrap">
                      {formatMad(inv.montant_ttc)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      </div>

      {/* Recent AI Analyses */}
      <Surface className="p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-base font-semibold text-[#0F172A]">Dernières analyses conversationnelles</h3>
          <button
            type="button"
            onClick={() => onNavigate('assistant')}
            className="text-xs font-medium text-[#4F46E5] hover:text-[#4338CA] whitespace-nowrap cursor-pointer"
          >
            Ouvrir l’historique complet
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {data.recentConversations.map((conv) => (
            <div
              key={conv.id}
              className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#0F172A] truncate">{conv.prompt}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {conv.userEmail} · {conv.dataSourceName} · {formatDateTimeFr(conv.createdAt)}
                </p>
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap shrink-0">
                {conv.status === 'blocked' ? (
                  <span className="text-red-600 font-sans font-medium">Bloquée (sécurité)</span>
                ) : (
                  <span>
                    {conv.rowCount} lignes · {conv.executionMs} ms
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Surface>
    </div>
  );
}
