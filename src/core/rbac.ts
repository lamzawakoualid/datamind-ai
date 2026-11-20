import { PlanTier, UserRole } from './types.ts';

export type Permission =
  | 'dashboard:read'
  | 'assistant:query'
  | 'datasources:read'
  | 'datasources:write'
  | 'semantic:write'
  | 'reports:read'
  | 'reports:write'
  | 'alerts:read'
  | 'alerts:manage'
  | 'team:read'
  | 'team:manage'
  | 'billing:manage'
  | 'settings:manage'
  | 'admin:platform';

export const ROLE_LABELS_FR: Record<UserRole, string> = {
  [UserRole.OWNER]: 'Propriétaire',
  [UserRole.ADMIN]: 'Administrateur',
  [UserRole.ANALYST]: 'Analyste',
  [UserRole.VIEWER]: 'Lecteur',
};

export const ROLE_DESCRIPTIONS_FR: Record<UserRole, string> = {
  [UserRole.OWNER]: 'Accès complet à l’organisation, facturation, sécurité et gestion des membres.',
  [UserRole.ADMIN]: 'Gestion des sources de données, allowlists, équipe, rapports et paramètres.',
  [UserRole.ANALYST]: 'Interrogation de l’Assistant IA, création de rapports et gestion des alertes.',
  [UserRole.VIEWER]: 'Consultation des tableaux de bord, rapports partagés et alertes de stock.',
};

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.OWNER]: [
    'dashboard:read',
    'assistant:query',
    'datasources:read',
    'datasources:write',
    'semantic:write',
    'reports:read',
    'reports:write',
    'alerts:read',
    'alerts:manage',
    'team:read',
    'team:manage',
    'billing:manage',
    'settings:manage',
  ],
  [UserRole.ADMIN]: [
    'dashboard:read',
    'assistant:query',
    'datasources:read',
    'datasources:write',
    'semantic:write',
    'reports:read',
    'reports:write',
    'alerts:read',
    'alerts:manage',
    'team:read',
    'team:manage',
    'settings:manage',
  ],
  [UserRole.ANALYST]: [
    'dashboard:read',
    'assistant:query',
    'datasources:read',
    'semantic:write',
    'reports:read',
    'reports:write',
    'alerts:read',
    'alerts:manage',
    'team:read',
  ],
  [UserRole.VIEWER]: [
    'dashboard:read',
    'datasources:read',
    'reports:read',
    'alerts:read',
    'team:read',
  ],
};

export function hasPermission(role: UserRole, permission: Permission, isPlatformAdmin = false): boolean {
  if (permission === 'admin:platform') {
    return isPlatformAdmin;
  }
  if (isPlatformAdmin) {
    return true;
  }
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  audience: string;
  monthlyPriceMad: number;
  monthlyQueryLimit: number;
  maxDataSources: number;
  maxMembers: number;
  auditRetentionDays: number;
  supportSla: string;
  features: string[];
}

export const PLAN_CATALOG: Record<PlanTier, PlanDefinition> = {
  [PlanTier.STARTER]: {
    tier: PlanTier.STARTER,
    name: 'Essentiel',
    audience: 'Pour les PME qui structurent leur pilotage',
    monthlyPriceMad: 1490,
    monthlyQueryLimit: 500,
    maxDataSources: 2,
    maxMembers: 5,
    auditRetentionDays: 30,
    supportSla: 'Support email sous 24 h ouvrées',
    features: [
      '500 analyses IA / mois',
      '2 sources PostgreSQL ou MySQL en lecture seule',
      'Pare-feu SQL & allowlist tables/colonnes',
      'Jusqu’à 5 utilisateurs',
      'Historique d’audit sur 30 jours',
    ],
  },
  [PlanTier.PRO]: {
    tier: PlanTier.PRO,
    name: 'Croissance',
    audience: 'Pour les directions finance, commerce et opérations',
    monthlyPriceMad: 3900,
    monthlyQueryLimit: 2500,
    maxDataSources: 8,
    maxMembers: 25,
    auditRetentionDays: 180,
    supportSla: 'Support prioritaire sous 4 h ouvrées',
    features: [
      '2 500 analyses IA / mois',
      '8 sources PostgreSQL / MySQL avec TLS strict',
      'Couche métier sémantique illimitée',
      'Alertes automatiques de rupture de stock',
      'Compatibilité Ollama (Qwen) & OpenAI API',
      'Journal d’audit conservé 180 jours',
    ],
  },
  [PlanTier.ENTERPRISE]: {
    tier: PlanTier.ENTERPRISE,
    name: 'Entreprise',
    audience: 'Pour les groupes multi-filiales et exigences souveraines',
    monthlyPriceMad: 9900,
    monthlyQueryLimit: 15000,
    maxDataSources: 50,
    maxMembers: 200,
    auditRetentionDays: 730,
    supportSla: 'Ingénieur dédié & SLA 99,9 %',
    features: [
      '15 000 analyses IA / mois',
      '50 connecteurs sécurisés + déploiement Docker sur site',
      'Isolation multi-tenant dédiée & RBAC granulaire',
      'Modèles souverains Ollama / Qwen en réseau privé',
      'Rétention d’audit réglementaire 24 mois',
    ],
  },
};

export interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  percentUsed: number;
  reason?: string;
}

export function checkQueryQuota(queriesUsed: number, monthlyQueryLimit: number): QuotaCheckResult {
  const remaining = Math.max(0, monthlyQueryLimit - queriesUsed);
  const percentUsed = monthlyQueryLimit > 0 ? Math.min(100, Math.round((queriesUsed / monthlyQueryLimit) * 100)) : 100;
  if (queriesUsed >= monthlyQueryLimit) {
    return {
      allowed: false,
      remaining: 0,
      percentUsed: 100,
      reason: `Quota mensuel atteint (${queriesUsed}/${monthlyQueryLimit} requêtes). Passez à un forfait supérieur dans Abonnement.`,
    };
  }
  return {
    allowed: true,
    remaining,
    percentUsed,
  };
}
