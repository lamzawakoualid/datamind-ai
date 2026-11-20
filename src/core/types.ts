export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  ANALYST = 'analyst',
  VIEWER = 'viewer',
}

export enum PlanTier {
  STARTER = 'starter',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export enum AiProvider {
  GEMINI = 'gemini',
  OLLAMA = 'ollama',
  OPENAI = 'openai',
}

export enum DbEngine {
  DEMO_WAREHOUSE = 'demo_warehouse',
  POSTGRESQL = 'postgresql',
  MYSQL = 'mysql',
}

export enum AlertStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
}

export enum AlertSeverity {
  CRITICAL = 'critical',
  WARNING = 'warning',
  INFO = 'info',
}

export interface ColumnAllowlistItem {
  name: string;
  type: string;
  allowed: boolean;
  sensitive?: boolean;
  description?: string;
}

export interface TableAllowlistItem {
  name: string;
  allowed: boolean;
  rowCount?: number;
  description?: string;
  columns: ColumnAllowlistItem[];
}

export interface DataSourceRecord {
  id: string;
  organizationId: string;
  name: string;
  engine: DbEngine;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  encryptedPassword: string;
  tlsMode: 'require' | 'verify-full' | 'prefer';
  readOnlyEnforced: boolean;
  maxRows: number;
  timeoutMs: number;
  status: 'connected' | 'pending' | 'error';
  lastTestedAt: string;
  tables: TableAllowlistItem[];
}

export interface SemanticMetric {
  id: string;
  organizationId: string;
  code: string;
  label: string;
  description: string;
  sqlExpression: string;
  tableName: string;
  format: 'currency' | 'percent' | 'number';
  updatedAt: string;
}

export interface ChartConfig {
  type: 'bar' | 'line' | 'area' | 'table';
  xKey: string;
  yKeys: string[];
  title: string;
  valueFormat?: 'currency' | 'percent' | 'number';
}

export interface ConversationRecord {
  id: string;
  organizationId: string;
  userId: string;
  userEmail: string;
  dataSourceId: string;
  dataSourceName: string;
  prompt: string;
  generatedSql: string;
  status: 'executed' | 'blocked' | 'error';
  blockReason?: string;
  summary: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  chartConfig?: ChartConfig;
  executionMs: number;
  providerUsed: string;
  createdAt: string;
}

export interface SavedReport {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  category: string;
  dataSourceId: string;
  sqlQuery: string;
  chartType: 'bar' | 'line' | 'area' | 'table';
  schedule: 'manual' | 'daily' | 'weekly' | 'monthly';
  createdBy: string;
  lastRunAt: string;
  lastRowCount: number;
}

export interface StockAlert {
  id: string;
  organizationId: string;
  sku: string;
  productName: string;
  category: string;
  warehouse: string;
  currentStock: number;
  minThreshold: number;
  dailyRunRate: number;
  daysRemaining: number;
  severity: AlertSeverity;
  status: AlertStatus;
  triggeredAt: string;
  acknowledgedBy?: string;
}

export interface TeamMember {
  id: string;
  organizationId: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: 'active' | 'invited';
  lastActiveAt: string;
  isPlatformAdmin?: boolean;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  industry: string;
  plan: PlanTier;
  queriesUsed: number;
  monthlyQueryLimit: number;
  aiProvider: AiProvider;
  aiModel: string;
  requireTls: boolean;
  enforceAllowlist: boolean;
  maxRowsPerQuery: number;
  queryTimeoutMs: number;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  organizationId: string;
  organizationName: string;
  actorEmail: string;
  actorRole: UserRole;
  action: string;
  resourceType: 'query' | 'datasource' | 'auth' | 'rbac' | 'billing' | 'semantic' | 'report' | 'alert';
  status: 'allowed' | 'blocked' | 'error';
  details: string;
  sqlPreview?: string;
  createdAt: string;
}

export interface AuthSessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
  isPlatformAdmin: boolean;
  avatarUrl?: string;
}
