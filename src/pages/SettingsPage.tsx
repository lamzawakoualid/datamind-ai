import React, { useEffect, useState } from 'react';
import { Save, ShieldCheck } from 'lucide-react';
import { AiProvider, type AuthSessionUser, type OrganizationRecord } from '../core/types.ts';
import { hasPermission } from '../core/rbac.ts';
import { apiRequest } from '../lib/api.ts';
import { Button, Input, Select, Surface } from '../components/ui/primitives.tsx';

interface ProviderStatus {
  provider: AiProvider;
  label: string;
  defaultModel: string;
  configured: boolean;
  details: string;
}

export function SettingsPage({ user }: { user: AuthSessionUser }) {
  const [org, setOrg] = useState<OrganizationRecord | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const canManage = hasPermission(user.role, 'settings:manage', user.isPlatformAdmin);

  useEffect(() => {
    const load = async () => {
      const res = await apiRequest<{ organization: OrganizationRecord; providers: ProviderStatus[] }>(
        '/api/settings'
      );
      setOrg(res.organization);
      setProviders(res.providers);
    };
    void load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || !canManage) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ organization: OrganizationRecord }>('/api/settings', {
        method: 'PATCH',
        body: {
          name: org.name,
          industry: org.industry,
          aiProvider: org.aiProvider,
          aiModel: org.aiModel,
          requireTls: org.requireTls,
          enforceAllowlist: org.enforceAllowlist,
          maxRowsPerQuery: org.maxRowsPerQuery,
          queryTimeoutMs: org.queryTimeoutMs,
        },
      });
      setOrg(res.organization);
      setFeedback({
        type: 'ok',
        text: 'Paramètres de l’organisation, du moteur IA et des garde-fous SQL enregistrés.',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Sauvegarde impossible.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!org) {
    return <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
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

      {/* Organization Identity */}
      <Surface className="p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-[#0F172A]">Identité de l’organisation</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Locataire isolé · Identifiant technique : <span className="font-mono">{org.id}</span>
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="set-name" className="block text-sm font-medium text-[#0F172A] mb-1.5">
              Raison sociale
            </label>
            <Input
              id="set-name"
              disabled={!canManage}
              value={org.name}
              onChange={(e) => setOrg({ ...org, name: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="set-ind" className="block text-sm font-medium text-[#0F172A] mb-1.5">
              Secteur d’activité
            </label>
            <Input
              id="set-ind"
              disabled={!canManage}
              value={org.industry}
              onChange={(e) => setOrg({ ...org, industry: e.target.value })}
            />
          </div>
        </div>
      </Surface>

      {/* AI Provider Routing (Server-Side Env Only, Zero Client Keys) */}
      <Surface className="p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-[#0F172A]">
            Moteur d’intelligence artificielle (côté serveur)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Architecture multi-fournisseurs compatible Gemini API, Ollama (Qwen souverain) et OpenAI API. Les clés et URLs sont configurées exclusivement dans les variables d’environnement serveur.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {providers.map((p) => {
            const active = org.aiProvider === p.provider;
            return (
              <button
                key={p.provider}
                type="button"
                disabled={!canManage}
                onClick={() =>
                  setOrg({ ...org, aiProvider: p.provider, aiModel: p.defaultModel })
                }
                className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                  active
                    ? 'border-[#4F46E5] bg-indigo-50/40'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#0F172A]">{p.label}</span>
                  <span
                    className={`text-xs font-medium ${
                      p.configured ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {p.configured ? 'Prêt' : 'À configurer'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">{p.details}</p>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label htmlFor="set-model" className="block text-sm font-medium text-[#0F172A] mb-1.5">
              Modèle cible
            </label>
            <Input
              id="set-model"
              disabled={!canManage}
              value={org.aiModel}
              onChange={(e) => setOrg({ ...org, aiModel: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="set-provider" className="block text-sm font-medium text-[#0F172A] mb-1.5">
              Fournisseur actif
            </label>
            <Select
              id="set-provider"
              disabled={!canManage}
              value={org.aiProvider}
              onChange={(e) => {
                const nextProvider = e.target.value as AiProvider;
                const found = providers.find((p) => p.provider === nextProvider);
                setOrg({
                  ...org,
                  aiProvider: nextProvider,
                  aiModel: found?.defaultModel || org.aiModel,
                });
              }}
            >
              <option value={AiProvider.GEMINI}>Gemini API (Serveur)</option>
              <option value={AiProvider.OLLAMA}>Ollama (Qwen souverain)</option>
              <option value={AiProvider.OPENAI}>OpenAI API</option>
            </Select>
          </div>
        </div>
      </Surface>

      {/* SQL Firewall & Security Policies */}
      <Surface className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#4F46E5]" />
          <h2 className="text-base font-semibold text-[#0F172A]">
            Garde-fous SQL et gouvernance sécurité
          </h2>
        </div>

        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={org.requireTls}
              disabled={!canManage}
              onChange={(e) => setOrg({ ...org, requireTls: e.target.checked })}
              className="mt-1 w-4 h-4 accent-[#4F46E5]"
            />
            <span>
              <span className="block text-sm font-medium text-[#0F172A]">
                Exiger le chiffrement TLS sur toutes les sources externes
              </span>
              <span className="block text-xs text-slate-500">
                Bloque toute connexion PostgreSQL ou MySQL non chiffrée.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={org.enforceAllowlist}
              disabled={!canManage}
              onChange={(e) => setOrg({ ...org, enforceAllowlist: e.target.checked })}
              className="mt-1 w-4 h-4 accent-[#4F46E5]"
            />
            <span>
              <span className="block text-sm font-medium text-[#0F172A]">
                Appliquer strictement l’allowlist tables et colonnes
              </span>
              <span className="block text-xs text-slate-500">
                Rejette côté serveur toute requête référençant une colonne masquée (ex. IBAN) ou SELECT *.
              </span>
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label htmlFor="set-maxrows" className="block text-sm font-medium text-[#0F172A] mb-1.5">
              Limite maximale de lignes par requête
            </label>
            <Input
              id="set-maxrows"
              type="number"
              min={10}
              max={1000}
              disabled={!canManage}
              value={org.maxRowsPerQuery}
              onChange={(e) => setOrg({ ...org, maxRowsPerQuery: Number(e.target.value) })}
            />
          </div>
          <div>
            <label htmlFor="set-timeout" className="block text-sm font-medium text-[#0F172A] mb-1.5">
              Timeout d’exécution SQL (ms)
            </label>
            <Input
              id="set-timeout"
              type="number"
              min={1000}
              max={30000}
              step={500}
              disabled={!canManage}
              value={org.queryTimeoutMs}
              onChange={(e) => setOrg({ ...org, queryTimeoutMs: Number(e.target.value) })}
            />
          </div>
        </div>
      </Surface>

      {canManage && (
        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            <Save className="w-4 h-4" />
            {saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
          </Button>
        </div>
      )}
    </form>
  );
}
