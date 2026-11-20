import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { AlertStatus, type AuthSessionUser, type StockAlert } from '../core/types.ts';
import { hasPermission } from '../core/rbac.ts';
import { apiRequest } from '../lib/api.ts';
import { formatDateTimeFr, formatNumberFr } from '../lib/format.ts';
import { Button, Surface } from '../components/ui/primitives.tsx';

export function AlertsPage({
  user,
  onAlertsCountChange,
}: {
  user: AuthSessionUser;
  onAlertsCountChange: (count: number) => void;
}) {
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [filter, setFilter] = useState<'all' | AlertStatus>('all');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const canManage = hasPermission(user.role, 'alerts:manage', user.isPlatformAdmin);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ alerts: StockAlert[] }>('/api/alerts');
      setAlerts(res.alerts);
      onAlertsCountChange(res.alerts.filter((a) => a.status === AlertStatus.ACTIVE).length);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAlerts();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await apiRequest<{ alerts: StockAlert[] }>('/api/alerts/sync', { method: 'POST' });
      setAlerts(res.alerts);
      onAlertsCountChange(res.alerts.filter((a) => a.status === AlertStatus.ACTIVE).length);
    } finally {
      setSyncing(false);
    }
  };

  const handleStatusChange = async (id: string, status: AlertStatus) => {
    const res = await apiRequest<{ alert: StockAlert }>(`/api/alerts/${id}/status`, {
      method: 'PATCH',
      body: { status },
    });
    setAlerts((prev) => {
      const next = prev.map((a) => (a.id === id ? res.alert : a));
      onAlertsCountChange(next.filter((a) => a.status === AlertStatus.ACTIVE).length);
      return next;
    });
  };

  const filtered = filter === 'all' ? alerts : alerts.filter((a) => a.status === filter);
  const activeCount = alerts.filter((a) => a.status === AlertStatus.ACTIVE).length;
  const criticalCount = alerts.filter(
    (a) => a.severity === 'critical' && a.status !== AlertStatus.RESOLVED
  ).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Surface className="p-5">
          <p className="text-xs font-medium text-slate-500">Alertes actives</p>
          <p className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-[#0F172A]">
            {activeCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Produits sous le seuil minimum</p>
        </Surface>
        <Surface className="p-5">
          <p className="text-xs font-medium text-slate-500">Ruptures critiques (&le; 4 jours)</p>
          <p className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-red-600">
            {criticalCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Réapprovisionnement urgent requis</p>
        </Surface>
        <Surface className="p-5">
          <p className="text-xs font-medium text-slate-500">Alertes traitées</p>
          <p className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-emerald-700">
            {alerts.filter((a) => a.status === AlertStatus.RESOLVED).length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Résolues sur la période courante</p>
        </Surface>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          {(
            [
              { id: 'all', label: 'Toutes' },
              { id: AlertStatus.ACTIVE, label: 'Actives' },
              { id: AlertStatus.ACKNOWLEDGED, label: 'Prises en charge' },
              { id: AlertStatus.RESOLVED, label: 'Résolues' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                filter === item.id
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {canManage && (
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className="w-3.5 h-3.5" />
            {syncing ? 'Analyse des entrepôts...' : 'Recalculer les stocks SQL'}
          </Button>
        )}
      </div>

      <Surface className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Chargement des alertes...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Aucune alerte de stock dans cette catégorie.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Produit / SKU</th>
                  <th className="py-3 px-3">Entrepôt</th>
                  <th className="py-3 px-3 text-right">Stock / Seuil</th>
                  <th className="py-3 px-3 text-right">Couverture</th>
                  <th className="py-3 px-3">Criticité</th>
                  <th className="py-3 px-3">Statut</th>
                  {canManage && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-[#0F172A]">{a.productName}</p>
                      <p className="text-xs text-slate-500 font-mono">
                        {a.sku} · {a.category}
                      </p>
                    </td>
                    <td className="py-3.5 px-3 text-slate-700 whitespace-nowrap">{a.warehouse}</td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <span className="font-semibold text-[#0F172A]">{a.currentStock}</span>
                      <span className="text-slate-400"> / {a.minThreshold}</span>
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {a.daysRemaining} j ({formatNumberFr(a.dailyRunRate)}/j)
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap text-xs font-medium">
                      <span
                        className={`inline-flex items-center gap-1 ${
                          a.severity === 'critical' ? 'text-red-600' : 'text-amber-700'
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {a.severity === 'critical' ? 'Critique' : 'Attention'}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap text-xs">
                      {a.status === AlertStatus.RESOLVED ? (
                        <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Résolue
                        </span>
                      ) : a.status === AlertStatus.ACKNOWLEDGED ? (
                        <span className="text-[#4F46E5] font-medium">
                          Prise en charge ({a.acknowledgedBy || 'équipe'})
                        </span>
                      ) : (
                        <span className="text-slate-600">
                          Active · {formatDateTimeFr(a.triggeredAt)}
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                        {a.status === AlertStatus.ACTIVE && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleStatusChange(a.id, AlertStatus.ACKNOWLEDGED)}
                          >
                            Prendre en charge
                          </Button>
                        )}
                        {a.status !== AlertStatus.RESOLVED && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleStatusChange(a.id, AlertStatus.RESOLVED)}
                          >
                            Résoudre
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
}
