import React, { useEffect, useState } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import { UserRole, type AuthSessionUser, type TeamMember } from '../core/types.ts';
import {
  hasPermission,
  ROLE_DESCRIPTIONS_FR,
  ROLE_LABELS_FR,
  type Permission,
} from '../core/rbac.ts';
import { apiRequest } from '../lib/api.ts';
import { formatDateTimeFr } from '../lib/format.ts';
import { Button, Input, Modal, Select, Surface } from '../components/ui/primitives.tsx';

const MATRIX_ROWS: Array<{ label: string; perm: Permission }> = [
  { label: 'Consulter le tableau de bord et les rapports', perm: 'dashboard:read' },
  { label: 'Interroger l’Assistant IA (SQL lecture seule)', perm: 'assistant:query' },
  { label: 'Créer des rapports et gérer les alertes de stock', perm: 'reports:write' },
  { label: 'Configurer la couche métier sémantique', perm: 'semantic:write' },
  { label: 'Connecter des bases & modifier l’allowlist SQL', perm: 'datasources:write' },
  { label: 'Gérer l’équipe, les rôles et les paramètres', perm: 'team:manage' },
  { label: 'Gérer l’abonnement et les quotas', perm: 'billing:manage' },
];

export function TeamPage({ user }: { user: AuthSessionUser }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [maxMembers, setMaxMembers] = useState(25);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    fullName: '',
    email: '',
    role: UserRole.ANALYST,
  });
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const canManage = hasPermission(user.role, 'team:manage', user.isPlatformAdmin);

  useEffect(() => {
    const load = async () => {
      const res = await apiRequest<{ members: TeamMember[]; maxMembers: number }>('/api/team');
      setMembers(res.members);
      setMaxMembers(res.maxMembers);
    };
    void load();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiRequest<{ member: TeamMember }>('/api/team/invite', {
        method: 'POST',
        body: inviteForm,
      });
      setMembers((prev) => [...prev, res.member]);
      setInviteOpen(false);
      setInviteForm({ fullName: '', email: '', role: UserRole.ANALYST });
      setFeedback({
        type: 'ok',
        text: `Invitation enregistrée pour ${res.member.fullName} (${ROLE_LABELS_FR[res.member.role]}).`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Invitation impossible.',
      });
    }
  };

  const handleRoleChange = async (memberId: string, role: UserRole) => {
    setFeedback(null);
    try {
      const res = await apiRequest<{ member: TeamMember }>(`/api/team/${memberId}/role`, {
        method: 'PATCH',
        body: { role },
      });
      setMembers((prev) => prev.map((m) => (m.id === memberId ? res.member : m)));
      setFeedback({
        type: 'ok',
        text: `Rôle mis à jour pour ${res.member.fullName} : ${ROLE_LABELS_FR[res.member.role]}.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Modification du rôle impossible.',
      });
    }
  };

  const handleRemove = async (member: TeamMember) => {
    setFeedback(null);
    try {
      await apiRequest(`/api/team/${member.id}`, { method: 'DELETE' });
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      setFeedback({ type: 'ok', text: `${member.fullName} a été retiré de l’organisation.` });
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Suppression impossible.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-semibold text-[#0F172A]">
            Membres de {user.organizationName}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5 font-mono tabular-nums">
            {members.length} / {maxMembers} sièges utilisés
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="w-4 h-4" />
            Inviter un collaborateur
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

      {/* Members Table */}
      <Surface className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Collaborateur</th>
                <th className="py-3 px-3">Statut</th>
                <th className="py-3 px-3">Dernière activité</th>
                <th className="py-3 px-3">Rôle RBAC</th>
                {canManage && <th className="py-3 px-4 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/60">
                  <td className="py-3.5 px-4">
                    <p className="font-medium text-[#0F172A]">{m.fullName}</p>
                    <p className="text-xs text-slate-500">{m.email}</p>
                  </td>
                  <td className="py-3.5 px-3 text-xs font-medium whitespace-nowrap">
                    <span className={m.status === 'active' ? 'text-emerald-700' : 'text-amber-700'}>
                      {m.status === 'active' ? 'Actif' : 'Invité'}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-xs text-slate-500 whitespace-nowrap">
                    {formatDateTimeFr(m.lastActiveAt)}
                  </td>
                  <td className="py-3.5 px-3">
                    {canManage && m.id !== user.id ? (
                      <Select
                        aria-label={`Rôle de ${m.fullName}`}
                        value={m.role}
                        onChange={(e) => void handleRoleChange(m.id, e.target.value as UserRole)}
                        className="h-9 max-w-[175px]"
                      >
                        {Object.values(UserRole).map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS_FR[role]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-sm font-medium text-[#0F172A]">
                        {ROLE_LABELS_FR[m.role]}
                      </span>
                    )}
                  </td>
                  {canManage && (
                    <td className="py-3.5 px-4 text-right">
                      {m.id !== user.id && (
                        <button
                          type="button"
                          onClick={() => void handleRemove(m)}
                          aria-label={`Retirer ${m.fullName}`}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* RBAC Permissions Matrix */}
      <Surface className="p-6">
        <h3 className="text-base font-semibold text-[#0F172A] mb-1">
          Matrice des permissions par rôle
        </h3>
        <p className="text-xs text-slate-500 mb-5">
          Les autorisations sont appliquées côté serveur sur chaque route API et journalisées en cas de refus.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-2.5 pr-4">Capacité</th>
                {Object.values(UserRole).map((role) => (
                  <th key={role} className="py-2.5 px-3 text-center whitespace-nowrap">
                    {ROLE_LABELS_FR[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {MATRIX_ROWS.map((row) => (
                <tr key={row.perm}>
                  <td className="py-2.5 pr-4 text-slate-700">{row.label}</td>
                  {Object.values(UserRole).map((role) => {
                    const allowed = hasPermission(role, row.perm, false);
                    return (
                      <td
                        key={role}
                        className={`py-2.5 px-3 text-center text-xs font-medium ${
                          allowed ? 'text-emerald-700' : 'text-slate-300'
                        }`}
                      >
                        {allowed ? 'Autorisé' : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* Invite Modal */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Inviter un collaborateur"
        description="Le membre n’aura accès qu’aux données isolées de votre organisation."
      >
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label htmlFor="inv-name" className="block text-sm font-medium text-[#0F172A] mb-1.5">
              Nom complet
            </label>
            <Input
              id="inv-name"
              required
              placeholder="Nicolas Lefèvre"
              value={inviteForm.fullName}
              onChange={(e) => setInviteForm({ ...inviteForm, fullName: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="inv-email" className="block text-sm font-medium text-[#0F172A] mb-1.5">
              Email professionnel
            </label>
            <Input
              id="inv-email"
              type="email"
              required
              placeholder="nicolas.lefevre@atelier-nord.fr"
              value={inviteForm.email}
              onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="inv-role" className="block text-sm font-medium text-[#0F172A] mb-1.5">
              Rôle initial
            </label>
            <Select
              id="inv-role"
              value={inviteForm.role}
              onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as UserRole })}
            >
              {Object.values(UserRole).map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS_FR[role]} — {ROLE_DESCRIPTIONS_FR[role]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">Envoyer l’invitation</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
