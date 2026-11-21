import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import {
  AiProvider,
  AlertSeverity,
  AlertStatus,
  DbEngine,
  PlanTier,
  UserRole,
  type AuditLogRecord,
  type AuthSessionUser,
  type ConversationRecord,
  type DataSourceRecord,
  type OrganizationRecord,
  type SavedReport,
  type SemanticMetric,
  type StockAlert,
  type TableAllowlistItem,
  type TeamMember,
} from '../core/types.ts';
import { encryptSecret } from '../core/crypto.ts';
import { PLAN_CATALOG } from '../core/rbac.ts';
import { buildDefaultSemanticMetrics } from '../core/semanticLayer.ts';
import { ensureDemoWarehouse, executeDemoReadOnlyQuery, getDefaultDemoAllowlist } from './demoAnalyticsDb.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SAAS_DB_PATH = path.join(DATA_DIR, 'datamind_saas.sqlite');

let dbInstance: Database.Database | null = null;

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  ensureDemoWarehouse();

  const db = new Database(SAAS_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      industry TEXT NOT NULL,
      plan TEXT NOT NULL,
      queries_used INTEGER NOT NULL DEFAULT 0,
      monthly_query_limit INTEGER NOT NULL DEFAULT 2500,
      ai_provider TEXT NOT NULL DEFAULT 'gemini',
      ai_model TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
      require_tls INTEGER NOT NULL DEFAULT 1,
      enforce_allowlist INTEGER NOT NULL DEFAULT 1,
      max_rows_per_query INTEGER NOT NULL DEFAULT 200,
      query_timeout_ms INTEGER NOT NULL DEFAULT 5000,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      is_platform_admin INTEGER NOT NULL DEFAULT 0,
      avatar_url TEXT,
      last_active_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS data_sources (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      name TEXT NOT NULL,
      engine TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      database_name TEXT NOT NULL,
      username TEXT NOT NULL,
      encrypted_password TEXT NOT NULL,
      tls_mode TEXT NOT NULL,
      read_only_enforced INTEGER NOT NULL DEFAULT 1,
      max_rows INTEGER NOT NULL DEFAULT 200,
      timeout_ms INTEGER NOT NULL DEFAULT 5000,
      status TEXT NOT NULL,
      last_tested_at TEXT NOT NULL,
      tables_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS semantic_metrics (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT NOT NULL,
      sql_expression TEXT NOT NULL,
      table_name TEXT NOT NULL,
      format TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      user_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      data_source_id TEXT NOT NULL,
      data_source_name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      generated_sql TEXT NOT NULL,
      status TEXT NOT NULL,
      block_reason TEXT,
      summary TEXT NOT NULL,
      columns_json TEXT NOT NULL,
      rows_json TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      chart_config_json TEXT,
      execution_ms INTEGER NOT NULL,
      provider_used TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      data_source_id TEXT NOT NULL,
      sql_query TEXT NOT NULL,
      chart_type TEXT NOT NULL,
      schedule TEXT NOT NULL,
      created_by TEXT NOT NULL,
      last_run_at TEXT NOT NULL,
      last_row_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stock_alerts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      sku TEXT NOT NULL,
      product_name TEXT NOT NULL,
      category TEXT NOT NULL,
      warehouse TEXT NOT NULL,
      current_stock INTEGER NOT NULL,
      min_threshold INTEGER NOT NULL,
      daily_run_rate REAL NOT NULL,
      days_remaining INTEGER NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      triggered_at TEXT NOT NULL,
      acknowledged_by TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      organization_name TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      status TEXT NOT NULL,
      details TEXT NOT NULL,
      sql_preview TEXT,
      created_at TEXT NOT NULL
    );
  `);

  seedInitialData(db);
  dbInstance = db;
  return db;
}

function seedInitialData(db: Database.Database): void {
  const existingOrg = db.prepare('SELECT COUNT(*) AS cnt FROM organizations').get() as { cnt: number };
  if (existingOrg.cnt > 0) return;

  const now = new Date().toISOString();
  const org1Id = 'org-atlas-industrie';
  const org2Id = 'org-maghreb-equipements';

  db.prepare(
    `INSERT INTO organizations (id, name, slug, industry, plan, queries_used, monthly_query_limit, ai_provider, ai_model, require_tls, enforce_allowlist, max_rows_per_query, query_timeout_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 200, 5000, ?)`
  ).run(org1Id, 'Atlas Industrie SARL', 'atlas-industrie', 'Distribution industrielle B2B · Casablanca', PlanTier.PRO, 318, 2500, AiProvider.GEMINI, 'gemini-4-hydrogen', now);

  db.prepare(
    `INSERT INTO organizations (id, name, slug, industry, plan, queries_used, monthly_query_limit, ai_provider, ai_model, require_tls, enforce_allowlist, max_rows_per_query, query_timeout_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 200, 5000, ?)`
  ).run(org2Id, 'Maghreb Équipements SA', 'maghreb-equipements', 'Équipement & Mobilier Pro · Rabat', PlanTier.STARTER, 142, 500, AiProvider.GEMINI, 'gemini-4-hydrogen', now);

  const demoPasswordHash = bcrypt.hashSync('DataMind2026!', 10);

  const insertUser = db.prepare(
    `INSERT INTO users (id, organization_id, full_name, email, password_hash, role, status, is_platform_admin, avatar_url, last_active_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insertUser.run(
    'usr-owner-demo',
    org1Id,
    'Salma Benjelloun',
    'salma.benjelloun@atlas-industrie.ma',
    demoPasswordHash,
    UserRole.OWNER,
    'active',
    1,
    '/src/assets/images/avatar_camille_laurent_1795198397828.jpg',
    now,
    now
  );
  insertUser.run('usr-youssef', org1Id, 'Youssef El Amrani', 'youssef.elamrani@atlas-industrie.ma', demoPasswordHash, UserRole.ADMIN, 'active', 0, null, now, now);
  insertUser.run('usr-kenza', org1Id, 'Kenza Berrada', 'kenza.berrada@atlas-industrie.ma', demoPasswordHash, UserRole.ANALYST, 'active', 0, null, now, now);
  insertUser.run('usr-karim', org1Id, 'Karim Tazi', 'karim.tazi@atlas-industrie.ma', demoPasswordHash, UserRole.VIEWER, 'active', 0, null, now, now);
  insertUser.run('usr-nadia', org2Id, 'Nadia Chraïbi', 'nadia.chraibi@maghreb-equipements.ma', demoPasswordHash, UserRole.OWNER, 'active', 0, null, now, now);

  const demoAllowlist = getDefaultDemoAllowlist();
  const ds1Id = 'ds-atlas-demo';
  db.prepare(
    `INSERT INTO data_sources (id, organization_id, name, engine, host, port, database_name, username, encrypted_password, tls_mode, read_only_enforced, max_rows, timeout_ms, status, last_tested_at, tables_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 200, 5000, ?, ?, ?)`
  ).run(
    ds1Id,
    org1Id,
    'Entrepôt Commercial & Stocks (Démo SQL)',
    DbEngine.DEMO_WAREHOUSE,
    'interne-lecture-seule.datamind.ma',
    5432,
    'atlas_industrie_erp',
    'ro_datamind_analyst',
    encryptSecret('ro_demo_credential_protected'),
    'verify-full',
    'connected',
    now,
    JSON.stringify(demoAllowlist)
  );

  db.prepare(
    `INSERT INTO data_sources (id, organization_id, name, engine, host, port, database_name, username, encrypted_password, tls_mode, read_only_enforced, max_rows, timeout_ms, status, last_tested_at, tables_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 200, 5000, ?, ?, ?)`
  ).run(
    'ds-maghreb-demo',
    org2Id,
    'Base Comptable Maghreb (Démo SQL)',
    DbEngine.DEMO_WAREHOUSE,
    'interne-lecture-seule.datamind.ma',
    5432,
    'maghreb_finance',
    'ro_maghreb_reader',
    encryptSecret('ro_maghreb_credential_protected'),
    'require',
    'connected',
    now,
    JSON.stringify(demoAllowlist)
  );

  const insertMetric = db.prepare(
    `INSERT INTO semantic_metrics (id, organization_id, code, label, description, sql_expression, table_name, format, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const orgId of [org1Id, org2Id]) {
    for (const m of buildDefaultSemanticMetrics(orgId)) {
      insertMetric.run(m.id, m.organizationId, m.code, m.label, m.description, m.sqlExpression, m.tableName, m.format, m.updatedAt);
    }
  }

  // Seed 4 real saved reports backed by valid read-only SQL
  const insertReport = db.prepare(
    `INSERT INTO reports (id, organization_id, title, description, category, data_source_id, sql_query, chart_type, schedule, created_by, last_run_at, last_row_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insertReport.run(
    'rep-ca-mensuel',
    org1Id,
    'Évolution mensuelle du chiffre d’affaires et des encaissements',
    'Suivi comparatif du chiffre d’affaires HT facturé et des ventes TTC encaissées mois par mois en 2026.',
    'Finance',
    ds1Id,
    "SELECT substr(issued_at, 1, 7) AS mois, ROUND(SUM(CASE WHEN status != 'cancelled' THEN amount_ht ELSE 0 END), 2) AS chiffre_affaires_ht, ROUND(SUM(CASE WHEN status = 'paid' THEN amount_ttc ELSE 0 END), 2) AS ventes_encaissees_ttc FROM invoices GROUP BY mois ORDER BY mois ASC LIMIT 24",
    'area',
    'weekly',
    'Salma Benjelloun',
    now,
    11
  );
  insertReport.run(
    'rep-marge-categorie',
    org1Id,
    'Marge brute commerciale par catégorie de produits',
    'Analyse de la rentabilité et du taux de marge brute sur les quatre familles produits.',
    'Commercial',
    ds1Id,
    'SELECT p.category AS categorie, ROUND(SUM(oi.unit_price * oi.quantity), 2) AS chiffre_affaires_ht, ROUND(SUM((oi.unit_price - p.unit_cost) * oi.quantity), 2) AS marge_brute, ROUND(100.0 * SUM((oi.unit_price - p.unit_cost) * oi.quantity) / NULLIF(SUM(oi.unit_price * oi.quantity), 0), 1) AS taux_marge_pct FROM order_items oi JOIN products p ON p.id = oi.product_id GROUP BY p.category ORDER BY marge_brute DESC LIMIT 20',
    'bar',
    'monthly',
    'Kenza Berrada',
    now,
    4
  );
  insertReport.run(
    'rep-impayes-clients',
    org1Id,
    'Encours des factures impayées par client',
    'Liste priorisée des comptes présentant des factures en retard ou en attente de règlement.',
    'Trésorerie',
    ds1Id,
    "SELECT c.company_name AS client, c.region AS region, COUNT(i.id) AS nb_factures, ROUND(SUM(i.amount_ttc), 2) AS montant_impaye_ttc FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.status IN ('overdue', 'pending') GROUP BY c.company_name, c.region ORDER BY montant_impaye_ttc DESC LIMIT 50",
    'bar',
    'daily',
    'Youssef El Amrani',
    now,
    8
  );
  insertReport.run(
    'rep-top-regions',
    org1Id,
    'Performance commerciale par région du Maroc',
    'Répartition du chiffre d’affaires HT facturé et du volume de commandes par région.',
    'Commercial',
    ds1Id,
    "SELECT c.region AS region, COUNT(DISTINCT i.order_id) AS commandes, ROUND(SUM(CASE WHEN i.status != 'cancelled' THEN i.amount_ht ELSE 0 END), 2) AS chiffre_affaires_ht FROM invoices i JOIN customers c ON c.id = i.customer_id GROUP BY c.region ORDER BY chiffre_affaires_ht DESC LIMIT 20",
    'bar',
    'weekly',
    'Salma Benjelloun',
    now,
    7
  );

  // Sync initial stock alerts directly from demo warehouse SQL
  syncStockAlertsForOrg(db, org1Id);

  // Seed initial real conversation history record
  const sample1 = executeDemoReadOnlyQuery(
    'SELECT p.category AS categorie, ROUND(SUM((oi.unit_price - p.unit_cost) * oi.quantity), 2) AS marge_brute, ROUND(SUM(oi.unit_price * oi.quantity), 2) AS chiffre_affaires_ht FROM order_items oi JOIN products p ON p.id = oi.product_id GROUP BY p.category ORDER BY marge_brute DESC LIMIT 20'
  );
  db.prepare(
    `INSERT INTO conversations (id, organization_id, user_id, user_email, data_source_id, data_source_name, prompt, generated_sql, status, block_reason, summary, columns_json, rows_json, row_count, chart_config_json, execution_ms, provider_used, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'conv-seed-1',
    org1Id,
    'usr-owner-demo',
    'salma.benjelloun@atlas-industrie.ma',
    ds1Id,
    'Entrepôt Commercial & Stocks (Démo SQL)',
    'Quelle est la marge brute commerciale par catégorie de produits cette année ?',
    'SELECT p.category AS categorie, ROUND(SUM((oi.unit_price - p.unit_cost) * oi.quantity), 2) AS marge_brute, ROUND(SUM(oi.unit_price * oi.quantity), 2) AS chiffre_affaires_ht FROM order_items oi JOIN products p ON p.id = oi.product_id GROUP BY p.category ORDER BY marge_brute DESC LIMIT 20',
    'executed',
    null,
    'Les équipements industriels et les composants réseau génèrent la plus forte contribution en marge brute cumulée sur l’exercice 2026 (montants en MAD).',
    JSON.stringify(sample1.columns),
    JSON.stringify(sample1.rows),
    sample1.rows.length,
    JSON.stringify({
      type: 'bar',
      xKey: 'categorie',
      yKeys: ['marge_brute', 'chiffre_affaires_ht'],
      title: 'Marge brute et chiffre d’affaires HT par catégorie (MAD)',
      valueFormat: 'currency',
    }),
    sample1.executionMs,
    'Gemini (gemini-4-hydrogen)',
    now
  );

  // Seed audit logs
  const insertAudit = db.prepare(
    `INSERT INTO audit_logs (id, organization_id, organization_name, actor_email, actor_role, action, resource_type, status, details, sql_preview, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insertAudit.run(
    'aud-1',
    org1Id,
    'Atlas Industrie SARL',
    'salma.benjelloun@atlas-industrie.ma',
    UserRole.OWNER,
    'Requête analytique exécutée',
    'query',
    'allowed',
    'Analyse marge brute par catégorie validée par pare-feu SQL (4 lignes, lecture seule).',
    'SELECT p.category AS categorie, ROUND(SUM((oi.unit_price - p.unit_cost) * oi.quantity), 2) AS marge_brute...',
    now
  );
  insertAudit.run(
    'aud-2',
    org1Id,
    'Atlas Industrie SARL',
    'kenza.berrada@atlas-industrie.ma',
    UserRole.ANALYST,
    'Tentative d’accès colonne masquée bloquée',
    'query',
    'blocked',
    'Colonne sensible « customers.iban » refusée par la politique d’allowlist.',
    'SELECT company_name, iban FROM customers',
    now
  );
  insertAudit.run(
    'aud-3',
    org1Id,
    'Atlas Industrie SARL',
    'youssef.elamrani@atlas-industrie.ma',
    UserRole.ADMIN,
    'Vérification TLS & chiffrement AES-256-GCM',
    'datasource',
    'allowed',
    'Test de connexion réussi en mode lecture seule sur Entrepôt Commercial & Stocks.',
    null,
    now
  );
  insertAudit.run(
    'aud-4',
    org2Id,
    'Maghreb Équipements SA',
    'nadia.chraibi@maghreb-equipements.ma',
    UserRole.OWNER,
    'Mise à jour de la couche sémantique',
    'semantic',
    'allowed',
    'Synchronisation des 5 indicateurs financiers de référence.',
    null,
    now
  );
}

export function syncStockAlertsForOrg(db: Database.Database, organizationId: string): StockAlert[] {
  const result = executeDemoReadOnlyQuery(`
    SELECT
      p.sku AS sku,
      p.name AS product_name,
      p.category AS category,
      w.name AS warehouse,
      s.quantity_on_hand AS current_stock,
      s.min_threshold AS min_threshold,
      s.daily_run_rate AS daily_run_rate
    FROM stock_levels s
    JOIN products p ON p.id = s.product_id
    JOIN warehouses w ON w.id = s.warehouse_id
    WHERE s.quantity_on_hand < s.min_threshold
    ORDER BY (CAST(s.quantity_on_hand AS REAL) / NULLIF(s.daily_run_rate, 0)) ASC
    LIMIT 50
  `);

  const now = new Date().toISOString();
  const existingMap = new Map<string, { status: string; acknowledged_by: string | null }>();
  const existingRows = db
    .prepare('SELECT id, status, acknowledged_by FROM stock_alerts WHERE organization_id = ?')
    .all(organizationId) as Array<{ id: string; status: string; acknowledged_by: string | null }>;
  for (const r of existingRows) {
    existingMap.set(r.id, { status: r.status, acknowledged_by: r.acknowledged_by });
  }

  const upsert = db.prepare(`
    INSERT INTO stock_alerts (id, organization_id, sku, product_name, category, warehouse, current_stock, min_threshold, daily_run_rate, days_remaining, severity, status, triggered_at, acknowledged_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      current_stock = excluded.current_stock,
      min_threshold = excluded.min_threshold,
      days_remaining = excluded.days_remaining,
      severity = excluded.severity
  `);

  for (const row of result.rows) {
    const sku = String(row.sku);
    const id = `${organizationId}-alert-${sku}`;
    const currentStock = Number(row.current_stock || 0);
    const minThreshold = Number(row.min_threshold || 1);
    const dailyRunRate = Number(row.daily_run_rate || 1);
    const daysRemaining = Math.max(1, Math.floor(currentStock / Math.max(0.1, dailyRunRate)));
    const severity = daysRemaining <= 4 || currentStock <= minThreshold * 0.4 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;
    const prev = existingMap.get(id);
    upsert.run(
      id,
      organizationId,
      sku,
      String(row.product_name),
      String(row.category),
      String(row.warehouse),
      currentStock,
      minThreshold,
      dailyRunRate,
      daysRemaining,
      severity,
      prev?.status || AlertStatus.ACTIVE,
      now,
      prev?.acknowledged_by || null
    );
  }

  return listStockAlerts(organizationId);
}

// === Auth & Sessions ===
export function authenticateWithPassword(email: string, password: string): { token: string; user: AuthSessionUser } | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.*, o.name AS org_name
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       WHERE lower(u.email) = lower(?)`
    )
    .get(email.trim()) as
    | {
        id: string;
        organization_id: string;
        full_name: string;
        email: string;
        password_hash: string;
        role: UserRole;
        is_platform_admin: number;
        avatar_url: string | null;
        org_name: string;
      }
    | undefined;

  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;

  return createSessionForUser(row);
}

export function registerOrganizationAndUser(params: {
  fullName: string;
  email: string;
  password: string;
  organizationName: string;
  industry?: string;
}): { token: string; user: AuthSessionUser } {
  const db = getDb();
  const normalizedEmail = params.email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizedEmail);
  if (existing) {
    throw new Error('Un compte existe déjà avec cette adresse email.');
  }

  const now = new Date().toISOString();
  const orgId = `org-${crypto.randomBytes(5).toString('hex')}`;
  const slug =
    params.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) +
    '-' +
    crypto.randomBytes(2).toString('hex');
  const userId = `usr-${crypto.randomBytes(5).toString('hex')}`;
  const passwordHash = bcrypt.hashSync(params.password, 10);

  db.prepare(
    `INSERT INTO organizations (id, name, slug, industry, plan, queries_used, monthly_query_limit, ai_provider, ai_model, require_tls, enforce_allowlist, max_rows_per_query, query_timeout_ms, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'gemini-4-hydrogen', 1, 1, 200, 5000, ?)`
  ).run(
    orgId,
    params.organizationName.trim(),
    slug,
    params.industry?.trim() || 'Services & Conseil',
    PlanTier.STARTER,
    PLAN_CATALOG[PlanTier.STARTER].monthlyQueryLimit,
    AiProvider.GEMINI,
    now
  );

  const isAdmin = normalizedEmail === 'ramadankarim2131@gmail.com' ? 1 : 0;
  db.prepare(
    `INSERT INTO users (id, organization_id, full_name, email, password_hash, role, status, is_platform_admin, avatar_url, last_active_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, null, ?, ?)`
  ).run(userId, orgId, params.fullName.trim(), normalizedEmail, passwordHash, UserRole.OWNER, isAdmin, now, now);

  // Provision starter demo warehouse source & semantic metrics so new org can query immediately
  const dsId = `ds-${crypto.randomBytes(4).toString('hex')}`;
  db.prepare(
    `INSERT INTO data_sources (id, organization_id, name, engine, host, port, database_name, username, encrypted_password, tls_mode, read_only_enforced, max_rows, timeout_ms, status, last_tested_at, tables_json)
     VALUES (?, ?, ?, ?, ?, 5432, ?, ?, ?, 'verify-full', 1, 200, 5000, 'connected', ?, ?)`
  ).run(
    dsId,
    orgId,
    'Entrepôt analytique de démonstration',
    DbEngine.DEMO_WAREHOUSE,
    'interne-lecture-seule.datamind.local',
    `${slug}_demo`,
    'ro_datamind',
    encryptSecret('ro_starter_protected'),
    now,
    JSON.stringify(getDefaultDemoAllowlist())
  );

  const insertMetric = db.prepare(
    `INSERT INTO semantic_metrics (id, organization_id, code, label, description, sql_expression, table_name, format, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const m of buildDefaultSemanticMetrics(orgId)) {
    insertMetric.run(m.id, m.organizationId, m.code, m.label, m.description, m.sqlExpression, m.tableName, m.format, m.updatedAt);
  }
  syncStockAlertsForOrg(db, orgId);

  logAudit({
    organizationId: orgId,
    organizationName: params.organizationName.trim(),
    actorEmail: normalizedEmail,
    actorRole: UserRole.OWNER,
    action: 'Création d’organisation et compte propriétaire',
    resourceType: 'auth',
    status: 'allowed',
    details: 'Nouvel espace multi-tenant initialisé avec source démo et couche sémantique.',
  });

  return createSessionForUser({
    id: userId,
    organization_id: orgId,
    full_name: params.fullName.trim(),
    email: normalizedEmail,
    role: UserRole.OWNER,
    is_platform_admin: isAdmin,
    avatar_url: null,
    org_name: params.organizationName.trim(),
  });
}

export function syncFirebaseUserSession(params: {
  uid: string;
  email: string;
  fullName: string;
}): { token: string; user: AuthSessionUser } {
  const db = getDb();
  const normalizedEmail = params.email.trim().toLowerCase();
  const existing = db
    .prepare(
      `SELECT u.*, o.name AS org_name
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       WHERE lower(u.email) = ?`
    )
    .get(normalizedEmail) as
    | {
        id: string;
        organization_id: string;
        full_name: string;
        email: string;
        role: UserRole;
        is_platform_admin: number;
        avatar_url: string | null;
        org_name: string;
      }
    | undefined;

  if (existing) {
    return createSessionForUser(existing);
  }

  return registerOrganizationAndUser({
    fullName: params.fullName || normalizedEmail.split('@')[0],
    email: normalizedEmail,
    password: crypto.randomBytes(24).toString('hex'),
    organizationName: `Espace ${params.fullName || 'DataMind'}`,
    industry: 'Entreprise',
  });
}

export function loginDemoAccount(): { token: string; user: AuthSessionUser } {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.*, o.name AS org_name
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       WHERE u.id = 'usr-owner-demo'`
    )
    .get() as {
    id: string;
    organization_id: string;
    full_name: string;
    email: string;
    role: UserRole;
    is_platform_admin: number;
    avatar_url: string | null;
    org_name: string;
  };
  return createSessionForUser(row);
}

function createSessionForUser(row: {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_platform_admin: number;
  avatar_url: string | null;
  org_name: string;
}): { token: string; user: AuthSessionUser } {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    token,
    row.id,
    expiresAt,
    now.toISOString()
  );
  db.prepare('UPDATE users SET last_active_at = ? WHERE id = ?').run(now.toISOString(), row.id);

  return {
    token,
    user: {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      organizationId: row.organization_id,
      organizationName: row.org_name,
      isPlatformAdmin: Boolean(row.is_platform_admin),
      avatarUrl: row.avatar_url || undefined,
    },
  };
}

export function getSessionUser(token: string): AuthSessionUser | null {
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.*, o.name AS org_name, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN organizations o ON o.id = u.organization_id
       WHERE s.token = ?`
    )
    .get(token) as
    | {
        id: string;
        organization_id: string;
        full_name: string;
        email: string;
        role: UserRole;
        is_platform_admin: number;
        avatar_url: string | null;
        org_name: string;
        expires_at: string;
      }
    | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    organizationId: row.organization_id,
    organizationName: row.org_name,
    isPlatformAdmin: Boolean(row.is_platform_admin),
    avatarUrl: row.avatar_url || undefined,
  };
}

export function deleteSession(token: string): void {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// === Organization ===
export function getOrganization(organizationId: string): OrganizationRecord | null {
  const db = getDb();
  const r = db.prepare('SELECT * FROM organizations WHERE id = ?').get(organizationId) as Record<string, unknown> | undefined;
  if (!r) return null;
  return mapOrgRow(r);
}

export function listAllOrganizations(): Array<
  OrganizationRecord & { memberCount: number; dataSourceCount: number; reportCount: number }
> {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM organizations ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return rows.map((r) => {
    const org = mapOrgRow(r);
    const memberCount = (db.prepare('SELECT COUNT(*) AS cnt FROM users WHERE organization_id = ?').get(org.id) as { cnt: number }).cnt;
    const dataSourceCount = (db.prepare('SELECT COUNT(*) AS cnt FROM data_sources WHERE organization_id = ?').get(org.id) as { cnt: number }).cnt;
    const reportCount = (db.prepare('SELECT COUNT(*) AS cnt FROM reports WHERE organization_id = ?').get(org.id) as { cnt: number }).cnt;
    return { ...org, memberCount, dataSourceCount, reportCount };
  });
}

function mapOrgRow(r: Record<string, unknown>): OrganizationRecord {
  return {
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    industry: String(r.industry),
    plan: r.plan as PlanTier,
    queriesUsed: Number(r.queries_used),
    monthlyQueryLimit: Number(r.monthly_query_limit),
    aiProvider: r.ai_provider as AiProvider,
    aiModel: String(r.ai_model),
    requireTls: Boolean(r.require_tls),
    enforceAllowlist: Boolean(r.enforce_allowlist),
    maxRowsPerQuery: Number(r.max_rows_per_query),
    queryTimeoutMs: Number(r.query_timeout_ms),
    createdAt: String(r.created_at),
  };
}

export function updateOrganizationSettings(
  organizationId: string,
  patch: Partial<
    Pick<
      OrganizationRecord,
      'name' | 'industry' | 'aiProvider' | 'aiModel' | 'requireTls' | 'enforceAllowlist' | 'maxRowsPerQuery' | 'queryTimeoutMs'
    >
  >
): OrganizationRecord {
  const db = getDb();
  const current = getOrganization(organizationId);
  if (!current) throw new Error('Organisation introuvable.');

  const next = { ...current, ...patch };
  db.prepare(
    `UPDATE organizations
     SET name = ?, industry = ?, ai_provider = ?, ai_model = ?, require_tls = ?, enforce_allowlist = ?, max_rows_per_query = ?, query_timeout_ms = ?
     WHERE id = ?`
  ).run(
    next.name,
    next.industry,
    next.aiProvider,
    next.aiModel,
    next.requireTls ? 1 : 0,
    next.enforceAllowlist ? 1 : 0,
    Math.max(10, Math.min(1000, next.maxRowsPerQuery)),
    Math.max(1000, Math.min(30000, next.queryTimeoutMs)),
    organizationId
  );
  return getOrganization(organizationId)!;
}

export function updateOrganizationPlan(organizationId: string, plan: PlanTier): OrganizationRecord {
  const db = getDb();
  const def = PLAN_CATALOG[plan];
  db.prepare('UPDATE organizations SET plan = ?, monthly_query_limit = ? WHERE id = ?').run(
    plan,
    def.monthlyQueryLimit,
    organizationId
  );
  return getOrganization(organizationId)!;
}

export function incrementQueryCount(organizationId: string): void {
  const db = getDb();
  db.prepare('UPDATE organizations SET queries_used = queries_used + 1 WHERE id = ?').run(organizationId);
}

// === Data Sources (strictly isolated by organizationId) ===
export function listDataSources(organizationId: string): DataSourceRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM data_sources WHERE organization_id = ? ORDER BY last_tested_at DESC')
    .all(organizationId) as Record<string, unknown>[];
  return rows.map(mapDataSourceRow);
}

export function getDataSourceById(organizationId: string, id: string): DataSourceRecord | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM data_sources WHERE id = ? AND organization_id = ?')
    .get(id, organizationId) as Record<string, unknown> | undefined;
  return row ? mapDataSourceRow(row) : null;
}

function mapDataSourceRow(r: Record<string, unknown>): DataSourceRecord {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    name: String(r.name),
    engine: r.engine as DbEngine,
    host: String(r.host),
    port: Number(r.port),
    databaseName: String(r.database_name),
    username: String(r.username),
    encryptedPassword: String(r.encrypted_password),
    tlsMode: r.tls_mode as 'require' | 'verify-full' | 'prefer',
    readOnlyEnforced: Boolean(r.read_only_enforced),
    maxRows: Number(r.max_rows),
    timeoutMs: Number(r.timeout_ms),
    status: r.status as 'connected' | 'pending' | 'error',
    lastTestedAt: String(r.last_tested_at),
    tables: JSON.parse(String(r.tables_json || '[]')) as TableAllowlistItem[],
  };
}

export function createDataSource(
  organizationId: string,
  input: {
    name: string;
    engine: DbEngine;
    host: string;
    port: number;
    databaseName: string;
    username: string;
    password: string;
    tlsMode: 'require' | 'verify-full' | 'prefer';
    maxRows?: number;
    timeoutMs?: number;
  }
): DataSourceRecord {
  const db = getDb();
  const id = `ds-${crypto.randomBytes(5).toString('hex')}`;
  const now = new Date().toISOString();
  const encryptedPassword = encryptSecret(input.password || 'empty');
  const initialTables = input.engine === DbEngine.DEMO_WAREHOUSE ? getDefaultDemoAllowlist() : [];

  db.prepare(
    `INSERT INTO data_sources (id, organization_id, name, engine, host, port, database_name, username, encrypted_password, tls_mode, read_only_enforced, max_rows, timeout_ms, status, last_tested_at, tables_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
  ).run(
    id,
    organizationId,
    input.name.trim(),
    input.engine,
    input.host.trim(),
    input.port,
    input.databaseName.trim(),
    input.username.trim(),
    encryptedPassword,
    input.tlsMode,
    input.maxRows || 200,
    input.timeoutMs || 5000,
    input.engine === DbEngine.DEMO_WAREHOUSE ? 'connected' : 'pending',
    now,
    JSON.stringify(initialTables)
  );
  return getDataSourceById(organizationId, id)!;
}

export function updateDataSourceStatusAndSchema(
  organizationId: string,
  id: string,
  patch: { status?: 'connected' | 'pending' | 'error'; tables?: TableAllowlistItem[] }
): DataSourceRecord {
  const db = getDb();
  const existing = getDataSourceById(organizationId, id);
  if (!existing) throw new Error('Source de données introuvable dans cette organisation.');

  const now = new Date().toISOString();
  db.prepare(
    'UPDATE data_sources SET status = ?, last_tested_at = ?, tables_json = ? WHERE id = ? AND organization_id = ?'
  ).run(
    patch.status || existing.status,
    now,
    JSON.stringify(patch.tables ?? existing.tables),
    id,
    organizationId
  );
  return getDataSourceById(organizationId, id)!;
}

export function deleteDataSource(organizationId: string, id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM data_sources WHERE id = ? AND organization_id = ?').run(id, organizationId);
}

// === Semantic Metrics ===
export function listSemanticMetrics(organizationId: string): SemanticMetric[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM semantic_metrics WHERE organization_id = ? ORDER BY label ASC')
    .all(organizationId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    organizationId: String(r.organization_id),
    code: String(r.code),
    label: String(r.label),
    description: String(r.description),
    sqlExpression: String(r.sql_expression),
    tableName: String(r.table_name),
    format: r.format as 'currency' | 'percent' | 'number',
    updatedAt: String(r.updated_at),
  }));
}

export function upsertSemanticMetric(
  organizationId: string,
  input: Omit<SemanticMetric, 'id' | 'organizationId' | 'updatedAt'> & { id?: string }
): SemanticMetric {
  const db = getDb();
  const id = input.id || `${organizationId}-metric-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO semantic_metrics (id, organization_id, code, label, description, sql_expression, table_name, format, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       code = excluded.code,
       label = excluded.label,
       description = excluded.description,
       sql_expression = excluded.sql_expression,
       table_name = excluded.table_name,
       format = excluded.format,
       updated_at = excluded.updated_at`
  ).run(
    id,
    organizationId,
    input.code.trim(),
    input.label.trim(),
    input.description.trim(),
    input.sqlExpression.trim(),
    input.tableName.trim(),
    input.format,
    now
  );
  return listSemanticMetrics(organizationId).find((m) => m.id === id)!;
}

export function deleteSemanticMetric(organizationId: string, id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM semantic_metrics WHERE id = ? AND organization_id = ?').run(id, organizationId);
}

// === Conversations ===
export function listConversations(organizationId: string): ConversationRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM conversations WHERE organization_id = ? ORDER BY created_at DESC LIMIT 40')
    .all(organizationId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    organizationId: String(r.organization_id),
    userId: String(r.user_id),
    userEmail: String(r.user_email),
    dataSourceId: String(r.data_source_id),
    dataSourceName: String(r.data_source_name),
    prompt: String(r.prompt),
    generatedSql: String(r.generated_sql),
    status: r.status as 'executed' | 'blocked' | 'error',
    blockReason: r.block_reason ? String(r.block_reason) : undefined,
    summary: String(r.summary),
    columns: JSON.parse(String(r.columns_json || '[]')),
    rows: JSON.parse(String(r.rows_json || '[]')),
    rowCount: Number(r.row_count),
    chartConfig: r.chart_config_json ? JSON.parse(String(r.chart_config_json)) : undefined,
    executionMs: Number(r.execution_ms),
    providerUsed: String(r.provider_used),
    createdAt: String(r.created_at),
  }));
}

export function saveConversation(entry: Omit<ConversationRecord, 'id' | 'createdAt'>): ConversationRecord {
  const db = getDb();
  const id = `conv-${crypto.randomBytes(5).toString('hex')}`;
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO conversations (id, organization_id, user_id, user_email, data_source_id, data_source_name, prompt, generated_sql, status, block_reason, summary, columns_json, rows_json, row_count, chart_config_json, execution_ms, provider_used, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    entry.organizationId,
    entry.userId,
    entry.userEmail,
    entry.dataSourceId,
    entry.dataSourceName,
    entry.prompt,
    entry.generatedSql,
    entry.status,
    entry.blockReason || null,
    entry.summary,
    JSON.stringify(entry.columns),
    JSON.stringify(entry.rows.slice(0, 100)),
    entry.rowCount,
    entry.chartConfig ? JSON.stringify(entry.chartConfig) : null,
    entry.executionMs,
    entry.providerUsed,
    createdAt
  );
  return { ...entry, id, createdAt };
}

// === Reports ===
export function listReports(organizationId: string): SavedReport[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM reports WHERE organization_id = ? ORDER BY last_run_at DESC')
    .all(organizationId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    organizationId: String(r.organization_id),
    title: String(r.title),
    description: String(r.description),
    category: String(r.category),
    dataSourceId: String(r.data_source_id),
    sqlQuery: String(r.sql_query),
    chartType: r.chart_type as 'bar' | 'line' | 'area' | 'table',
    schedule: r.schedule as 'manual' | 'daily' | 'weekly' | 'monthly',
    createdBy: String(r.created_by),
    lastRunAt: String(r.last_run_at),
    lastRowCount: Number(r.last_row_count),
  }));
}

export function createReport(
  organizationId: string,
  input: Omit<SavedReport, 'id' | 'organizationId' | 'lastRunAt' | 'lastRowCount'>
): SavedReport {
  const db = getDb();
  const id = `rep-${crypto.randomBytes(5).toString('hex')}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO reports (id, organization_id, title, description, category, data_source_id, sql_query, chart_type, schedule, created_by, last_run_at, last_row_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(
    id,
    organizationId,
    input.title.trim(),
    input.description.trim(),
    input.category.trim(),
    input.dataSourceId,
    input.sqlQuery.trim(),
    input.chartType,
    input.schedule,
    input.createdBy,
    now
  );
  return listReports(organizationId).find((r) => r.id === id)!;
}

export function updateReportLastRun(organizationId: string, id: string, rowCount: number): void {
  const db = getDb();
  db.prepare('UPDATE reports SET last_run_at = ?, last_row_count = ? WHERE id = ? AND organization_id = ?').run(
    new Date().toISOString(),
    rowCount,
    id,
    organizationId
  );
}

export function deleteReport(organizationId: string, id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM reports WHERE id = ? AND organization_id = ?').run(id, organizationId);
}

// === Stock Alerts ===
export function listStockAlerts(organizationId: string): StockAlert[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM stock_alerts WHERE organization_id = ? ORDER BY days_remaining ASC')
    .all(organizationId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    organizationId: String(r.organization_id),
    sku: String(r.sku),
    productName: String(r.product_name),
    category: String(r.category),
    warehouse: String(r.warehouse),
    currentStock: Number(r.current_stock),
    minThreshold: Number(r.min_threshold),
    dailyRunRate: Number(r.daily_run_rate),
    daysRemaining: Number(r.days_remaining),
    severity: r.severity as AlertSeverity,
    status: r.status as AlertStatus,
    triggeredAt: String(r.triggered_at),
    acknowledgedBy: r.acknowledged_by ? String(r.acknowledged_by) : undefined,
  }));
}

export function refreshStockAlerts(organizationId: string): StockAlert[] {
  return syncStockAlertsForOrg(getDb(), organizationId);
}

export function updateStockAlertStatus(
  organizationId: string,
  alertId: string,
  status: AlertStatus,
  actorName: string
): StockAlert | null {
  const db = getDb();
  db.prepare(
    'UPDATE stock_alerts SET status = ?, acknowledged_by = ? WHERE id = ? AND organization_id = ?'
  ).run(status, actorName, alertId, organizationId);
  return listStockAlerts(organizationId).find((a) => a.id === alertId) || null;
}

// === Team ===
export function listTeamMembers(organizationId: string): TeamMember[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT id, organization_id, full_name, email, role, status, last_active_at, is_platform_admin FROM users WHERE organization_id = ? ORDER BY created_at ASC')
    .all(organizationId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    organizationId: String(r.organization_id),
    fullName: String(r.full_name),
    email: String(r.email),
    role: r.role as UserRole,
    status: r.status as 'active' | 'invited',
    lastActiveAt: String(r.last_active_at),
    isPlatformAdmin: Boolean(r.is_platform_admin),
  }));
}

