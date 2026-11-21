import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  AiProvider,
  AlertStatus,
  DbEngine,
  PlanTier,
  UserRole,
  type AuthSessionUser,
  type TableAllowlistItem,
} from './src/core/types.ts';
import { detectPromptInjection, validateReadOnlySql } from './src/core/sqlFirewall.ts';
import { checkQueryQuota, hasPermission, PLAN_CATALOG, type Permission } from './src/core/rbac.ts';
import { maskEncryptedPreview } from './src/core/crypto.ts';
import {
  authenticateWithPassword,
  createDataSource,
  createReport,
  deleteDataSource,
  deleteReport,
  deleteSemanticMetric,
  deleteSession,
  getDataSourceById,
  getOrganization,
  getSessionUser,
  incrementQueryCount,
  inviteTeamMember,
  listAllOrganizations,
  listAuditLogs,
  listConversations,
  listDataSources,
  listReports,
  listSemanticMetrics,
  listStockAlerts,
  listTeamMembers,
  logAudit,
  loginDemoAccount,
  refreshStockAlerts,
  registerOrganizationAndUser,
  removeTeamMember,
  saveConversation,
  syncFirebaseUserSession,
  updateDataSourceStatusAndSchema,
  updateMemberRole,
  updateOrganizationPlan,
  updateOrganizationSettings,
  updateReportLastRun,
  updateStockAlertStatus,
  upsertSemanticMetric,
} from './src/server/saasStore.ts';
import { executeDemoReadOnlyQuery } from './src/server/demoAnalyticsDb.ts';
import {
  discoverDataSourceSchema,
  executeReadOnlyQuery,
  testDataSourceConnection,
} from './src/server/connectors.ts';
import {
  buildSafeChartConfig,
  generateResultSynthesis,
  generateSqlPlan,
  getProviderAvailability,
} from './src/server/aiOrchestrator.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AuthedRequest extends Request {
  sessionUser?: AuthSessionUser;
  sessionToken?: string;
}

function extractToken(req: Request): string {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return '';
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  const user = getSessionUser(token);
  if (!user) {
    res.status(401).json({ error: 'Authentification requise. Veuillez vous connecter.' });
    return;
  }
  req.sessionUser = user;
  req.sessionToken = token;
  next();
}

function requirePerm(permission: Permission) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const user = req.sessionUser;
    if (!user) {
      res.status(401).json({ error: 'Session invalide.' });
      return;
    }
    if (!hasPermission(user.role, permission, user.isPlatformAdmin)) {
      logAudit({
        organizationId: user.organizationId,
        organizationName: user.organizationName,
        actorEmail: user.email,
        actorRole: user.role,
        action: `Accès refusé (${permission})`,
        resourceType: 'rbac',
        status: 'blocked',
        details: `Le rôle ${user.role} ne dispose pas de la permission requise.`,
      });
      res.status(403).json({
        error: 'Permissions insuffisantes pour effectuer cette action au sein de votre organisation.',
      });
      return;
    }
    next();
  };
}

