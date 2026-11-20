import React, { useEffect, useState } from 'react';
import { Download, Play, Plus, Trash2 } from 'lucide-react';
import type { AuthSessionUser, DataSourceRecord, SavedReport } from '../core/types.ts';
import { hasPermission } from '../core/rbac.ts';
import { apiRequest } from '../lib/api.ts';
import { exportRowsToCsv, formatDateTimeFr } from '../lib/format.ts';
import { DataChart, DataResultTable } from '../components/charts/DataVisualizer.tsx';
import { Button, Input, Modal, Select, Surface, Textarea } from '../components/ui/primitives.tsx';

interface ReportRunResult {
  report: SavedReport;
  columns: string[];
  rows: Record<string, unknown>[];
  executionMs: number;
}

const SCHEDULE_LABELS: Record<SavedReport['schedule'], string> = {
  manual: 'Manuel',
  daily: 'Quotidien',
  weekly: 'Hebdomadaire',
  monthly: 'Mensuel',
};

export function ReportsPage({ user }: { user: AuthSessionUser }) {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceRecord[]>([]);
  const [activeRun, setActiveRun] = useState<ReportRunResult | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('Toutes');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Finance',
    dataSourceId: '',
    sqlQuery: '',
    chartType: 'bar' as 'bar' | 'line' | 'area' | 'table',
    schedule: 'weekly' as SavedReport['schedule'],
  });

  const canWrite = hasPermission(user.role, 'reports:write', user.isPlatformAdmin);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiRequest<{ reports: SavedReport[]; dataSources: DataSourceRecord[] }>(
          '/api/reports'
        );
        setReports(res.reports);
        setDataSources(res.dataSources);
        if (res.dataSources[0]) {
          setForm((prev) => ({ ...prev, dataSourceId: res.dataSources[0].id }));
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement des rapports.');
      }
    };
    void load();
  }, []);

  const runReport = async (reportId: string) => {
    setError(null);
    setRunningId(reportId);
    try {
      const res = await apiRequest<ReportRunResult>(`/api/reports/${reportId}/run`, {
        method: 'POST',
      });
      setActiveRun(res);
      setReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? { ...r, lastRunAt: new Date().toISOString(), lastRowCount: res.rows.length }
            : r
        )
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Exécution du rapport impossible.');
    } finally {
      setRunningId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiRequest<{ report: SavedReport }>('/api/reports', {
        method: 'POST',
        body: form,
      });
      setReports((prev) => [res.report, ...prev]);
      setModalOpen(false);
      setForm((prev) => ({ ...prev, title: '', description: '', sqlQuery: '' }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Création du rapport impossible.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest(`/api/reports/${id}`, { method: 'DELETE' });
      setReports((prev) => prev.filter((r) => r.id !== id));
      if (activeRun?.report.id === id) setActiveRun(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  };

  const categories = ['Toutes', ...Array.from(new Set(reports.map((r) => r.category)))];
  const filtered =
    categoryFilter === 'Toutes' ? reports : reports.filter((r) => r.category === categoryFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                categoryFilter === cat
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Nouveau rapport SQL
          </Button>
        )}
      </div>

      {error && (
        <div role="alert" className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((rep) => (
          <Surface key={rep.id} className="p-5 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium text-[#4F46E5]">
                  {rep.category} · {SCHEDULE_LABELS[rep.schedule]}
                </p>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(rep.id)}
                    aria-label={`Supprimer le rapport ${rep.title}`}
                    className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <h3 className="text-base font-semibold text-[#0F172A] mt-1">{rep.title}</h3>
              <p className="text-sm text-slate-600 mt-1.5">{rep.description}</p>
            </div>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-500">
                Par {rep.createdBy} · {formatDateTimeFr(rep.lastRunAt)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={runningId === rep.id}
                onClick={() => void runReport(rep.id)}
              >
                <Play className="w-3.5 h-3.5" />
                {runningId === rep.id ? 'Exécution...' : 'Exécuter'}
              </Button>
            </div>
          </Surface>
        ))}
      </div>

      {/* Live Execution Output */}
      {activeRun && (
        <Surface className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-display font-semibold text-[#0F172A]">
                {activeRun.report.title}
              </h3>
              <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                {activeRun.rows.length} lignes · Exécuté en {activeRun.executionMs} ms (lecture seule)
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportRowsToCsv(
                  `rapport-${activeRun.report.id}.csv`,
                  activeRun.columns,
                  activeRun.rows
                )
              }
            >
              <Download className="w-3.5 h-3.5" />
              Exporter CSV
            </Button>
          </div>

          {activeRun.report.chartType !== 'table' && activeRun.columns.length >= 2 && (
            <DataChart
              rows={activeRun.rows}
              height={260}
              config={{
                type: activeRun.report.chartType,
                xKey: activeRun.columns[0],
                yKeys: activeRun.columns
                  .slice(1)
                  .filter((c) => typeof activeRun.rows[0]?.[c] === 'number')
                  .slice(0, 2),
                title: activeRun.report.title,
                valueFormat: activeRun.columns.some((c) => /montant|ca|chiffre|marge|ventes/i.test(c))
                  ? 'currency'
                  : 'number',
              }}
            />
          )}

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <DataResultTable columns={activeRun.columns} rows={activeRun.rows} />
          </div>
        </Surface>
      )}

      {/* Modal: Create Report */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Créer un rapport SQL en lecture seule"
        description="La requête est vérifiée par le pare-feu SQL et l’allowlist avant enregistrement."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label htmlFor="rep-title" className="block text-sm font-medium text-[#0F172A] mb-1.5">
              Titre
            </label>
            <Input
              id="rep-title"
              required
              placeholder="Top 10 produits par marge brute"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="rep-cat" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Catégorie
              </label>
              <Select
                id="rep-cat"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="Finance">Finance</option>
                <option value="Commercial">Commercial</option>
                <option value="Trésorerie">Trésorerie</option>
                <option value="Stocks">Stocks</option>
              </Select>
            </div>
            <div>
              <label htmlFor="rep-chart" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Visuel
              </label>
              <Select
                id="rep-chart"
                value={form.chartType}
                onChange={(e) =>
                  setForm({ ...form, chartType: e.target.value as 'bar' | 'line' | 'area' | 'table' })
                }
              >
                <option value="bar">Barres</option>
                <option value="area">Aires</option>
                <option value="line">Courbe</option>
                <option value="table">Tableau</option>
              </Select>
            </div>
            <div>
              <label htmlFor="rep-sched" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Fréquence
              </label>
              <Select
                id="rep-sched"
                value={form.schedule}
                onChange={(e) =>
                  setForm({ ...form, schedule: e.target.value as SavedReport['schedule'] })
                }
              >
                <option value="manual">Manuel</option>
                <option value="daily">Quotidien</option>
                <option value="weekly">Hebdomadaire</option>
                <option value="monthly">Mensuel</option>
              </Select>
            </div>
          </div>
          <div>
            <label htmlFor="rep-desc" className="block text-sm font-medium text-[#0F172A] mb-1.5">
              Description
            </label>
            <Input
              id="rep-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Objectif métier du rapport"
            />
          </div>
          <div>
            <label htmlFor="rep-sql" className="block text-sm font-medium text-[#0F172A] mb-1.5">
              Requête SQL (SELECT uniquement)
            </label>
            <Textarea
              id="rep-sql"
              rows={4}
              required
              className="font-mono text-xs"
              placeholder="SELECT p.name AS produit, ROUND(SUM((oi.unit_price - p.unit_cost) * oi.quantity), 2) AS marge_brute FROM order_items oi JOIN products p ON p.id = oi.product_id GROUP BY p.name ORDER BY marge_brute DESC LIMIT 10"
              value={form.sqlQuery}
              onChange={(e) => setForm({ ...form, sqlQuery: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">Valider et créer</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