export function inviteTeamMember(
  organizationId: string,
  input: { fullName: string; email: string; role: UserRole }
): TeamMember {
  const db = getDb();
  const normalizedEmail = input.email.trim().toLowerCase();
  const exists = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizedEmail);
  if (exists) {
    throw new Error('Cet utilisateur est déjà enregistré sur la plateforme.');
  }
  const id = `usr-${crypto.randomBytes(5).toString('hex')}`;
  const now = new Date().toISOString();
  const tempHash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);
  db.prepare(
    `INSERT INTO users (id, organization_id, full_name, email, password_hash, role, status, is_platform_admin, avatar_url, last_active_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'invited', 0, null, ?, ?)`
  ).run(id, organizationId, input.fullName.trim(), normalizedEmail, tempHash, input.role, now, now);
  return listTeamMembers(organizationId).find((m) => m.id === id)!;
}

export function updateMemberRole(organizationId: string, memberId: string, role: UserRole): TeamMember {
  const db = getDb();
  db.prepare('UPDATE users SET role = ? WHERE id = ? AND organization_id = ?').run(role, memberId, organizationId);
  const member = listTeamMembers(organizationId).find((m) => m.id === memberId);
  if (!member) throw new Error('Membre introuvable dans cette organisation.');
  return member;
}

