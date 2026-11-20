import React, { useState } from 'react';
import {
  BellRing,
  CreditCard,
  Database,
  FileBarChart2,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { AuthSessionUser } from '../../core/types.ts';
import { ROLE_LABELS_FR } from '../../core/rbac.ts';

export type NavPageId =
  | 'dashboard'
  | 'assistant'
  | 'sources'
  | 'reports'
  | 'alerts'
  | 'team'
  | 'billing'
  | 'settings'
  | 'admin';

export interface NavItemDef {
  id: NavPageId;
  label: string;
  section: 'Pilotage' | 'Données & Gouvernance' | 'Organisation';
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItemDef[] = [
  { id: 'dashboard', label: 'Tableau de bord', section: 'Pilotage', icon: LayoutDashboard },
  { id: 'assistant', label: 'Assistant IA', section: 'Pilotage', icon: MessageSquareText },
  { id: 'reports', label: 'Rapports', section: 'Pilotage', icon: FileBarChart2 },
  { id: 'alerts', label: 'Alertes', section: 'Pilotage', icon: BellRing },
  { id: 'sources', label: 'Sources de données', section: 'Données & Gouvernance', icon: Database },
  { id: 'team', label: 'Équipe et permissions', section: 'Organisation', icon: Users },
  { id: 'billing', label: 'Abonnement', section: 'Organisation', icon: CreditCard },
  { id: 'settings', label: 'Paramètres', section: 'Organisation', icon: Settings },
  { id: 'admin', label: 'Administration', section: 'Organisation', icon: ShieldCheck, adminOnly: true },
];

export function AppShell({
  user,
  activePage,
  onNavigate,
  onLogout,
  activeAlertsCount,
  topAction,
  children,
}: {
  user: AuthSessionUser;
  activePage: NavPageId;
  onNavigate: (page: NavPageId) => void;
  onLogout: () => void;
  activeAlertsCount: number;
  topAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentItem = NAV_ITEMS.find((i) => i.id === activePage) || NAV_ITEMS[0];
  const visibleItems = NAV_ITEMS.filter((i) => !i.adminOnly || user.isPlatformAdmin);
  const sections: Array<NavItemDef['section']> = ['Pilotage', 'Données & Gouvernance', 'Organisation'];

  const initials = user.fullName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-[#0F172A] text-slate-200">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#4F46E5] text-white flex items-center justify-center font-display font-bold text-sm shrink-0">
            DM
          </div>
          <span className="font-display font-semibold text-[15px] tracking-tight text-white whitespace-nowrap">
            DataMind AI
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Fermer le menu"
          className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-5 py-3.5 border-b border-slate-800/80">
        <p className="text-xs text-slate-400">Organisation active</p>
        <p className="text-sm font-medium text-white truncate mt-0.5">{user.organizationName}</p>
      </div>

      <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {sections.map((section) => {
          const items = visibleItems.filter((i) => i.section === section);
          if (!items.length) return null;
          return (
            <div key={section}>
              <p className="px-3 mb-2 text-[11px] font-medium text-slate-400 tracking-wide">
                {section}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = activePage === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onNavigate(item.id);
                          setMobileOpen(false);
                        }}
                        aria-current={active ? 'page' : undefined}
                        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#4F46E5] text-white'
                            : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="truncate whitespace-nowrap">{item.label}</span>
                        </span>
                        {item.id === 'alerts' && activeAlertsCount > 0 && (
                          <span
                            className={`text-xs font-mono tabular-nums ${
                              active ? 'text-indigo-100' : 'text-amber-400'
                            }`}
                          >
                            {activeAlertsCount}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800/80">
        <div className="flex items-center gap-3">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.fullName}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-700"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-slate-800 text-slate-200 flex items-center justify-center text-xs font-semibold shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{user.fullName}</p>
            <p className="text-xs text-slate-400 truncate">{ROLE_LABELS_FR[user.role]}</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Se déconnecter"
            title="Se déconnecter"
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-64 max-w-[82vw] h-full shadow-2xl">{renderSidebarContent()}</div>
          <button
            type="button"
            aria-label="Fermer la navigation"
            className="flex-1 bg-[#0F172A]/45 cursor-pointer"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200/90 px-4 sm:px-8 flex items-center justify-between gap-6 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Ouvrir le menu de navigation"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-[#0F172A] hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                {user.organizationName}
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-display font-semibold text-[#0F172A] truncate">
                {currentItem.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">{topAction}</div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 sm:py-8 max-w-[1360px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
