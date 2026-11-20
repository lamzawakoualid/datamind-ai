import React, { useEffect, useState } from 'react';
import { RefreshCw, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AuditLogRecord, OrganizationRecord } from '../core/types.ts';
import { PLAN_CATALOG, ROLE_LABELS_FR } from '../core/rbac.ts';
import { apiRequest } from '../lib/api.ts';
import { formatDateTimeFr, formatMad, formatNumberFr } from '../lib/format.ts';
import { Button, Input, Surface } from '../components/ui/primitives.tsx';

interface AdminPayload {
  metrics: {
    totalOrganizations: number;
    totalQueries: number;
    blockedEvents: number;
    mrrMad: number;
  };
  organizations: Array<
    OrganizationRecord & {
      memberCount: number;
      dataSourceCount: number;
      reportCount: number;
    }
  >;
  auditLogs: AuditLogRecord[];
}

export function AdminPage() {
  const [data, setData] = useState<AdminPayload | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'allowed' | 'blocked' | 'error'>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadAdmin = async () => {
    setError(null);
    try {
      const res = await apiRequest<AdminPayload>('/api/admin/overview');
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Accès administration refusé.');
    }
  };

  useEffect(() => {
    void loadAdmin();
  }, []);

  if (error) {
    return (
      <Surface className="p-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
      </Surface>
    );
  }

  if (!data) {
    return <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />;
  }

  const filteredLogs = data.auditLogs.filter((log) => {
    if (statusFilter !== 'all' && log.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.actorEmail.toLowerCase().includes(q) ||
      log.organizationName.toLowerCase().includes(q) ||
      log.details.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-semibold text-[#0F172A]">
            Supervision SaaS multi-tenant & Journal d’audit
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Vue consolidée des organisations clientes, quotas et événements de sécurité SQL.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadAdmin()}>
          <RefreshCw className="w-3.5 h-3.5" />
          Actualiser
        </Button>
      </div>

      {/* Platform KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Surface className="p-5">
          <p className="text-xs font-medium text-slate-500">Revenu mensuel récurrent (MRR)</p>
          <p className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-[#0F172A]">
            {formatMad(data.metrics.mrrMad)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Abonnements actifs HT</p>
        </Surface>
        <Surface className="p-5">
          <p className="text-xs font-medium text-slate-500">Organisations locataires</p>
          <p className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-[#0F172A]">
            {data.metrics.totalOrganizations}
          </p>
          <p className="mt-1 text-xs text-slate-500">Isolation stricte par tenant_id</p>
        </Surface>
        <Surface className="p-5">
          <p className="text-xs font-medium text-slate-500">Requêtes IA exécutées</p>
          <p className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-[#0F172A]">
            {formatNumberFr(data.metrics.totalQueries)}
          </p>
          <p className="mt-1 text-xs text-slate-500">100 % validées en lecture seule</p>
        </Surface>
        <Surface className="p-5">
          <p className="text-xs font-medium text-slate-500">Tentatives bloquées (sécurité)</p>
          <p className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-red-600">
            {data.metrics.blockedEvents}
          </p>
          <p className="mt-1 text-xs text-slate-500">Pare-feu SQL, allowlist & RBAC</p>
        </Surface>
      </div>

      {/* Tenants Table */}
      <Surface className="p-6">
        <h3 className="text-base font-semibold text-[#0F172A] mb-4">Organisations actives</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                <th className="py-2.5 pr-4">Organisation</th>
                <th className="py-2.5 px-3">Offre</th>
                <th className="py-2.5 px-3">Moteur IA</th>
                <th className="py-2.5 px-3 text-right">Membres</th>
                <th className="py-2.5 px-3 text-right">Sources</th>
                <th className="py-2.5 pl-3 text-right">Quota mensuel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {data.organizations.map((org) => (
                <tr key={org.id} className="hover:bg-slate-50/70">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-[#0F172A]">{org.name}</p>
                    <p className="text-xs text-slate-500">{org.industry}</p>
                  </td>
                  <td className="py-3 px-3 text-xs font-medium text-[#4F46E5] whitespace-nowrap">
                    {PLAN_CATALOG[org.plan].name}
                  </td>
                  <td className="py-3 px-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                    {org.aiProvider} · {org.aiModel}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">{org.memberCount}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">{org.dataSourceCount}</td>
                  <td className="py-3 pl-3 text-right font-mono tabular-nums whitespace-nowrap">
                    {formatNumberFr(org.queriesUsed)} / {formatNumberFr(org.monthlyQueryLimit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* Audit Log Viewer */}
      <Surface className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-[#0F172A]">Journal d’audit et sécurité</h3>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                aria-label="Filtrer le journal d’audit"
                placeholder="Rechercher un acteur, une action..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 w-64"
              />
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'all', label: 'Tous' },
                  { id: 'allowed', label: 'Autorisés' },
                  { id: 'blocked', label: 'Bloqués' },
                  { id: 'error', label: 'Erreurs' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    statusFilter === f.id
                      ? 'bg-white text-[#0F172A] shadow-xs'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                <th className="py-2.5 pr-3">Horodatage</th>
                <th className="py-2.5 px-3">Organisation & Acteur</th>
                <th className="py-2.5 px-3">Événement</th>
                <th className="py-2.5 pl-3">Décision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/60">
                  <td className="py-3 pr-3 text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
                    {formatDateTimeFr(log.createdAt)}
                  </td>
                  <td className="py-3 px-3">
                    <p className="text-xs font-semibold text-[#0F172A]">{log.organizationName}</p>
                    <p className="text-xs text-slate-500">
                      {log.actorEmail} · {ROLE_LABELS_FR[log.actorRole]}
                    </p>
                  </td>
                  <td className="py-3 px-3">
                    <p className="font-medium text-[#0F172A]">{log.action}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{log.details}</p>
                    {log.sqlPreview && (
                      <p className="mt-1 font-mono text-[11px] text-slate-500 truncate max-w-lg">
                        {log.sqlPreview}
                      </p>
                    )}
                  </td>
                  <td className="py-3 pl-3 whitespace-nowrap text-xs font-medium">
                    {log.status === 'blocked' ? (
                      <span className="inline-flex items-center gap-1 text-red-600">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Bloqué
                      </span>
                    ) : log.status === 'error' ? (
                      <span className="text-amber-700">Erreur</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Autorisé
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>
    </div>
  );
}
