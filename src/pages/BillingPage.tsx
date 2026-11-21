import React, { useEffect, useState } from 'react';
import { Check, FileText } from 'lucide-react';
import type { AuthSessionUser, OrganizationRecord, PlanTier } from '../core/types.ts';
import { hasPermission, type PlanDefinition, type QuotaCheckResult } from '../core/rbac.ts';
import { apiRequest } from '../lib/api.ts';
import { formatMad, formatMadPrecise, formatNumberFr } from '../lib/format.ts';
import { Button, Surface } from '../components/ui/primitives.tsx';

interface BillingPayload {
  organization: OrganizationRecord;
  quota: QuotaCheckResult;
  plans: PlanDefinition[];
  usage: {
    dataSources: number;
    members: number;
    reports: number;
  };
}

function downloadMoroccanProforma(org: OrganizationRecord, plan: PlanDefinition): void {
  const ht = plan.monthlyPriceMad;
  const tva = Math.round(ht * 0.2 * 100) / 100;
  const ttc = Math.round((ht + tva) * 100) / 100;
  const dateStr = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  const invoiceNum = `PRO-MA-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Facture Proforma ${invoiceNum} — DataMind AI</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0F172A; margin: 40px; max-width: 780px; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0F172A; padding-bottom: 18px; margin-bottom: 28px; }
    .brand { font-size: 22px; font-weight: 700; color: #0F172A; }
    .muted { color: #64748B; font-size: 12px; line-height: 1.6; }
    .grid { display: flex; justify-content: space-between; margin-bottom: 28px; gap: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border-bottom: 1px solid #E2E8F0; padding: 12px 8px; font-size: 13px; text-align: left; }
    th { background: #F8FAFC; color: #475569; font-weight: 600; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .totals { margin-top: 20px; margin-left: auto; width: 320px; }
    .totals tr td { padding: 6px 8px; border: none; }
    .totals .grand td { border-top: 2px solid #0F172A; font-weight: 700; font-size: 15px; padding-top: 10px; }
    .box { margin-top: 28px; padding: 14px 16px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 12px; color: #334155; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">DataMind AI Maroc SARL</div>
      <div class="muted">Technopark Casablanca, Route de Nouaceur · Casablanca, Maroc<br/>ICE : 002948175000042 · RC : 514892 · IF : 50412879</div>
    </div>
    <div style="text-align:right">
      <div style="font-weight:700;font-size:16px">FACTURE PROFORMA</div>
      <div class="muted">N° ${invoiceNum}<br/>Date : ${dateStr}<br/>Devise : Dirham Marocain (MAD)</div>
    </div>
  </div>
  <div class="grid">
    <div>
      <div style="font-weight:600;font-size:12px;color:#64748B;margin-bottom:4px">CLIENT</div>
      <div style="font-weight:700">${org.name}</div>
      <div class="muted">${org.industry}<br/>Identifiant locataire : ${org.id}</div>
    </div>
    <div style="text-align:right">
      <div style="font-weight:600;font-size:12px;color:#64748B;margin-bottom:4px">MODES DE RÈGLEMENT ACCEPTÉS</div>
      <div class="muted">Carte bancaire marocaine (CMI) · Virement bancaire B2B (30 jours)<br/>TVA applicable : 20 % (Régime marocain)</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Désignation</th>
        <th class="num">Qté</th>
        <th class="num">Prix unitaire HT</th>
        <th class="num">Total HT</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Abonnement DataMind AI — Offre ${plan.name}</strong><br/><span class="muted">${plan.monthlyQueryLimit.toLocaleString('fr-FR')} analyses IA / mois · ${plan.maxDataSources} connecteurs TLS · Rétention audit ${plan.auditRetentionDays} jours</span></td>
        <td class="num">1 mois</td>
        <td class="num">${formatMadPrecise(ht)}</td>
        <td class="num">${formatMadPrecise(ht)}</td>
      </tr>
    </tbody>
  </table>
  <table class="totals">
    <tr><td>Total Hors Taxes (HT)</td><td class="num">${formatMadPrecise(ht)}</td></tr>
    <tr><td>TVA (20 %)</td><td class="num">${formatMadPrecise(tva)}</td></tr>
    <tr class="grand"><td>Net à payer TTC</td><td class="num">${formatMadPrecise(ttc)}</td></tr>
  </table>
  <div class="box">
    <strong>Conformité fiscale & sécurité :</strong> Service SaaS hébergé en conformité avec la Loi 09-08 (CNDP). Pour activer la facturation par virement bancaire ou CMI en production, transmettez votre ICE et RC à facturation@datamind.ma.
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `DataMind-Proforma-${plan.name}-${invoiceNum}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function BillingPage({ user }: { user: AuthSessionUser }) {
  const [data, setData] = useState<BillingPayload | null>(null);
  const [updatingPlan, setUpdatingPlan] = useState<PlanTier | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const canManageBilling = hasPermission(user.role, 'billing:manage', user.isPlatformAdmin);

  const loadBilling = async () => {
    const res = await apiRequest<BillingPayload>('/api/billing');
    setData(res);
  };

  useEffect(() => {
    void loadBilling();
  }, []);

  const handleSelectPlan = async (plan: PlanTier) => {
    setUpdatingPlan(plan);
    setFeedback(null);
    try {
      await apiRequest('/api/billing/plan', { method: 'POST', body: { plan } });
      await loadBilling();
      setFeedback('Votre forfait et vos quotas mensuels ont été mis à jour immédiatement.');
    } finally {
      setUpdatingPlan(null);
    }
  };

  if (!data) {
    return <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />;
  }

  const currentPlan = data.plans.find((p) => p.tier === data.organization.plan) || data.plans[0];
  const currentTtc = Math.round(currentPlan.monthlyPriceMad * 1.2);

  return (
    <div className="space-y-6">
      {feedback && (
        <div role="status" className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          {feedback}
        </div>
      )}

      {/* Quota & Active Plan Overview */}
      <Surface className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <p className="text-xs font-medium text-[#4F46E5]">Abonnement actif · Maroc (MAD)</p>
            <h2 className="text-2xl font-display font-bold text-[#0F172A] mt-1">
              Offre {currentPlan.name} · {formatMad(currentPlan.monthlyPriceMad)} HT / mois
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Soit {formatMad(currentTtc)} TTC (TVA 20 %) · Règlement par CMI ou virement bancaire B2B
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="text-left md:text-right">
              <p className="text-xs text-slate-500">Analyses IA consommées ce mois</p>
              <p className="text-xl font-display font-bold font-mono tabular-nums text-[#0F172A] mt-0.5">
                {formatNumberFr(data.organization.queriesUsed)} /{' '}
                {formatNumberFr(data.organization.monthlyQueryLimit)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadMoroccanProforma(data.organization, currentPlan)}
            >
              <FileText className="w-3.5 h-3.5" />
              Facture proforma (TVA 20 %)
            </Button>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
            <span>Progression du quota mensuel</span>
            <span className="font-mono tabular-nums font-medium">{data.quota.percentUsed} %</span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                data.quota.percentUsed > 85 ? 'bg-amber-600' : 'bg-[#4F46E5]'
              }`}
              style={{ width: `${data.quota.percentUsed}%` }}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-5 border-t border-slate-100 text-sm">
            <div>
              <p className="text-xs text-slate-500">Sources connectées</p>
              <p className="font-mono tabular-nums font-semibold text-[#0F172A] mt-0.5">
                {data.usage.dataSources} / {currentPlan.maxDataSources}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Collaborateurs</p>
              <p className="font-mono tabular-nums font-semibold text-[#0F172A] mt-0.5">
                {data.usage.members} / {currentPlan.maxMembers}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Rétention du journal d’audit</p>
              <p className="font-mono tabular-nums font-semibold text-[#0F172A] mt-0.5">
                {currentPlan.auditRetentionDays} jours
              </p>
            </div>
          </div>
        </div>
      </Surface>

      {/* Plans Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
        {data.plans.map((plan) => {
          const isCurrent = plan.tier === data.organization.plan;
          return (
            <Surface
              key={plan.tier}
              className={`p-6 flex flex-col justify-between ${
                isCurrent ? 'border-[#4F46E5] ring-1 ring-[#4F46E5]/25' : ''
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-display font-bold text-[#0F172A]">{plan.name}</h3>
                  {isCurrent && (
                    <span className="text-xs font-semibold text-[#4F46E5]">Forfait actuel</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">{plan.audience}</p>
                <p className="mt-4 text-3xl font-display font-bold font-mono tabular-nums text-[#0F172A]">
                  {formatMad(plan.monthlyPriceMad)}
                  <span className="text-xs font-sans font-normal text-slate-500"> HT / mois</span>
                </p>
                <p className="text-xs text-slate-500 mt-1">{plan.supportSla}</p>

                <ul className="mt-5 pt-5 border-t border-slate-100 space-y-2.5 text-sm text-slate-700">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#4F46E5] shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 pt-4">
                <Button
                  variant={isCurrent ? 'outline' : 'primary'}
                  className="w-full"
                  disabled={isCurrent || !canManageBilling || updatingPlan === plan.tier}
                  onClick={() => void handleSelectPlan(plan.tier)}
                >
                  {isCurrent
                    ? 'Forfait actif'
                    : updatingPlan === plan.tier
                    ? 'Mise à jour...'
                    : !canManageBilling
                    ? 'Réservé au Propriétaire'
                    : `Choisir ${plan.name}`}
                </Button>
              </div>
            </Surface>
          );
        })}
      </div>
    </div>
  );
}