function sanitizeSourceForClient(source: ReturnType<typeof listDataSources>[number]) {
  return {
    ...source,
    encryptedPassword: maskEncryptedPreview(source.encryptedPassword),
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // === Healthcheck (Docker / Cloud Run) ===
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'DataMind AI',
      currency: 'MAD',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // === Auth routes ===
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'Veuillez renseigner votre adresse email et votre mot de passe.' });
      return;
    }
    const result = authenticateWithPassword(email, password);
    if (!result) {
      res.status(401).json({ error: 'Identifiants invalides. Vérifiez votre email et votre mot de passe.' });
      return;
    }
    logAudit({
      organizationId: result.user.organizationId,
      organizationName: result.user.organizationName,
      actorEmail: result.user.email,
      actorRole: result.user.role,
      action: 'Connexion réussie',
      resourceType: 'auth',
      status: 'allowed',
      details: 'Session ouverte par email et mot de passe.',
    });
    res.json(result);
  });

  app.post('/api/auth/register', (req, res) => {
    const { fullName, email, password, organizationName, industry } = req.body as {
      fullName?: string;
      email?: string;
      password?: string;
      organizationName?: string;
      industry?: string;
    };
    if (!fullName?.trim() || !email?.trim() || !password || !organizationName?.trim()) {
      res.status(400).json({ error: 'Tous les champs obligatoires doivent être complétés.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
      return;
    }
    try {
      const result = registerOrganizationAndUser({
        fullName,
        email,
        password,
        organizationName,
        industry,
      });
      res.status(201).json(result);
    } catch (err: unknown) {
      res.status(409).json({ error: err instanceof Error ? err.message : 'Erreur lors de l’inscription.' });
    }
  });

  app.post('/api/auth/demo', (_req, res) => {
    const result = loginDemoAccount();
    res.json(result);
  });

  app.post('/api/auth/firebase-sync', (req, res) => {
    const { uid, email, fullName } = req.body as { uid?: string; email?: string; fullName?: string };
    if (!uid || !email) {
      res.status(400).json({ error: 'Profil Google incomplet.' });
      return;
    }
    const result = syncFirebaseUserSession({ uid, email, fullName: fullName || email.split('@')[0] });
    res.json(result);
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const org = getOrganization(user.organizationId);
    res.json({ user, organization: org });
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res) => {
    if (req.sessionToken) deleteSession(req.sessionToken);
    res.json({ ok: true });
  });

  // === Dashboard Overview (live SQL KPIs) ===
  app.get('/api/dashboard/overview', requireAuth, requirePerm('dashboard:read'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const org = getOrganization(user.organizationId)!;

    const kpiInvoices = executeDemoReadOnlyQuery(`
      SELECT
        ROUND(SUM(CASE WHEN status != 'cancelled' THEN amount_ht ELSE 0 END), 2) AS chiffre_affaires_ht,
        ROUND(SUM(CASE WHEN status = 'paid' THEN amount_ttc ELSE 0 END), 2) AS ventes_encaissees_ttc,
        ROUND(SUM(CASE WHEN status IN ('overdue', 'pending') THEN amount_ttc ELSE 0 END), 2) AS factures_impayees_ttc,
        SUM(CASE WHEN status IN ('overdue', 'pending') THEN 1 ELSE 0 END) AS nb_factures_impayees
      FROM invoices
    `).rows[0] || {};

    const kpiMargin = executeDemoReadOnlyQuery(`
      SELECT
        ROUND(SUM((oi.unit_price - p.unit_cost) * oi.quantity), 2) AS marge_brute,
        ROUND(100.0 * SUM((oi.unit_price - p.unit_cost) * oi.quantity) / NULLIF(SUM(oi.unit_price * oi.quantity), 0), 1) AS taux_marge_pct
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
    `).rows[0] || {};

    const monthlyTrend = executeDemoReadOnlyQuery(`
      SELECT
        substr(issued_at, 1, 7) AS mois,
        ROUND(SUM(CASE WHEN status != 'cancelled' THEN amount_ht ELSE 0 END), 2) AS chiffre_affaires_ht,
        ROUND(SUM(CASE WHEN status = 'paid' THEN amount_ttc ELSE 0 END), 2) AS ventes_encaissees_ttc
      FROM invoices
      GROUP BY mois
      ORDER BY mois ASC
    `).rows;

    const categoryBreakdown = executeDemoReadOnlyQuery(`
      SELECT
        p.category AS categorie,
        ROUND(SUM(oi.unit_price * oi.quantity), 2) AS chiffre_affaires_ht,
        ROUND(SUM((oi.unit_price - p.unit_cost) * oi.quantity), 2) AS marge_brute
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      GROUP BY p.category
      ORDER BY chiffre_affaires_ht DESC
    `).rows;

    const overdueInvoices = executeDemoReadOnlyQuery(`
      SELECT
        i.invoice_number AS numero,
        c.company_name AS client,
        c.region AS region,
        i.due_at AS echeance,
        i.amount_ttc AS montant_ttc,
        i.status AS statut
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.status IN ('overdue', 'pending')
      ORDER BY i.amount_ttc DESC
      LIMIT 8
    `).rows;

    const alerts = listStockAlerts(user.organizationId);
    const conversations = listConversations(user.organizationId).slice(0, 5);
    const sources = listDataSources(user.organizationId).map(sanitizeSourceForClient);

    res.json({
      organization: org,
      kpis: {
        chiffreAffairesHt: Number(kpiInvoices.chiffre_affaires_ht || 0),
        ventesEncaisseesTtc: Number(kpiInvoices.ventes_encaissees_ttc || 0),
        facturesImpayeesTtc: Number(kpiInvoices.factures_impayees_ttc || 0),
        nbFacturesImpayees: Number(kpiInvoices.nb_factures_impayees || 0),
        margeBrute: Number(kpiMargin.marge_brute || 0),
        tauxMargePct: Number(kpiMargin.taux_marge_pct || 0),
      },
      monthlyTrend,
      categoryBreakdown,
      overdueInvoices,
      activeAlertsCount: alerts.filter((a) => a.status === AlertStatus.ACTIVE).length,
      criticalAlerts: alerts.filter((a) => a.status !== AlertStatus.RESOLVED).slice(0, 4),
      recentConversations: conversations,
      dataSourcesCount: sources.length,
    });
  });

  // === Conversational AI Assistant ===
  app.get('/api/assistant/conversations', requireAuth, requirePerm('dashboard:read'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    res.json({
      conversations: listConversations(user.organizationId),
      dataSources: listDataSources(user.organizationId).map(sanitizeSourceForClient),
      semanticMetrics: listSemanticMetrics(user.organizationId),
    });
  });

  app.post('/api/assistant/query', requireAuth, requirePerm('assistant:query'), async (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const org = getOrganization(user.organizationId)!;
    const { prompt, dataSourceId } = req.body as { prompt?: string; dataSourceId?: string };

    if (!prompt?.trim()) {
      res.status(400).json({ error: 'Veuillez saisir une question analytique.' });
      return;
    }

    // 1. Quota check
    const quota = checkQueryQuota(org.queriesUsed, org.monthlyQueryLimit);
    if (!quota.allowed) {
      logAudit({
        organizationId: org.id,
        organizationName: org.name,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'Requête refusée (quota atteint)',
        resourceType: 'billing',
        status: 'blocked',
        details: quota.reason || 'Quota dépassé.',
      });
      res.status(429).json({ error: quota.reason });
      return;
    }

    // 2. Tenant-isolated data source resolution
    const sources = listDataSources(org.id);
    const source = dataSourceId ? getDataSourceById(org.id, dataSourceId) : sources[0] || null;
    if (!source) {
      res.status(404).json({ error: 'Aucune source de données disponible pour votre organisation.' });
      return;
    }

    // 3. Anti-prompt-injection guard BEFORE calling any LLM
    const promptGuard = detectPromptInjection(prompt);
    if (!promptGuard.safe) {
      const blockedRecord = saveConversation({
        organizationId: org.id,
        userId: user.id,
        userEmail: user.email,
        dataSourceId: source.id,
        dataSourceName: source.name,
        prompt: prompt.trim(),
        generatedSql: '-- Requête interceptée avant génération SQL',
        status: 'blocked',
        blockReason: promptGuard.reason,
        summary: promptGuard.reason || 'Requête bloquée par la politique de sécurité.',
        columns: [],
        rows: [],
        rowCount: 0,
        executionMs: 0,
        providerUsed: 'Pare-feu DataMind',
      });
      logAudit({
        organizationId: org.id,
        organizationName: org.name,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'Tentative de prompt injection bloquée',
        resourceType: 'query',
        status: 'blocked',
        details: promptGuard.reason || 'Motif suspect détecté.',
        sqlPreview: prompt.trim().slice(0, 180),
      });
      res.json({ conversation: blockedRecord, blocked: true });
      return;
    }

    try {
      // 4. Generate SQL via configured AI provider using ONLY allowlisted schema + semantic metrics
      const metrics = listSemanticMetrics(org.id);
      const plan = await generateSqlPlan({
        prompt: prompt.trim(),
        source,
        metrics,
        provider: org.aiProvider,
        model: org.aiModel,
      });

      // 5. Server-side read-only SQL firewall & allowlist enforcement
      const validation = validateReadOnlySql(
        plan.sql,
        source.tables,
        Math.min(org.maxRowsPerQuery, source.maxRows)
      );
      if (!validation.valid || !validation.sanitizedSql) {
        const blockedRecord = saveConversation({
          organizationId: org.id,
          userId: user.id,
          userEmail: user.email,
          dataSourceId: source.id,
          dataSourceName: source.name,
          prompt: prompt.trim(),
          generatedSql: plan.sql,
          status: 'blocked',
          blockReason: validation.reason,
          summary: `Exécution refusée par le pare-feu SQL : ${validation.reason}`,
          columns: [],
          rows: [],
          rowCount: 0,
          executionMs: 0,
          providerUsed: plan.providerUsed,
        });
        logAudit({
          organizationId: org.id,
          organizationName: org.name,
          actorEmail: user.email,
          actorRole: user.role,
          action: `Requête SQL bloquée (${validation.code})`,
          resourceType: 'query',
          status: 'blocked',
          details: validation.reason || 'Validation SQL échouée.',
          sqlPreview: plan.sql,
        });
        res.json({ conversation: blockedRecord, blocked: true });
        return;
      }

      // 6. Execute validated read-only SQL against target connector
      const execResult = await executeReadOnlyQuery(source, validation.sanitizedSql);
      const chartConfig = buildSafeChartConfig(plan, execResult.columns, execResult.rows);
      const summary = await generateResultSynthesis({
        prompt: prompt.trim(),
        explanation: plan.explanation,
        rows: execResult.rows,
        columns: execResult.columns,
        provider: org.aiProvider,
      });

      incrementQueryCount(org.id);
      const saved = saveConversation({
        organizationId: org.id,
        userId: user.id,
        userEmail: user.email,
        dataSourceId: source.id,
        dataSourceName: source.name,
        prompt: prompt.trim(),
        generatedSql: validation.sanitizedSql,
        status: 'executed',
        summary,
        columns: execResult.columns,
        rows: execResult.rows,
        rowCount: execResult.rows.length,
        chartConfig,
        executionMs: execResult.executionMs,
        providerUsed: plan.providerUsed,
      });

      logAudit({
        organizationId: org.id,
        organizationName: org.name,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'Requête analytique exécutée',
        resourceType: 'query',
        status: 'allowed',
        details: `${execResult.rows.length} ligne(s) retournée(s) en ${execResult.executionMs} ms via ${plan.providerUsed}.`,
        sqlPreview: validation.sanitizedSql,
      });

      res.json({ conversation: saved, blocked: false });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Erreur lors du traitement de la requête analytique.';
      logAudit({
        organizationId: org.id,
        organizationName: org.name,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'Erreur d’exécution analytique',
        resourceType: 'query',
        status: 'error',
        details: errMsg,
      });
      res.status(500).json({ error: errMsg });
    }
  });

  // === Data Sources & Schema Allowlist ===
  app.get('/api/datasources', requireAuth, requirePerm('datasources:read'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    res.json({
      dataSources: listDataSources(user.organizationId).map(sanitizeSourceForClient),
      semanticMetrics: listSemanticMetrics(user.organizationId),
    });
  });

  app.post('/api/datasources', requireAuth, requirePerm('datasources:write'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const org = getOrganization(user.organizationId)!;
    const planLimit = PLAN_CATALOG[org.plan].maxDataSources;
    if (listDataSources(org.id).length >= planLimit) {
      res.status(403).json({
        error: `Limite de ${planLimit} sources atteinte pour votre offre ${PLAN_CATALOG[org.plan].name}.`,
      });
      return;
    }

    const { name, engine, host, port, databaseName, username, password, tlsMode } = req.body as {
      name?: string;
      engine?: DbEngine;
      host?: string;
      port?: number;
      databaseName?: string;
      username?: string;
      password?: string;
      tlsMode?: 'require' | 'verify-full' | 'prefer';
    };

    if (!name?.trim() || !engine || !host?.trim() || !databaseName?.trim() || !username?.trim()) {
      res.status(400).json({ error: 'Veuillez renseigner tous les paramètres de connexion obligatoires.' });
      return;
    }
    if (org.requireTls && tlsMode === 'prefer') {
      res.status(400).json({ error: 'La politique de votre organisation impose TLS obligatoire (require ou verify-full).' });
      return;
    }

    const created = createDataSource(org.id, {
      name,
      engine,
      host,
      port: Number(port) || (engine === DbEngine.MYSQL ? 3306 : 5432),
      databaseName,
      username,
      password: password || '',
      tlsMode: tlsMode || 'verify-full',
      maxRows: org.maxRowsPerQuery,
      timeoutMs: org.queryTimeoutMs,
    });

    logAudit({
      organizationId: org.id,
      organizationName: org.name,
      actorEmail: user.email,
      actorRole: user.role,
      action: `Source de données ajoutée (${engine})`,
      resourceType: 'datasource',
      status: 'allowed',
      details: `Source « ${created.name} » créée avec chiffrement AES-256-GCM et mode ${created.tlsMode}.`,
    });
    res.status(201).json({ dataSource: sanitizeSourceForClient(created) });
  });

  app.post('/api/datasources/:id/test', requireAuth, requirePerm('datasources:write'), async (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const source = getDataSourceById(user.organizationId, String(req.params.id));
    if (!source) {
      res.status(404).json({ error: 'Source de données introuvable.' });
      return;
    }
    const result = await testDataSourceConnection(source);
    const updated = updateDataSourceStatusAndSchema(user.organizationId, source.id, {
      status: result.ok ? 'connected' : 'error',
    });
    logAudit({
      organizationId: user.organizationId,
      organizationName: user.organizationName,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'Test de connexion base de données',
      resourceType: 'datasource',
      status: result.ok ? 'allowed' : 'error',
      details: `${source.name} : ${result.message}`,
    });
    res.json({ result, dataSource: sanitizeSourceForClient(updated) });
  });

  app.post('/api/datasources/:id/discover', requireAuth, requirePerm('datasources:write'), async (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const source = getDataSourceById(user.organizationId, String(req.params.id));
    if (!source) {
      res.status(404).json({ error: 'Source de données introuvable.' });
      return;
    }
    try {
      const tables = await discoverDataSourceSchema(source);
      const updated = updateDataSourceStatusAndSchema(user.organizationId, source.id, {
        status: 'connected',
        tables,
      });
      res.json({ dataSource: sanitizeSourceForClient(updated) });
    } catch (err: unknown) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Impossible de découvrir le schéma de cette source.',
      });
    }
  });

  app.patch('/api/datasources/:id/allowlist', requireAuth, requirePerm('datasources:write'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const source = getDataSourceById(user.organizationId, String(req.params.id));
    if (!source) {
      res.status(404).json({ error: 'Source de données introuvable.' });
      return;
    }
    const { tables } = req.body as { tables?: TableAllowlistItem[] };
    if (!Array.isArray(tables)) {
      res.status(400).json({ error: 'Format allowlist invalide.' });
      return;
    }
    const updated = updateDataSourceStatusAndSchema(user.organizationId, source.id, { tables });
    logAudit({
      organizationId: user.organizationId,
      organizationName: user.organizationName,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'Mise à jour de l’allowlist SQL',
      resourceType: 'datasource',
      status: 'allowed',
      details: `Politique tables/colonnes mise à jour sur « ${source.name} ».`,
    });
    res.json({ dataSource: sanitizeSourceForClient(updated) });
  });

  app.delete('/api/datasources/:id', requireAuth, requirePerm('datasources:write'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    deleteDataSource(user.organizationId, String(req.params.id));
    res.json({ ok: true });
  });

  // === Semantic Metrics Layer ===
  app.post('/api/semantic-metrics', requireAuth, requirePerm('semantic:write'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const { id, code, label, description, sqlExpression, tableName, format } = req.body as {
      id?: string;
      code?: string;
      label?: string;
      description?: string;
      sqlExpression?: string;
      tableName?: string;
      format?: 'currency' | 'percent' | 'number';
    };
    if (!code?.trim() || !label?.trim() || !sqlExpression?.trim() || !tableName?.trim()) {
      res.status(400).json({ error: 'Code, libellé, table et expression SQL sont requis.' });
      return;
    }
    const metric = upsertSemanticMetric(user.organizationId, {
      id,
      code,
      label,
      description: description || '',
      sqlExpression,
      tableName,
      format: format || 'currency',
    });
    logAudit({
      organizationId: user.organizationId,
      organizationName: user.organizationName,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'Indicateur sémantique enregistré',
      resourceType: 'semantic',
      status: 'allowed',
      details: `Indicateur « ${metric.label} » (${metric.code}) défini sur ${metric.tableName}.`,
    });
    res.status(201).json({ metric });
  });

  app.delete('/api/semantic-metrics/:id', requireAuth, requirePerm('semantic:write'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    deleteSemanticMetric(user.organizationId, String(req.params.id));
    res.json({ ok: true });
  });

  // === Reports ===
  app.get('/api/reports', requireAuth, requirePerm('reports:read'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    res.json({
      reports: listReports(user.organizationId),
      dataSources: listDataSources(user.organizationId).map(sanitizeSourceForClient),
    });
  });

  app.post('/api/reports', requireAuth, requirePerm('reports:write'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const { title, description, category, dataSourceId, sqlQuery, chartType, schedule } = req.body as {
      title?: string;
      description?: string;
      category?: string;
      dataSourceId?: string;
      sqlQuery?: string;
      chartType?: 'bar' | 'line' | 'area' | 'table';
      schedule?: 'manual' | 'daily' | 'weekly' | 'monthly';
    };
    if (!title?.trim() || !sqlQuery?.trim() || !dataSourceId) {
      res.status(400).json({ error: 'Titre, source de données et requête SQL lecture seule sont requis.' });
      return;
    }
    const source = getDataSourceById(user.organizationId, dataSourceId);
    if (!source) {
      res.status(404).json({ error: 'Source introuvable.' });
      return;
    }
    const check = validateReadOnlySql(sqlQuery, source.tables, source.maxRows);
    if (!check.valid || !check.sanitizedSql) {
      res.status(400).json({ error: `Requête SQL refusée : ${check.reason}` });
      return;
    }
    const report = createReport(user.organizationId, {
      title,
      description: description || 'Rapport analytique sauvegardé.',
      category: category || 'Finance',
      dataSourceId,
      sqlQuery: check.sanitizedSql,
      chartType: chartType || 'bar',
      schedule: schedule || 'weekly',
      createdBy: user.fullName,
    });
    res.status(201).json({ report });
  });

  app.post('/api/reports/:id/run', requireAuth, requirePerm('reports:read'), async (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const report = listReports(user.organizationId).find((r) => r.id === String(req.params.id));
    if (!report) {
      res.status(404).json({ error: 'Rapport introuvable.' });
      return;
    }
    const source = getDataSourceById(user.organizationId, report.dataSourceId) || listDataSources(user.organizationId)[0];
    if (!source) {
      res.status(404).json({ error: 'Source associée introuvable.' });
      return;
    }
    const check = validateReadOnlySql(report.sqlQuery, source.tables, source.maxRows);
    if (!check.valid || !check.sanitizedSql) {
      res.status(403).json({ error: `Exécution bloquée : ${check.reason}` });
      return;
    }
    try {
      const output = await executeReadOnlyQuery(source, check.sanitizedSql);
      updateReportLastRun(user.organizationId, report.id, output.rows.length);
      res.json({ report, ...output });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur lors de l’exécution du rapport.' });
    }
  });

  app.delete('/api/reports/:id', requireAuth, requirePerm('reports:write'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    deleteReport(user.organizationId, String(req.params.id));
    res.json({ ok: true });
  });

  // === Stock Alerts ===
  app.get('/api/alerts', requireAuth, requirePerm('alerts:read'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    res.json({ alerts: listStockAlerts(user.organizationId) });
  });

  app.post('/api/alerts/sync', requireAuth, requirePerm('alerts:manage'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const alerts = refreshStockAlerts(user.organizationId);
    res.json({ alerts });
  });

  app.patch('/api/alerts/:id/status', requireAuth, requirePerm('alerts:manage'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const { status } = req.body as { status?: AlertStatus };
    if (!status || !Object.values(AlertStatus).includes(status)) {
      res.status(400).json({ error: 'Statut d’alerte invalide.' });
      return;
    }
    const updated = updateStockAlertStatus(user.organizationId, String(req.params.id), status, user.fullName);
    if (!updated) {
      res.status(404).json({ error: 'Alerte introuvable.' });
      return;
    }
    logAudit({
      organizationId: user.organizationId,
      organizationName: user.organizationName,
      actorEmail: user.email,
      actorRole: user.role,
      action: `Alerte stock ${updated.sku} -> ${status}`,
      resourceType: 'alert',
      status: 'allowed',
      details: `Statut mis à jour pour ${updated.productName} (${updated.warehouse}).`,
    });
    res.json({ alert: updated });
  });

  // === Team & RBAC ===
  app.get('/api/team', requireAuth, requirePerm('team:read'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const org = getOrganization(user.organizationId)!;
    res.json({
      members: listTeamMembers(org.id),
      maxMembers: PLAN_CATALOG[org.plan].maxMembers,
    });
  });

  app.post('/api/team/invite', requireAuth, requirePerm('team:manage'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const org = getOrganization(user.organizationId)!;
    const { fullName, email, role } = req.body as { fullName?: string; email?: string; role?: UserRole };
    if (!fullName?.trim() || !email?.trim() || !role || !Object.values(UserRole).includes(role)) {
      res.status(400).json({ error: 'Nom complet, email et rôle valides requis.' });
      return;
    }
    if (listTeamMembers(org.id).length >= PLAN_CATALOG[org.plan].maxMembers) {
      res.status(403).json({ error: 'Nombre maximal de membres atteint pour votre abonnement.' });
      return;
    }
    try {
      const member = inviteTeamMember(org.id, { fullName, email, role });
      logAudit({
        organizationId: org.id,
        organizationName: org.name,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'Invitation d’un membre',
        resourceType: 'rbac',
        status: 'allowed',
        details: `${member.fullName} (${member.email}) invité avec le rôle ${member.role}.`,
      });
      res.status(201).json({ member });
    } catch (err: unknown) {
      res.status(409).json({ error: err instanceof Error ? err.message : 'Invitation impossible.' });
    }
  });

  app.patch('/api/team/:id/role', requireAuth, requirePerm('team:manage'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const { role } = req.body as { role?: UserRole };
    if (!role || !Object.values(UserRole).includes(role)) {
      res.status(400).json({ error: 'Rôle invalide.' });
      return;
    }
    try {
      const member = updateMemberRole(user.organizationId, String(req.params.id), role);
      logAudit({
        organizationId: user.organizationId,
        organizationName: user.organizationName,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'Modification de rôle RBAC',
        resourceType: 'rbac',
        status: 'allowed',
        details: `${member.email} dispose désormais du rôle ${role}.`,
      });
      res.json({ member });
    } catch (err: unknown) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Membre introuvable.' });
    }
  });

  app.delete('/api/team/:id', requireAuth, requirePerm('team:manage'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    try {
      removeTeamMember(user.organizationId, String(req.params.id), user.id);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Suppression impossible.' });
    }
  });

  // === Billing & Quotas ===
  app.get('/api/billing', requireAuth, requirePerm('dashboard:read'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const org = getOrganization(user.organizationId)!;
    const quota = checkQueryQuota(org.queriesUsed, org.monthlyQueryLimit);
    res.json({
      organization: org,
      quota,
      plans: Object.values(PLAN_CATALOG),
      usage: {
        dataSources: listDataSources(org.id).length,
        members: listTeamMembers(org.id).length,
        reports: listReports(org.id).length,
      },
    });
  });

  app.post('/api/billing/plan', requireAuth, requirePerm('billing:manage'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const { plan } = req.body as { plan?: PlanTier };
    if (!plan || !Object.values(PlanTier).includes(plan)) {
      res.status(400).json({ error: 'Forfait invalide.' });
      return;
    }
    const updated = updateOrganizationPlan(user.organizationId, plan);
    logAudit({
      organizationId: updated.id,
      organizationName: updated.name,
      actorEmail: user.email,
      actorRole: user.role,
      action: `Changement d’abonnement -> ${PLAN_CATALOG[plan].name}`,
      resourceType: 'billing',
      status: 'allowed',
      details: `Nouveau quota mensuel : ${updated.monthlyQueryLimit} requêtes IA.`,
    });
    res.json({ organization: updated });
  });

  // === Settings ===
  app.get('/api/settings', requireAuth, requirePerm('dashboard:read'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    res.json({
      organization: getOrganization(user.organizationId),
      providers: getProviderAvailability(),
    });
  });

  app.patch('/api/settings', requireAuth, requirePerm('settings:manage'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const body = req.body as Partial<{
      name: string;
      industry: string;
      aiProvider: AiProvider;
      aiModel: string;
      requireTls: boolean;
      enforceAllowlist: boolean;
      maxRowsPerQuery: number;
      queryTimeoutMs: number;
    }>;
    const updated = updateOrganizationSettings(user.organizationId, body);
    logAudit({
      organizationId: updated.id,
      organizationName: updated.name,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'Mise à jour des paramètres sécurité & IA',
      resourceType: 'auth',
      status: 'allowed',
      details: `Fournisseur IA : ${updated.aiProvider} (${updated.aiModel}), limite ${updated.maxRowsPerQuery} lignes, timeout ${updated.queryTimeoutMs} ms.`,
    });
    res.json({ organization: updated });
  });

  // === SaaS Administration & Audit ===
  app.get('/api/admin/overview', requireAuth, requirePerm('admin:platform'), (_req: AuthedRequest, res) => {
    const organizations = listAllOrganizations();
    const auditLogs = listAuditLogs();
    const totalQueries = organizations.reduce((sum, o) => sum + o.queriesUsed, 0);
    const blockedEvents = auditLogs.filter((l) => l.status === 'blocked').length;
    const mrrMad = organizations.reduce((sum, o) => sum + PLAN_CATALOG[o.plan].monthlyPriceMad, 0);
    res.json({
      metrics: {
        totalOrganizations: organizations.length,
        totalQueries,
        blockedEvents,
        mrrMad,
      },
      organizations,
      auditLogs,
    });
  });

  // === Frontend Serving (Vite Dev Middleware or Static Dist) ===
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`DataMind AI serveur prêt sur http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Échec du démarrage DataMind AI :', err);
  process.exit(1);
});
