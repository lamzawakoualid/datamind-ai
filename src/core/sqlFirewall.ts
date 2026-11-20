import type { TableAllowlistItem } from './types.ts';

export interface PromptGuardResult {
  safe: boolean;
  reason?: string;
  matchedPattern?: string;
}

export interface SqlValidationResult {
  valid: boolean;
  sanitizedSql?: string;
  reason?: string;
  code?:
    | 'EMPTY_SQL'
    | 'MULTI_STATEMENT'
    | 'SQL_COMMENT_BLOCKED'
    | 'NON_READONLY_START'
    | 'FORBIDDEN_KEYWORD'
    | 'SYSTEM_TABLE_BLOCKED'
    | 'TABLE_NOT_ALLOWED'
    | 'COLUMN_NOT_ALLOWED'
    | 'QUERY_TOO_LONG';
  tablesReferenced: string[];
}

const PROMPT_INJECTION_RULES: Array<{ label: string; regex: RegExp }> = [
  {
    label: 'Contournement des instructions système',
    regex: /\b(ignore|oublie|contourne|disregard|override|bypass)\b.{0,45}\b(instructions?|règles?|consignes?|sécurité|système|prompt|rules?|system|guardrails?)\b/i,
  },
  {
    label: 'Tentative de modification ou destruction de base de données',
    regex: /\b(drop\s+table|drop\s+database|truncate\s+table|delete\s+from|alter\s+table|supprime\s+(toutes?\s+les\s+)?(tables?|données|factures|commandes|lignes)|efface\s+(la\s+base|les\s+données)|modifie\s+les\s+prix|mets?\s+à\s+jour\s+la\s+table)\b/i,
  },
  {
    label: 'Tentative d’extraction d’identifiants ou de secrets',
    regex: /\b(mots?\s+de\s+passe|password_hash|passwords?|pg_shadow|pg_authid|mysql\.user|api[_\s-]?key|clé\s+api|secrets?|prompt\s+système|system\s+prompt|variables?\s+d['’]environnement)\b/i,
  },
  {
    label: 'Escalade de privilèges ou mode développeur',
    regex: /\b(mode\s+développeur|developer\s+mode|jailbreak|grant\s+all|superuser|root\s+access|donne[- ]moi\s+les\s+droits\s+admin)\b/i,
  },
];

const FORBIDDEN_SQL_KEYWORDS: RegExp[] = [
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bDROP\b/i,
  /\bALTER\b/i,
  /\bTRUNCATE\b/i,
  /\bCREATE\b/i,
  /\bREPLACE\b/i,
  /\bMERGE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bEXEC\b/i,
  /\bEXECUTE\b/i,
  /\bCALL\b/i,
  /\bCOPY\b/i,
  /\bATTACH\b/i,
  /\bDETACH\b/i,
  /\bPRAGMA\b/i,
  /\bVACUUM\b/i,
  /\bLOAD_FILE\b/i,
  /\bINTO\s+OUTFILE\b/i,
  /\bINTO\s+DUMPFILE\b/i,
  /\bPG_SLEEP\b/i,
  /\bBENCHMARK\b/i,
  /\bWAITFOR\b/i,
  /\bSLEEP\s*\(/i,
  /\bSHUTDOWN\b/i,
  /\bLOCK\s+TABLES\b/i,
];

const SYSTEM_TABLE_PATTERNS: RegExp[] = [
  /\bsqlite_master\b/i,
  /\bsqlite_schema\b/i,
  /\bpg_catalog\b/i,
  /\bpg_shadow\b/i,
  /\bpg_authid\b/i,
  /\bpg_user\b/i,
  /\bpg_roles\b/i,
  /\binformation_schema\b/i,
  /\bmysql\.user\b/i,
  /\bperformance_schema\b/i,
  /\bsys\./i,
];

export function detectPromptInjection(prompt: string): PromptGuardResult {
  const normalized = prompt.trim();
  if (!normalized) {
    return { safe: false, reason: 'La question analytique ne peut pas être vide.' };
  }
  if (normalized.length > 1500) {
    return {
      safe: false,
      reason: 'La question dépasse la limite autorisée de 1 500 caractères.',
      matchedPattern: 'longueur_excessive',
    };
  }
  for (const rule of PROMPT_INJECTION_RULES) {
    if (rule.regex.test(normalized)) {
      return {
        safe: false,
        reason: `Requête bloquée par la protection anti-prompt injection (${rule.label}).`,
        matchedPattern: rule.label,
      };
    }
  }
  return { safe: true };
}

function stripStringLiterals(sql: string): string {
  return sql.replace(/'(?:''|[^'])*'/g, "''").replace(/"(?:""|[^"])*"/g, '""');
}

function extractCteNames(sqlWithoutStrings: string): Set<string> {
  const ctes = new Set<string>();
  const cteRegex = /\b(?:WITH|,)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+AS\s*\(/gi;
  let match: RegExpExecArray | null = cteRegex.exec(sqlWithoutStrings);
  while (match !== null) {
    ctes.add(match[1].toLowerCase());
    match = cteRegex.exec(sqlWithoutStrings);
  }
  return ctes;
}

function extractReferencedTables(sqlWithoutStrings: string): string[] {
  const ctes = extractCteNames(sqlWithoutStrings);
  const tables = new Set<string>();
  const tableRegex = /\b(?:FROM|JOIN)\s+([`"\[]?[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?[`"\]]?)/gi;
  let match: RegExpExecArray | null = tableRegex.exec(sqlWithoutStrings);
  while (match !== null) {
    const raw = match[1].replace(/[`"\[\]]/g, '').toLowerCase();
    // Skip subqueries like FROM (SELECT ...)
    if (raw && !ctes.has(raw)) {
      const tableOnly = raw.includes('.') ? raw.split('.').pop() || raw : raw;
      tables.add(tableOnly);
    }
    match = tableRegex.exec(sqlWithoutStrings);
  }
  return Array.from(tables);
}

function extractTableAliases(sqlWithoutStrings: string): Map<string, string> {
  const aliasMap = new Map<string, string>();
  const reserved = new Set([
    'where', 'join', 'inner', 'left', 'right', 'full', 'outer', 'cross', 'on',
    'group', 'order', 'having', 'limit', 'offset', 'union', 'set', 'as', 'and', 'or',
  ]);
  const regex = /\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+(?:AS\s+)?([a-zA-Z_][a-zA-Z0-9_]*))?/gi;
  let match: RegExpExecArray | null = regex.exec(sqlWithoutStrings);
  while (match !== null) {
    const tableName = match[1].toLowerCase();
    aliasMap.set(tableName, tableName);
    const maybeAlias = match[2]?.toLowerCase();
    if (maybeAlias && !reserved.has(maybeAlias)) {
      aliasMap.set(maybeAlias, tableName);
    }
    match = regex.exec(sqlWithoutStrings);
  }
  return aliasMap;
}

export function validateReadOnlySql(
  rawSql: string,
  allowlist: TableAllowlistItem[],
  maxRows = 200
): SqlValidationResult {
  const trimmed = rawSql.trim();
  if (!trimmed) {
    return {
      valid: false,
      code: 'EMPTY_SQL',
      reason: 'Aucune requête SQL générée.',
      tablesReferenced: [],
    };
  }

  if (trimmed.length > 4000) {
    return {
      valid: false,
      code: 'QUERY_TOO_LONG',
      reason: 'La requête SQL dépasse la taille maximale autorisée (4 000 caractères).',
      tablesReferenced: [],
    };
  }

  // Allow at most one trailing semicolon
  const withoutTrailingSemi = trimmed.replace(/;\s*$/, '').trim();
  const stripped = stripStringLiterals(withoutTrailingSemi);

  // Block SQL comments which could hide malicious statements
  if (/--|\/\*|\*\//.test(stripped)) {
    return {
      valid: false,
      code: 'SQL_COMMENT_BLOCKED',
      reason: 'Les commentaires SQL (-- ou /* */) sont interdits par la politique de sécurité.',
      tablesReferenced: [],
    };
  }

  // Block multi-statements
  if (stripped.includes(';')) {
    return {
      valid: false,
      code: 'MULTI_STATEMENT',
      reason: 'L’exécution de plusieurs instructions SQL séparées par « ; » est strictement interdite.',
      tablesReferenced: [],
    };
  }

  // Must start strictly with SELECT or WITH
  if (!/^(SELECT|WITH)\b/i.test(stripped)) {
    return {
      valid: false,
      code: 'NON_READONLY_START',
      reason: 'Seules les requêtes en lecture seule (SELECT / WITH) sont autorisées.',
      tablesReferenced: [],
    };
  }

  // Block any DDL/DML/admin keywords anywhere in query
  for (const kw of FORBIDDEN_SQL_KEYWORDS) {
    if (kw.test(stripped)) {
      return {
        valid: false,
        code: 'FORBIDDEN_KEYWORD',
        reason: `Commande interdite détectée (${kw.source.replace(/\\b|\\s\*/g, '')}). Seule la lecture seule est autorisée.`,
        tablesReferenced: [],
      };
    }
  }

  // Block system catalog access
  for (const sysPattern of SYSTEM_TABLE_PATTERNS) {
    if (sysPattern.test(stripped)) {
      return {
        valid: false,
        code: 'SYSTEM_TABLE_BLOCKED',
        reason: 'L’accès aux tables système et catalogues internes est interdit.',
        tablesReferenced: [],
      };
    }
  }

  const tablesReferenced = extractReferencedTables(stripped);
  const allowedTablesMap = new Map<string, TableAllowlistItem>();
  for (const tbl of allowlist) {
    if (tbl.allowed) {
      allowedTablesMap.set(tbl.name.toLowerCase(), tbl);
    }
  }

  for (const tbl of tablesReferenced) {
    if (!allowedTablesMap.has(tbl)) {
      return {
        valid: false,
        code: 'TABLE_NOT_ALLOWED',
        reason: `La table « ${tbl} » n’est pas autorisée dans l’allowlist de cette source de données.`,
        tablesReferenced,
      };
    }
  }

  // Check disallowed columns (both qualified table.col and direct sensitive column tokens)
  const aliasMap = extractTableAliases(stripped);
  const disallowedColsByTable = new Map<string, Set<string>>();
  const globalDisallowedCols = new Set<string>();

  for (const tbl of tablesReferenced) {
    const schema = allowedTablesMap.get(tbl);
    if (!schema) continue;
    const blocked = new Set<string>();
    for (const col of schema.columns) {
      if (!col.allowed) {
        blocked.add(col.name.toLowerCase());
        globalDisallowedCols.add(col.name.toLowerCase());
      }
    }
    disallowedColsByTable.set(tbl, blocked);
  }

  // Qualified checks: alias.col or table.col
  const qualRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  let qMatch: RegExpExecArray | null = qualRegex.exec(stripped);
  while (qMatch !== null) {
    const prefix = qMatch[1].toLowerCase();
    const col = qMatch[2].toLowerCase();
    const resolvedTable = aliasMap.get(prefix) || prefix;
    const blockedCols = disallowedColsByTable.get(resolvedTable);
    if (blockedCols && blockedCols.has(col)) {
      return {
        valid: false,
        code: 'COLUMN_NOT_ALLOWED',
        reason: `La colonne « ${resolvedTable}.${col} » est masquée par l’allowlist de sécurité.`,
        tablesReferenced,
      };
    }
    qMatch = qualRegex.exec(stripped);
  }

  // Unqualified check for blocked columns on referenced tables
  for (const blockedCol of globalDisallowedCols) {
    const colTokenRegex = new RegExp(`\\b${blockedCol}\\b`, 'i');
    if (colTokenRegex.test(stripped)) {
      return {
        valid: false,
        code: 'COLUMN_NOT_ALLOWED',
        reason: `La colonne sensible « ${blockedCol} » est exclue par la politique d’allowlist.`,
        tablesReferenced,
      };
    }
  }

  // Also block SELECT * when any referenced table has disallowed columns
  if (/\bSELECT\s+(?:[a-zA-Z_][a-zA-Z0-9_]*\.)?\*/i.test(stripped) && globalDisallowedCols.size > 0) {
    return {
      valid: false,
      code: 'COLUMN_NOT_ALLOWED',
      reason: 'SELECT * est refusé lorsque des colonnes sensibles sont masquées. Sélectionnez explicitement les colonnes autorisées.',
      tablesReferenced,
    };
  }

  // Enforce LIMIT <= maxRows
  const safeCap = Math.max(1, Math.min(maxRows, 1000));
  const limitMatch = /\bLIMIT\s+(\d+)\b/i.exec(withoutTrailingSemi);
  let sanitizedSql = withoutTrailingSemi;
  if (limitMatch) {
    const requested = Number.parseInt(limitMatch[1], 10);
    if (requested > safeCap) {
      sanitizedSql = withoutTrailingSemi.replace(/\bLIMIT\s+\d+\b/i, `LIMIT ${safeCap}`);
    }
  } else {
    sanitizedSql = `${withoutTrailingSemi} LIMIT ${safeCap}`;
  }

  return {
    valid: true,
    sanitizedSql,
    tablesReferenced,
  };
}
