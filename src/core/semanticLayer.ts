import type { SemanticMetric, TableAllowlistItem } from './types.ts';

export function buildDefaultSemanticMetrics(organizationId: string): SemanticMetric[] {
  const now = new Date().toISOString();
  return [
    {
      id: `${organizationId}-metric-ca`,
      organizationId,
      code: 'chiffre_affaires',
      label: 'Chiffre d’affaires facturé (HT)',
      description: 'Somme des montants HT des factures émises hors avoirs annulés.',
      sqlExpression: "ROUND(SUM(CASE WHEN status != 'cancelled' THEN amount_ht ELSE 0 END), 2)",
      tableName: 'invoices',
      format: 'currency',
      updatedAt: now,
    },
    {
      id: `${organizationId}-metric-encaisse`,
      organizationId,
      code: 'ventes_encaissees',
      label: 'Ventes encaissées (TTC)',
      description: 'Total des factures effectivement réglées (statut = paid).',
      sqlExpression: "ROUND(SUM(CASE WHEN status = 'paid' THEN amount_ttc ELSE 0 END), 2)",
      tableName: 'invoices',
      format: 'currency',
      updatedAt: now,
    },
    {
      id: `${organizationId}-metric-impayes`,
      organizationId,
      code: 'factures_impayees',
      label: 'Factures impayées (TTC)',
      description: 'Encours client des factures en attente ou en retard de règlement (overdue / pending).',
      sqlExpression: "ROUND(SUM(CASE WHEN status IN ('overdue', 'pending') THEN amount_ttc ELSE 0 END), 2)",
      tableName: 'invoices',
      format: 'currency',
      updatedAt: now,
    },
    {
      id: `${organizationId}-metric-marge`,
      organizationId,
      code: 'marge_brute',
      label: 'Marge brute commerciale',
      description: 'Différence entre chiffre d’affaires HT des lignes vendues et coût d’achat unitaire multiplié par la quantité.',
      sqlExpression: 'ROUND(SUM((oi.unit_price - p.unit_cost) * oi.quantity), 2)',
      tableName: 'order_items',
      format: 'currency',
      updatedAt: now,
    },
    {
      id: `${organizationId}-metric-taux-marge`,
      organizationId,
      code: 'taux_marge',
      label: 'Taux de marge brute (%)',
      description: 'Ratio entre la marge brute commerciale et le chiffre d’affaires HT des lignes vendues.',
      sqlExpression: 'ROUND(100.0 * SUM((oi.unit_price - p.unit_cost) * oi.quantity) / NULLIF(SUM(oi.unit_price * oi.quantity), 0), 1)',
      tableName: 'order_items',
      format: 'percent',
      updatedAt: now,
    },
  ];
}

export function formatSchemaContextForLlm(
  tables: TableAllowlistItem[],
  metrics: SemanticMetric[]
): string {
  const allowedTables = tables.filter((t) => t.allowed);
  const schemaLines = allowedTables.map((t) => {
    const allowedCols = t.columns
      .filter((c) => c.allowed)
      .map((c) => `${c.name} (${c.type}${c.description ? ` — ${c.description}` : ''})`)
      .join(', ');
    return `- Table ${t.name}${t.description ? ` [${t.description}]` : ''}: ${allowedCols}`;
  });

  const metricLines = metrics.map(
    (m) => `- ${m.label} (${m.code}) sur ${m.tableName}: ${m.sqlExpression} — ${m.description}`
  );

  return [
    'SCHÉMA AUTORISÉ (ALLOWLIST UNIQUEMENT — NE JAMAIS UTILISER D’AUTRES TABLES OU COLONNES):',
    ...schemaLines,
    '',
    'COUCHE MÉTIER SÉMANTIQUE DE L’ORGANISATION:',
    ...metricLines,
  ].join('\n');
}
