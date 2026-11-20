import React, { useEffect, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import type { AuthSessionUser } from './core/types.ts';
import { apiRequest, getStoredToken, setStoredToken } from './lib/api.ts';
import { signOutFirebase } from './lib/firebase.ts';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AppShell, type NavPageId } from './components/layout/AppShell.tsx';
import { Button } from './components/ui/primitives.tsx';
import { AuthPages } from './pages/AuthPages.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { AssistantPage } from './pages/AssistantPage.tsx';
import { DataSourcesPage } from './pages/DataSourcesPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { AlertsPage } from './pages/AlertsPage.tsx';
import { TeamPage } from './pages/TeamPage.tsx';
import { BillingPage } from './pages/BillingPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { AdminPage } from './pages/AdminPage.tsx';

function DataMindApp() {
  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [activePage, setActivePage] = useState<NavPageId>('dashboard');
  const [activeAlertsCount, setActiveAlertsCount] = useState(0);

  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      const autostart = params.get('autostart') === '1';
      const token = getStoredToken();

      if (token) {
        try {
          const res = await apiRequest<{ user: AuthSessionUser }>('/api/auth/me', { token });
          setUser(res.user);
          setInitializing(false);
          return;
        } catch {
          setStoredToken(null);
        }
      }

      if (autostart) {
        try {
          const demo = await apiRequest<{ token: string; user: AuthSessionUser }>(
            '/api/auth/demo',
            { method: 'POST', token: null }
          );
          setStoredToken(demo.token);
          setUser(demo.user);
        } catch {
          // Stay on auth screen if autostart fails
        }
      }

      setInitializing(false);
    };
    void init();
  }, []);

  const handleAuthenticated = (token: string, authedUser: AuthSessionUser) => {
    setStoredToken(token);
    setUser(authedUser);
    setActivePage('dashboard');
  };

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {});
    await signOutFirebase();
    setStoredToken(null);
    setUser(null);
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-lg bg-[#4F46E5] text-white font-display font-bold flex items-center justify-center mx-auto">
            DM
          </div>
          <p className="text-sm text-slate-500">Chargement de DataMind AI...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPages onAuthenticated={handleAuthenticated} />;
  }

  return (
    <AppShell
      user={user}
      activePage={activePage}
      onNavigate={setActivePage}
      onLogout={() => void handleLogout()}
      activeAlertsCount={activeAlertsCount}
      topAction={
        activePage !== 'assistant' && activePage !== 'dashboard' ? (
          <Button size="sm" onClick={() => setActivePage('assistant')}>
            <MessageSquareText className="w-3.5 h-3.5" />
            Assistant IA
          </Button>
        ) : undefined
      }
    >
      {activePage === 'dashboard' && (
        <DashboardPage onNavigate={setActivePage} onAlertsCountChange={setActiveAlertsCount} />
      )}
      {activePage === 'assistant' && <AssistantPage user={user} />}
      {activePage === 'sources' && <DataSourcesPage user={user} />}
      {activePage === 'reports' && <ReportsPage user={user} />}
      {activePage === 'alerts' && (
        <AlertsPage user={user} onAlertsCountChange={setActiveAlertsCount} />
      )}
      {activePage === 'team' && <TeamPage user={user} />}
      {activePage === 'billing' && <BillingPage user={user} />}
      {activePage === 'settings' && <SettingsPage user={user} />}
      {activePage === 'admin' && user.isPlatformAdmin && <AdminPage />}
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <DataMindApp />
    </ErrorBoundary>
  );
}
