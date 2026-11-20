import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
} from 'lucide-react';
import {
  DbEngine,
  type AuthSessionUser,
  type DataSourceRecord,
  type SemanticMetric,
  type TableAllowlistItem,
} from '../core/types.ts';
import { hasPermission } from '../core/rbac.ts';
import { apiRequest } from '../lib/api.ts';
import { formatDateTimeFr } from '../lib/format.ts';
import { Button, Input, Modal, Select, Surface } from '../components/ui/primitives.tsx';

export function DataSourcesPage({ user }: { user: AuthSessionUser }) {
  const [tab, setTab] = useState<'sources' | 'semantic'>('sources');
  const [sources, setSources] = useState<DataSourceRecord[]>([]);
  const [metrics, setMetrics] = useState<SemanticMetric[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // New source modal
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [newSource, setNewSource] = useState({
    name: '',
    engine: DbEngine.POSTGRESQL,
    host: '',
    port: 5432,
    databaseName: '',
    username: '',
    password: '',
    tlsMode: 'verify-full' as 'require' | 'verify-full' | 'prefer',
  });

  // New semantic metric modal
  const [metricModalOpen, setMetricModalOpen] = useState(false);
  const [newMetric, setNewMetric] = useState({
    code: '',
    label: '',
    description: '',
    sqlExpression: '',
    tableName: 'invoices',
    format: 'currency' as 'currency' | 'percent' | 'number',
  });

  const canWriteSources = hasPermission(user.role, 'datasources:write', user.isPlatformAdmin);
  const canWriteSemantic = hasPermission(user.role, 'semantic:write', user.isPlatformAdmin);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        dataSources: DataSourceRecord[];
        semanticMetrics: SemanticMetric[];
      }>('/api/datasources');
      setSources(res.dataSources);
      setMetrics(res.semanticMetrics);
      if (!selectedSourceId && res.dataSources[0]) {
        setSelectedSourceId(res.dataSources[0].id);
      }
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur de chargement des sources.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const selectedSource = sources.find((s) => s.id === selectedSourceId) || sources[0] || null;

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiRequest<{ dataSource: DataSourceRecord }>('/api/datasources', {
        method: 'POST',
        body: newSource,
      });
      setSources((prev) => [res.dataSource, ...prev]);
      setSelectedSourceId(res.dataSource.id);
      setSourceModalOpen(false);
      setNewSource({
        name: '',
        engine: DbEngine.POSTGRESQL,
        host: '',
        port: 5432,
        databaseName: '',
        username: '',
        password: '',
        tlsMode: 'verify-full',
      });
      setFeedback({
        type: 'ok',
        text: `Source « ${res.dataSource.name} » enregistrée avec mot de passe chiffré AES-256-GCM.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Création de source impossible.',
      });
    }
  };

  const handleTestConnection = async (id: string) => {
    setBusyId(id);
    setFeedback(null);
    try {
      const res = await apiRequest<{
        result: { ok: boolean; latencyMs: number; message: string };
        dataSource: DataSourceRecord;
      }>(`/api/datasources/${id}/test`, { method: 'POST' });
      setSources((prev) => prev.map((s) => (s.id === id ? res.dataSource : s)));
      setFeedback({
        type: res.result.ok ? 'ok' : 'err',
        text: `${res.result.message} (${res.result.latencyMs} ms)`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Test de connexion échoué.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDiscoverSchema = async (id: string) => {
    setBusyId(id);
    setFeedback(null);
    try {
      const res = await apiRequest<{ dataSource: DataSourceRecord }>(
        `/api/datasources/${id}/discover`,
        { method: 'POST' }
      );
      setSources((prev) => prev.map((s) => (s.id === id ? res.dataSource : s)));
      setFeedback({
        type: 'ok',
        text: `Schéma synchronisé : ${res.dataSource.tables.length} tables découvertes.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Découverte du schéma impossible.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveAllowlist = async (sourceId: string, updatedTables: TableAllowlistItem[]) => {
    setFeedback(null);
    try {
      const res = await apiRequest<{ dataSource: DataSourceRecord }>(
        `/api/datasources/${sourceId}/allowlist`,
        {
          method: 'PATCH',
          body: { tables: updatedTables },
        }
      );
      setSources((prev) => prev.map((s) => (s.id === sourceId ? res.dataSource : s)));
      setFeedback({
        type: 'ok',
        text: 'Allowlist tables/colonnes mise à jour dans le pare-feu SQL.',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Sauvegarde allowlist échouée.',
      });
    }
  };

  const toggleTableAllowed = (tableName: string) => {
    if (!selectedSource || !canWriteSources) return;
    const next = selectedSource.tables.map((t) =>
      t.name === tableName
        ? {
            ...t,
            allowed: !t.allowed,
            columns: t.columns.map((c) => ({ ...c, allowed: !t.allowed && !c.sensitive })),
          }
        : t
    );
    void handleSaveAllowlist(selectedSource.id, next);
  };

  const toggleColumnAllowed = (tableName: string, colName: string) => {
    if (!selectedSource || !canWriteSources) return;
    const next = selectedSource.tables.map((t) =>
      t.name === tableName
        ? {
            ...t,
            columns: t.columns.map((c) => (c.name === colName ? { ...c, allowed: !c.allowed } : c)),
          }
        : t
    );
    void handleSaveAllowlist(selectedSource.id, next);
  };

  const handleAddMetric = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiRequest<{ metric: SemanticMetric }>('/api/semantic-metrics', {
        method: 'POST',
        body: newMetric,
      });
      setMetrics((prev) => [...prev, res.metric]);
      setMetricModalOpen(false);
      setNewMetric({
        code: '',
        label: '',
        description: '',
        sqlExpression: '',
        tableName: 'invoices',
        format: 'currency',
      });
      setFeedback({
        type: 'ok',
        text: `Indicateur sémantique « ${res.metric.label} » ajouté au contexte IA.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Impossible d’enregistrer l’indicateur.',
      });
    }
  };

  const handleDeleteMetric = async (id: string) => {
    try {
      await apiRequest(`/api/semantic-metrics/${id}`, { method: 'DELETE' });
      setMetrics((prev) => prev.filter((m) => m.id !== id));
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Suppression impossible.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setTab('sources')}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
              tab === 'sources' ? 'bg-white text-[#0F172A] shadow-xs' : 'text-slate-600 hover:text-[#0F172A]'
            }`}
          >
            Connexions & Allowlist ({sources.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('semantic')}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
              tab === 'semantic' ? 'bg-white text-[#0F172A] shadow-xs' : 'text-slate-600 hover:text-[#0F172A]'
            }`}
          >
            Couche métier sémantique ({metrics.length})
          </button>
        </div>

        {tab === 'sources' && canWriteSources && (
          <Button size="sm" onClick={() => setSourceModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Connecter une base PostgreSQL / MySQL
          </Button>
        )}
        {tab === 'semantic' && canWriteSemantic && (
          <Button size="sm" onClick={() => setMetricModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Nouvel indicateur métier
          </Button>
        )}
      </div>

      {feedback && (
        <div
          role="status"
          className={`p-3.5 rounded-lg border text-sm ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {tab === 'sources' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Sources list */}
          <div className="lg:col-span-5 space-y-3">
            {loading ? (
              <div className="h-40 bg-white border border-slate-200 rounded-xl animate-pulse" />
            ) : (
              sources.map((src) => {
                const isSelected = selectedSource?.id === src.id;
                return (
                  <Surface
                    key={src.id}
                    className={`p-5 transition-colors ${
                      isSelected ? 'border-[#4F46E5] ring-1 ring-[#4F46E5]/20' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedSourceId(src.id)}
                        className="text-left min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Database className="w-4 h-4 text-[#4F46E5] shrink-0" />
                          <h3 className="text-sm font-semibold text-[#0F172A] truncate">{src.name}</h3>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 font-mono truncate">
                          {src.engine.toUpperCase()} · {src.host}:{src.port}/{src.databaseName}
                        </p>
                      </button>
                      <span
                        className={`text-xs font-medium whitespace-nowrap ${
                          src.status === 'connected'
                            ? 'text-emerald-700'
                            : src.status === 'error'
                            ? 'text-red-600'
                            : 'text-amber-700'
                        }`}
                      >
                        {src.status === 'connected'
                          ? 'Connectée'
                          : src.status === 'error'
                          ? 'Erreur'
                          : 'En attente'}
                      </span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
                      <p className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                        TLS {src.tlsMode} · Compte lecture seule ({src.username})
                      </p>
                      <p className="font-mono text-[11px] text-slate-400">
                        Secret : {src.encryptedPassword}
                      </p>
                      <p>Dernier test : {formatDateTimeFr(src.lastTestedAt)}</p>
                    </div>

                    {canWriteSources && (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === src.id}
                          onClick={() => void handleTestConnection(src.id)}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Tester
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === src.id}
                          onClick={() => void handleDiscoverSchema(src.id)}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Découvrir le schéma
                        </Button>
                      </div>
                    )}
                  </Surface>
                );
              })
            )}
          </div>

          {/* Schema & Allowlist Inspector */}
          <Surface className="lg:col-span-7 p-6">
            {!selectedSource ? (
              <p className="text-sm text-slate-500 py-8 text-center">
                Sélectionnez une source de données pour gérer son allowlist SQL.
              </p>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
                      <Shield className="w-4 h-4 text-[#4F46E5]" />
                      Allowlist tables et colonnes — {selectedSource.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Seules les tables et colonnes cochées sont exposées au LLM et autorisées par le pare-feu SQL.
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
                    {selectedSource.tables.filter((t) => t.allowed).length} / {selectedSource.tables.length} tables
                  </span>
                </div>

                {selectedSource.tables.length === 0 ? (
                  <div className="py-8 text-center space-y-3">
                    <p className="text-sm text-slate-500">
                      Aucun schéma découvert pour cette source externe. Testez la connexion puis lancez la découverte.
                    </p>
                    {canWriteSources && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleDiscoverSchema(selectedSource.id)}
                      >
                        Lancer la découverte du schéma
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedSource.tables.map((tbl) => (
                      <div key={tbl.name} className="border border-slate-200 rounded-lg p-4">
                        <div className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={tbl.allowed}
                              disabled={!canWriteSources}
                              onChange={() => toggleTableAllowed(tbl.name)}
                              className="w-4 h-4 accent-[#4F46E5] rounded"
                            />
                            <span className="font-mono text-sm font-semibold text-[#0F172A]">
                              {tbl.name}
                            </span>
                            {tbl.rowCount !== undefined && (
                              <span className="text-xs text-slate-400 font-mono tabular-nums">
                                ({tbl.rowCount} lignes)
                              </span>
                            )}
                          </label>
                          <span
                            className={`text-xs font-medium ${
                              tbl.allowed ? 'text-emerald-700' : 'text-red-600'
                            }`}
                          >
                            {tbl.allowed ? 'Autorisée' : 'Exclue du LLM'}
                          </span>
                        </div>
                        {tbl.description && (
                          <p className="text-xs text-slate-500 mt-1 ml-6">{tbl.description}</p>
                        )}
                        <div className="mt-3 ml-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {tbl.columns.map((col) => (
                            <label
                              key={col.name}
                              className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded hover:bg-slate-50 cursor-pointer"
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={col.allowed}
                                  disabled={!canWriteSources || !tbl.allowed}
                                  onChange={() => toggleColumnAllowed(tbl.name, col.name)}
                                  className="w-3.5 h-3.5 accent-[#4F46E5]"
                                />
                                <span
                                  className={`font-mono truncate ${
                                    col.allowed ? 'text-slate-800' : 'text-slate-400 line-through'
                                  }`}
                                >
                                  {col.name}
                                </span>
                              </span>
                              <span className="text-[11px] font-mono text-slate-400 shrink-0">
                                {col.sensitive ? 'Sensible' : col.type}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Surface>
        </div>
      ) : (
        /* Semantic Business Layer */
        <Surface className="p-6">
          <div className="mb-5">
            <h3 className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#4F46E5]" />
              Dictionnaire des indicateurs métier
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Ces définitions SQL officielles garantissent que l’Assistant IA calcule le chiffre d’affaires, les ventes encaissées, les impayés et la marge selon les règles comptables de votre entreprise.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-2.5 pr-4">Indicateur</th>
                  <th className="py-2.5 px-3">Table</th>
                  <th className="py-2.5 px-3">Expression SQL métier</th>
                  <th className="py-2.5 px-3">Format</th>
                  {canWriteSemantic && <th className="py-2.5 pl-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {metrics.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-[#0F172A]">{m.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>
                    </td>
                    <td className="py-3 px-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                      {m.tableName}
                    </td>
                    <td className="py-3 px-3 font-mono text-xs text-[#4F46E5] max-w-md">
                      {m.sqlExpression}
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-600 whitespace-nowrap">
                      {m.format === 'currency'
                        ? 'Devise (MAD)'
                        : m.format === 'percent'
                        ? 'Pourcentage (%)'
                        : 'Nombre'}
                    </td>
                    {canWriteSemantic && (
                      <td className="py-3 pl-3 text-right">
                        <button
                          type="button"
                          onClick={() => void handleDeleteMetric(m.id)}
                          aria-label={`Supprimer l’indicateur ${m.label}`}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      )}

      {/* Modal: Connect PostgreSQL / MySQL */}
      <Modal
        open={sourceModalOpen}
        onClose={() => setSourceModalOpen(false)}
        title="Connecter une base de données en lecture seule"
        description="Les identifiants sont chiffrés en AES-256-GCM côté serveur. Utilisez impérativement un compte SQL dédié en lecture seule."
      >
        <form onSubmit={handleCreateSource} className="space-y-4">
          <div>
            <label htmlFor="ds-name" className="block text-sm font-medium text-[#0F172A] mb-1.5">
              Nom de la source
            </label>
            <Input
              id="ds-name"
              required
              placeholder="Ex. : ERP Production PostgreSQL"
              value={newSource.name}
              onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="ds-engine" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Moteur SQL
              </label>
              <Select
                id="ds-engine"
                value={newSource.engine}
                onChange={(e) => {
                  const eng = e.target.value as DbEngine;
                  setNewSource({
                    ...newSource,
                    engine: eng,
                    port: eng === DbEngine.MYSQL ? 3306 : 5432,
                  });
                }}
              >
                <option value={DbEngine.POSTGRESQL}>PostgreSQL</option>
                <option value={DbEngine.MYSQL}>MySQL / MariaDB</option>
              </Select>
            </div>
            <div>
              <label htmlFor="ds-tls" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Mode TLS / SSL
              </label>
              <Select
                id="ds-tls"
                value={newSource.tlsMode}
                onChange={(e) =>
                  setNewSource({
                    ...newSource,
                    tlsMode: e.target.value as 'require' | 'verify-full' | 'prefer',
                  })
                }
              >
                <option value="verify-full">TLS strict (verify-full)</option>
                <option value="require">TLS obligatoire (require)</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3.5">
            <div className="col-span-2">
              <label htmlFor="ds-host" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Hôte / Serveur
              </label>
              <Input
                id="ds-host"
                required
                placeholder="db-readonly.entreprise.fr"
                value={newSource.host}
                onChange={(e) => setNewSource({ ...newSource, host: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="ds-port" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Port
              </label>
              <Input
                id="ds-port"
                type="number"
                required
                value={newSource.port}
                onChange={(e) => setNewSource({ ...newSource, port: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="ds-db" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Base de données
              </label>
              <Input
                id="ds-db"
                required
                placeholder="production_erp"
                value={newSource.databaseName}
                onChange={(e) => setNewSource({ ...newSource, databaseName: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="ds-user" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Utilisateur lecture seule
              </label>
              <Input
                id="ds-user"
                required
                placeholder="datamind_ro"
                value={newSource.username}
                onChange={(e) => setNewSource({ ...newSource, username: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label htmlFor="ds-pass" className="block text-sm font-medium text-[#0F172A] mb-1.5">
              Mot de passe (chiffré AES-256-GCM)
            </label>
            <Input
              id="ds-pass"
              type="password"
              required
              placeholder="••••••••••••"
              value={newSource.password}
              onChange={(e) => setNewSource({ ...newSource, password: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <Button variant="outline" onClick={() => setSourceModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">Enregistrer la source sécurisée</Button>
          </div>
        </form>
      </Modal>

      {/* Modal: New Semantic Metric */}
      <Modal
        open={metricModalOpen}
        onClose={() => setMetricModalOpen(false)}
        title="Définir un indicateur métier sémantique"
        description="Cet indicateur sera automatiquement transmis dans le contexte de l’Assistant IA."
      >
        <form onSubmit={handleAddMetric} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="m-label" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Libellé métier
              </label>
              <Input
                id="m-label"
                required
                placeholder="Panier moyen HT"
                value={newMetric.label}
                onChange={(e) => setNewMetric({ ...newMetric, label: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="m-code" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Code technique
              </label>
              <Input
                id="m-code"
                required
                placeholder="panier_moyen_ht"
                value={newMetric.code}
                onChange={(e) => setNewMetric({ ...newMetric, code: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="m-table" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Table principale
              </label>
              <Input
                id="m-table"
                required
                value={newMetric.tableName}
                onChange={(e) => setNewMetric({ ...newMetric, tableName: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="m-fmt" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Format d’affichage
              </label>
              <Select
                id="m-fmt"
                value={newMetric.format}
                onChange={(e) =>
                  setNewMetric({
                    ...newMetric,
                    format: e.target.value as 'currency' | 'percent' | 'number',
                  })
                }
              >
                <option value="currency">Devise (MAD)</option>
                <option value="percent">Pourcentage (%)</option>
                <option value="number">Nombre</option>
              </Select>
            </div>
          </div>
          <div>
            <label htmlFor="m-sql" className="block text-sm font-medium text-[#0F172A] mb-1.5">
              Expression SQL
            </label>
            <Input
              id="m-sql"
              required
              placeholder="ROUND(AVG(amount_ht), 2)"
              value={newMetric.sqlExpression}
              onChange={(e) => setNewMetric({ ...newMetric, sqlExpression: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="m-desc" className="block text-sm font-medium text-[#0F172A] mb-1.5">
              Description métier
            </label>
            <Input
              id="m-desc"
              placeholder="Montant HT moyen par facture émise."
              value={newMetric.description}
              onChange={(e) => setNewMetric({ ...newMetric, description: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <Button variant="outline" onClick={() => setMetricModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">Ajouter l’indicateur</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
