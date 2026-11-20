-- DataMind AI — Migration PostgreSQL initiale (Multi-Tenant + RLS + Lecture Seule)
-- Compatible PostgreSQL 16+ / SQLAlchemy / Alembic

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  industry VARCHAR(120) NOT NULL DEFAULT 'Entreprise',
  plan VARCHAR(24) NOT NULL CHECK (plan IN ('starter', 'pro', 'enterprise')),
  queries_used INTEGER NOT NULL DEFAULT 0,
  monthly_query_limit INTEGER NOT NULL DEFAULT 500,
  ai_provider VARCHAR(24) NOT NULL DEFAULT 'gemini' CHECK (ai_provider IN ('gemini', 'ollama', 'openai')),
  ai_model VARCHAR(80) NOT NULL DEFAULT 'gemini-4-hydrogen',
  require_tls BOOLEAN NOT NULL DEFAULT TRUE,
  enforce_allowlist BOOLEAN NOT NULL DEFAULT TRUE,
  max_rows_per_query INTEGER NOT NULL DEFAULT 200,
  query_timeout_ms INTEGER NOT NULL DEFAULT 5000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(24) NOT NULL CHECK (role IN ('owner', 'admin', 'analyst', 'viewer')),
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled')),
  is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  engine VARCHAR(24) NOT NULL CHECK (engine IN ('postgresql', 'mysql', 'demo_warehouse')),
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL,
  database_name VARCHAR(120) NOT NULL,
  username VARCHAR(120) NOT NULL,
  encrypted_password TEXT NOT NULL, -- Chiffré AES-256-GCM applicatif
  tls_mode VARCHAR(24) NOT NULL DEFAULT 'verify-full' CHECK (tls_mode IN ('require', 'verify-full', 'prefer')),
  read_only_enforced BOOLEAN NOT NULL DEFAULT TRUE,
  allowlist_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  last_tested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS semantic_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  label VARCHAR(160) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sql_expression TEXT NOT NULL,
  table_name VARCHAR(120) NOT NULL,
  format VARCHAR(24) NOT NULL CHECK (format IN ('currency', 'percent', 'number')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  data_source_id UUID NOT NULL REFERENCES data_sources(id),
  prompt TEXT NOT NULL,
  generated_sql TEXT NOT NULL,
  status VARCHAR(24) NOT NULL CHECK (status IN ('executed', 'blocked', 'error')),
  block_reason TEXT,
  summary TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  execution_ms INTEGER NOT NULL DEFAULT 0,
  provider_used VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category VARCHAR(64) NOT NULL,
  data_source_id UUID NOT NULL REFERENCES data_sources(id),
  sql_query TEXT NOT NULL,
  chart_type VARCHAR(24) NOT NULL CHECK (chart_type IN ('bar', 'line', 'area', 'table')),
  schedule VARCHAR(24) NOT NULL DEFAULT 'weekly',
  created_by VARCHAR(120) NOT NULL,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sku VARCHAR(64) NOT NULL,
  product_name VARCHAR(160) NOT NULL,
  warehouse VARCHAR(120) NOT NULL,
  current_stock INTEGER NOT NULL,
  min_threshold INTEGER NOT NULL,
  days_remaining INTEGER NOT NULL,
  severity VARCHAR(24) NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_email VARCHAR(254) NOT NULL,
  actor_role VARCHAR(24) NOT NULL,
  action VARCHAR(160) NOT NULL,
  resource_type VARCHAR(32) NOT NULL,
  status VARCHAR(24) NOT NULL CHECK (status IN ('allowed', 'blocked', 'error')),
  details TEXT NOT NULL,
  sql_preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index multi-tenant et performance d'audit
CREATE INDEX IF NOT EXISTS idx_data_sources_org ON data_sources (organization_id);
CREATE INDEX IF NOT EXISTS idx_conversations_org_created ON conversations (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs (organization_id, created_at DESC);

-- Isolation Row-Level Security (RLS) par variable de session app.current_org_id
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_data_sources ON data_sources
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
CREATE POLICY tenant_isolation_conversations ON conversations
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
CREATE POLICY tenant_isolation_reports ON reports
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);