export function removeTeamMember(organizationId: string, memberId: string, actorId: string): void {
  if (memberId === actorId) {
    throw new Error('Vous ne pouvez pas retirer votre propre compte.');
  }
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ? AND organization_id = ?').run(memberId, organizationId);
}

// === Audit Logs ===
export function logAudit(entry: Omit<AuditLogRecord, 'id' | 'createdAt'>): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_logs (id, organization_id, organization_name, actor_email, actor_role, action, resource_type, status, details, sql_preview, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `aud-${crypto.randomBytes(5).toString('hex')}`,
    entry.organizationId,
    entry.organizationName,
    entry.actorEmail,
    entry.actorRole,
    entry.action,
    entry.resourceType,
    entry.status,
    entry.details,
    entry.sqlPreview ? entry.sqlPreview.slice(0, 260) : null,
    new Date().toISOString()
  );
}

export function listAuditLogs(organizationId?: string): AuditLogRecord[] {
  const db = getDb();
  const rows = organizationId
    ? (db
        .prepare('SELECT * FROM audit_logs WHERE organization_id = ? ORDER BY created_at DESC LIMIT 100')
        .all(organizationId) as Record<string, unknown>[])
    : (db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 150').all() as Record<string, unknown>[]);

  return rows.map((r) => ({
    id: String(r.id),
    organizationId: String(r.organization_id),
    organizationName: String(r.organization_name),
    actorEmail: String(r.actor_email),
    actorRole: r.actor_role as UserRole,
    action: String(r.action),
    resourceType: r.resource_type as AuditLogRecord['resourceType'],
    status: r.status as 'allowed' | 'blocked' | 'error',
    details: String(r.details),
    sqlPreview: r.sql_preview ? String(r.sql_preview) : undefined,
    createdAt: String(r.created_at),
  }));
}
