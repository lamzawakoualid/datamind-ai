import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { AuthSessionUser, OrganizationRecord, PlanTier } from '../core/types.ts';
import { hasPermission, type PlanDefinition, type QuotaCheckResult } from '../core/rbac.ts';
import { apiRequest } from '../lib/api.ts';
import { formatMad, formatNumberFr } from '../lib/format.ts';
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
            <p className="text-xs font-medium text-[#4F46E5]">Abonnement actif</p>
            <h2 className="text-2xl font-display font-bold text-[#0F172A] mt-1">
              Offre {currentPlan.name} · {formatMad(currentPlan.monthlyPriceMad)} HT / mois
            </h2>
            <p className="text-sm text-slate-500 mt-1">{currentPlan.audience}</p>
          </div>
          <div className="text-left md:text-right">
            <p className="text-xs text-slate-500">Analyses IA consommées ce mois</p>
            <p className="text-xl font-display font-bold font-mono tabular-nums text-[#0F172A] mt-0.5">
              {formatNumberFr(data.organization.queriesUsed)} /{' '}
              {formatNumberFr(data.organization.monthlyQueryLimit)}
            </p>
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
