import React, { useState } from 'react';
import { ArrowRight, Lock, ShieldCheck } from 'lucide-react';
import type { AuthSessionUser } from '../core/types.ts';
import { apiRequest } from '../lib/api.ts';
import { signInWithGooglePopup } from '../lib/firebase.ts';
import { Button, Input } from '../components/ui/primitives.tsx';
import { LegalModal, type LegalDocType } from '../components/LegalModal.tsx';

export function AuthPages({
  onAuthenticated,
}: {
  onAuthenticated: (token: string, user: AuthSessionUser) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [industry, setIndustry] = useState('Distribution industrielle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legalDoc, setLegalDoc] = useState<LegalDocType | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await apiRequest<{ token: string; user: AuthSessionUser }>('/api/auth/login', {
          method: 'POST',
          body: { email, password },
          token: null,
        });
        onAuthenticated(res.token, res.user);
      } else {
        const res = await apiRequest<{ token: string; user: AuthSessionUser }>('/api/auth/register', {
          method: 'POST',
          body: { fullName, email, password, organizationName, industry },
          token: null,
        });
        onAuthenticated(res.token, res.user);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur d’authentification.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: AuthSessionUser }>('/api/auth/demo', {
        method: 'POST',
        token: null,
      });
      onAuthenticated(res.token, res.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Impossible d’ouvrir l’espace de démonstration.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const profile = await signInWithGooglePopup();
      const res = await apiRequest<{ token: string; user: AuthSessionUser }>(
        '/api/auth/firebase-sync',
        {
          method: 'POST',
          body: profile,
          token: null,
        }
      );
      onAuthenticated(res.token, res.user);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? `Connexion Google interrompue : ${err.message}`
          : 'Connexion Google impossible.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] grid lg:grid-cols-12 items-stretch">
      {/* Architectural Brand Panel */}
      <div className="hidden lg:flex lg:col-span-5 relative bg-[#0F172A] text-white overflow-hidden flex-col justify-between p-10">
        <img
          src="/src/assets/images/auth_hero_architecture_1795198397909.jpg"
          alt="Architecture contemporaine DataMind AI"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-[#0F172A]/75 to-[#0F172A]/60" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#4F46E5] flex items-center justify-center font-display font-bold text-sm">
            DM
          </div>
          <span className="font-display font-semibold text-lg tracking-tight">DataMind AI</span>
        </div>

        <div className="relative z-10 max-w-md space-y-6">
          <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight">
            Interrogez vos bases métier en français, sous contrôle strict.
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            Connectez PostgreSQL et MySQL en lecture seule, définissez votre couche sémantique financière et laissez vos équipes explorer leurs indicateurs sans jamais exposer vos données sensibles.
          </p>

          <div className="pt-4 border-t border-slate-700/80 space-y-3 text-sm text-slate-200">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <span>Pare-feu SQL lecture seule, allowlist tables/colonnes et protection anti-prompt injection</span>
            </div>
            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <span>Isolation multi-tenant, chiffrement AES-256-GCM des identifiants et connexions TLS</span>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-400">
          DataMind AI · Plateforme analytique souveraine compatible Ollama Qwen, OpenAI et Gemini
        </p>
      </div>

      {/* Form Panel */}
      <div className="lg:col-span-7 flex flex-col justify-center items-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-lg bg-[#4F46E5] text-white flex items-center justify-center font-display font-bold text-sm">
              DM
            </div>
            <span className="font-display font-semibold text-base text-[#0F172A]">DataMind AI</span>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-8" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              Connexion
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              Inscription
            </button>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-display font-bold text-[#0F172A]">
              {mode === 'login' ? 'Accéder à votre espace' : 'Créer votre organisation'}
            </h1>
            <p className="text-sm text-slate-500 mt-1.5">
              {mode === 'login'
                ? 'Connectez-vous à votre organisation DataMind AI.'
                : 'Démarrez avec un espace multi-tenant isolé et un entrepôt de démonstration.'}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label htmlFor="auth-fullname" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                    Nom complet
                  </label>
                  <Input
                    id="auth-fullname"
                    type="text"
                    required
                    placeholder="Nadia Benali"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label htmlFor="auth-org" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                      Organisation
                    </label>
                    <Input
                      id="auth-org"
                      type="text"
                      required
                      placeholder="Groupe Atlas SARL"
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="auth-industry" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                      Secteur d’activité
                    </label>
                    <Input
                      id="auth-industry"
                      type="text"
                      placeholder="Industrie, Finance..."
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Adresse email professionnelle
              </label>
              <Input
                id="auth-email"
                type="email"
                required
                placeholder="salma.benjelloun@atlas-industrie.ma"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Mot de passe
              </label>
              <Input
                id="auth-password"
                type="password"
                required
                minLength={8}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading
                ? 'Vérification en cours...'
                : mode === 'login'
                ? 'Se connecter'
                : 'Créer mon espace DataMind AI'}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
            <div className="h-px flex-1 bg-slate-200" />
            <span>ou accès rapide</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="space-y-2.5">
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={handleDemoLogin}
              disabled={loading}
            >
              Ouvrir l’espace démo (Atlas Industrie SARL)
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              Continuer avec Google
            </Button>
          </div>

          <p className="mt-6 text-xs text-slate-500 text-center">
            Compte démo : <span className="font-mono text-slate-700">salma.benjelloun@atlas-industrie.ma</span> ·{' '}
            <span className="font-mono text-slate-700">DataMind2026!</span>
          </p>

          <div className="mt-5 pt-4 border-t border-slate-200/80 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <button
              type="button"
              onClick={() => setLegalDoc('privacy')}
              className="hover:text-[#0F172A] underline-offset-2 hover:underline cursor-pointer"
            >
              Confidentialité & Loi 09-08 (CNDP)
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setLegalDoc('terms')}
              className="hover:text-[#0F172A] underline-offset-2 hover:underline cursor-pointer"
            >
              Conditions d’utilisation (CGU)
            </button>
          </div>
        </div>
      </div>

      <LegalModal
        open={legalDoc !== null}
        docType={legalDoc || 'privacy'}
        onClose={() => setLegalDoc(null)}
      />
    </div>
  );
}
