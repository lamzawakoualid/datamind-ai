import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  AiProvider,
  DbEngine,
  type ChartConfig,
  type DataSourceRecord,
  type SemanticMetric,
} from '../core/types.ts';
import { formatSchemaContextForLlm } from '../core/semanticLayer.ts';

export interface GeneratedSqlPlan {
  sql: string;
  explanation: string;
  chartType: 'bar' | 'line' | 'area' | 'table';
  xKey: string;
  yKeys: string[];
  chartTitle: string;
  valueFormat: 'currency' | 'percent' | 'number';
  providerUsed: string;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Clé API Gemini absente de l’environnement serveur. Configurez GEMINI_API_KEY dans le panneau Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getDialectHint(engine: DbEngine): string {
  if (engine === DbEngine.POSTGRESQL) {
    return 'PostgreSQL (utilise TO_CHAR(col, \'YYYY-MM\') pour les mois, COALESCE, NULLIF)';
  }
  if (engine === DbEngine.MYSQL) {
    return 'MySQL 8 (utilise DATE_FORMAT(col, \'%Y-%m\') pour les mois, COALESCE, NULLIF)';
  }
  return "SQLite / ANSI SQL (utilise substr(issued_at, 1, 7) pour les mois 'YYYY-MM', ROUND(..., 2), COALESCE, NULLIF ; les dates sont au format ISO 'YYYY-MM-DD')";
}

function buildSystemInstruction(source: DataSourceRecord, metrics: SemanticMetric[]): string {
  const schemaContext = formatSchemaContextForLlm(source.tables, metrics);
  const dialect = getDialectHint(source.engine);
  return `Tu es DataMind AI, un ingénieur analytique SQL senior francophone.
Ta mission est de traduire une question métier en une unique requête SQL strictement en LECTURE SEULE (SELECT ou WITH) adaptée au dialecte suivant : ${dialect}.

RÈGLES DE SÉCURITÉ STRICTES :
1. Produis UNIQUEMENT une requête SELECT ou WITH en lecture seule. Aucun INSERT, UPDATE, DELETE, DROP, ALTER, PRAGMA ou commentaire SQL (-- ou /* */).
2. Utilise EXCLUSIVEMENT les tables et colonnes listées dans le schéma autorisé ci-dessous. N'utilise JAMAIS SELECT *.
3. Donne des alias de colonnes propres et lisibles en français (snake_case sans accents ni espaces, ex: categorie, chiffre_affaires_ht, marge_brute, mois, client, stock_actuel).
4. Respecte fidèlement la couche métier sémantique fournie ci-dessous (chiffre d'affaires, ventes encaissées, factures impayées, marge brute).
5. Indique la meilleure visualisation (bar, line, area ou table), la colonne d'axe X (xKey), les colonnes numériques Y (yKeys), un titre clair en français (chartTitle) et le format des valeurs (currency, percent ou number).
6. Rédige l'explication en français professionnel concis (2 phrases max). Tous les montants financiers sont exprimés en dirhams marocains (MAD).

${schemaContext}`;
}

export function getProviderAvailability(): Array<{
  provider: AiProvider;
  label: string;
  defaultModel: string;
  configured: boolean;
  details: string;
}> {
  return [
    {
      provider: AiProvider.GEMINI,
      label: 'Gemini API (Serveur)',
      defaultModel: 'gemini-4-hydrogen',
      configured: Boolean(process.env.GEMINI_API_KEY),
      details: process.env.GEMINI_API_KEY
        ? 'Actif côté serveur (gemini-4-hydrogen)'
        : 'Variable GEMINI_API_KEY non définie côté serveur',
    },
    {
      provider: AiProvider.OLLAMA,
      label: 'Ollama (Qwen souverain)',
      defaultModel: process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b',
      configured: Boolean(process.env.OLLAMA_BASE_URL),
      details: process.env.OLLAMA_BASE_URL
        ? `Serveur configuré (${process.env.OLLAMA_BASE_URL})`
        : 'Configurer OLLAMA_BASE_URL dans .env (ex. via Docker Compose)',
    },
    {
      provider: AiProvider.OPENAI,
      label: 'OpenAI API',
      defaultModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      configured: Boolean(process.env.OPENAI_API_KEY),
      details: process.env.OPENAI_API_KEY
        ? `Clé serveur configurée (${process.env.OPENAI_MODEL || 'gpt-4o-mini'})`
        : 'Configurer OPENAI_API_KEY dans les variables serveur',
    },
  ];
}

async function callGeminiWithRetry(
  ai: GoogleGenAI,
  params: {
    contents: string;
    systemInstruction: string;
    responseSchema?: Record<string, unknown>;
    responseMimeType?: string;
  }
): Promise<{ text: string; modelUsed: string }> {
  const candidates: Array<{ model: string; useThinkingLow: boolean }> = [
    { model: 'gemini-4-hydrogen', useThinkingLow: true },
    { model: 'gemini-3.1-flash-lite', useThinkingLow: false },
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const config: Record<string, unknown> = {
          systemInstruction: params.systemInstruction,
        };
        if (candidate.useThinkingLow) {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        }
        if (params.responseMimeType) {
          config.responseMimeType = params.responseMimeType;
        }
        if (params.responseSchema) {
          config.responseSchema = params.responseSchema;
        }

        const response = await ai.models.generateContent({
          model: candidate.model,
          contents: params.contents,
          config,
        });
        return { text: (response.text || '').trim(), modelUsed: candidate.model };
      } catch (err: unknown) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isTransient = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429');
        if (!isTransient) {
          throw new Error(formatFrenchGeminiError(msg));
        }
        await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
      }
    }
  }

  const finalMsg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(formatFrenchGeminiError(finalMsg));
}

function formatFrenchGeminiError(raw: string): string {
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return 'Clé API Gemini invalide ou non autorisée. Vérifiez votre clé dans Settings > Secrets.';
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return 'Quota API Gemini temporairement atteint. Réessayez dans quelques instants ou configurez une clé facturée dans Settings > Secrets.';
  }
  if (raw.includes('503') || raw.includes('UNAVAILABLE')) {
    return 'Le service IA connaît un pic de charge temporaire (503). Veuillez relancer votre question dans quelques secondes.';
  }
  return `Erreur du moteur IA : ${raw.slice(0, 220)}`;
}

export async function generateSqlPlan(params: {
  prompt: string;
  source: DataSourceRecord;
  metrics: SemanticMetric[];
  provider: AiProvider;
  model?: string;
}): Promise<GeneratedSqlPlan> {
  const { prompt, source, metrics, provider, model } = params;
  const systemInstruction = buildSystemInstruction(source, metrics);

  if (provider === AiProvider.OLLAMA) {
    const baseUrl = process.env.OLLAMA_BASE_URL;
    if (!baseUrl) {
      throw new Error(
        'Le fournisseur Ollama (Qwen) n’est pas configuré sur le serveur (variable OLLAMA_BASE_URL manquante). Sélectionnez Gemini API dans Paramètres ou démarrez la stack Docker Compose avec Ollama.'
      );
    }
    const targetModel = model || process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';
    const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: targetModel,
        stream: false,
        format: 'json',
        messages: [
          {
            role: 'system',
            content: `${systemInstruction}\nRéponds uniquement en JSON valide avec les clés : sql, explanation, chartType (bar|line|area|table), xKey, yKeys (tableau de chaînes), chartTitle, valueFormat (currency|percent|number).`,
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!resp.ok) {
      throw new Error(`Erreur Ollama (${resp.status}) : impossible de joindre le modèle ${targetModel}.`);
    }
    const data = (await resp.json()) as { message?: { content?: string } };
    const parsed = JSON.parse(data.message?.content || '{}') as Partial<GeneratedSqlPlan>;
    return normalizePlan(parsed, `Ollama (${targetModel})`);
  }

  if (provider === AiProvider.OPENAI) {
    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      throw new Error(
        'Le fournisseur OpenAI API n’est pas configuré sur le serveur (variable OPENAI_API_KEY manquante). Sélectionnez Gemini API dans Paramètres.'
      );
    }
    const targetModel = model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: targetModel,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${systemInstruction}\nRéponds uniquement en JSON valide avec les clés : sql, explanation, chartType (bar|line|area|table), xKey, yKeys (tableau de chaînes), chartTitle, valueFormat (currency|percent|number).`,
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!resp.ok) {
      throw new Error(`Erreur OpenAI API (${resp.status}) lors de la génération SQL.`);
    }
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}') as Partial<GeneratedSqlPlan>;
    return normalizePlan(parsed, `OpenAI (${targetModel})`);
  }

  // Default: Gemini API server-side (gemini-4-hydrogen with transient retry -> gemini-3.1-flash-lite)
  const ai = getGeminiClient();
  const { text, modelUsed } = await callGeminiWithRetry(ai, {
    contents: `Question utilisateur : ${prompt}`,
    systemInstruction,
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        sql: { type: Type.STRING, description: 'Requête SQL SELECT ou WITH en lecture seule.' },
        explanation: { type: Type.STRING, description: 'Explication métier en français (1-2 phrases).' },
        chartType: {
          type: Type.STRING,
          description: 'Type de graphique recommandé : bar, line, area ou table.',
        },
        xKey: { type: Type.STRING, description: 'Nom exact de la colonne X retournée par la requête.' },
        yKeys: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Liste exacte des colonnes numériques Y retournées par la requête.',
        },
        chartTitle: { type: Type.STRING, description: 'Titre du graphique en français.' },
        valueFormat: {
          type: Type.STRING,
          description: 'Format d’affichage : currency, percent ou number.',
        },
      },
      required: ['sql', 'explanation', 'chartType', 'xKey', 'yKeys', 'chartTitle', 'valueFormat'],
    },
  });

  const parsed = JSON.parse(text || '{}') as Partial<GeneratedSqlPlan>;
  return normalizePlan(parsed, `Gemini (${modelUsed})`);
}

function normalizePlan(parsed: Partial<GeneratedSqlPlan>, providerUsed: string): GeneratedSqlPlan {
  const allowedCharts = ['bar', 'line', 'area', 'table'] as const;
  const chartType = allowedCharts.includes(parsed.chartType as (typeof allowedCharts)[number])
    ? (parsed.chartType as 'bar' | 'line' | 'area' | 'table')
    : 'table';
  const allowedFormats = ['currency', 'percent', 'number'] as const;
  const valueFormat = allowedFormats.includes(parsed.valueFormat as (typeof allowedFormats)[number])
    ? (parsed.valueFormat as 'currency' | 'percent' | 'number')
    : 'number';

  return {
    sql: String(parsed.sql || '').trim(),
    explanation:
      String(parsed.explanation || '').trim() ||
      'Requête SQL générée et validée en lecture seule selon la couche sémantique.',
    chartType,
    xKey: String(parsed.xKey || '').trim(),
    yKeys: Array.isArray(parsed.yKeys) ? parsed.yKeys.map((k) => String(k).trim()).filter(Boolean) : [],
    chartTitle: String(parsed.chartTitle || 'Résultat analytique').trim(),
    valueFormat,
    providerUsed,
  };
}

export async function generateResultSynthesis(params: {
  prompt: string;
  explanation: string;
  rows: Record<string, unknown>[];
  columns: string[];
  provider: AiProvider;
}): Promise<string> {
  const { prompt, explanation, rows, columns, provider } = params;
  if (rows.length === 0) {
    return `${explanation} Aucune ligne ne correspond aux critères demandés sur la période analysée.`;
  }

  // Only invoke Gemini for rich French executive narrative when Gemini is active and key exists
  if (provider === AiProvider.GEMINI && process.env.GEMINI_API_KEY) {
    try {
      const ai = getGeminiClient();
      const previewRows = rows.slice(0, 12);
      const { text } = await callGeminiWithRetry(ai, {
        contents: `Question : ${prompt}\nColonnes : ${columns.join(', ')}\nNombre total de lignes : ${rows.length}\nÉchantillon des résultats (JSON) :\n${JSON.stringify(previewRows)}`,
        systemInstruction:
          'Tu es un directeur analytique francophone. Rédige une synthèse exécutive claire en 2 à 3 phrases maximum en français, en citant précisément les chiffres clés des résultats réels (format marocain/français, MAD pour les montants en dirhams marocains si pertinent). N’invente aucune donnée absente du JSON et n’utilise pas de markdown superflu.',
      });
      if (text) return text;
    } catch {
      // Grounded fallback strictly summarizing SQL execution result count
    }
  }

  return `${explanation} L’exécution en lecture seule a retourné ${rows.length} ligne${rows.length > 1 ? 's' : ''} exploitable${rows.length > 1 ? 's' : ''}.`;
}

export function buildSafeChartConfig(
  plan: GeneratedSqlPlan,
  columns: string[],
  rows: Record<string, unknown>[]
): ChartConfig {
  if (rows.length === 0 || columns.length < 2) {
    return {
      type: 'table',
      xKey: columns[0] || '',
      yKeys: [],
      title: plan.chartTitle,
      valueFormat: plan.valueFormat,
    };
  }

  const xKey = columns.includes(plan.xKey) ? plan.xKey : columns[0];
  const numericCols = columns.filter((col) => {
    if (col === xKey) return false;
    const sample = rows[0]?.[col];
    return typeof sample === 'number' || (typeof sample === 'string' && sample !== '' && !Number.isNaN(Number(sample)));
  });

  const validYKeys = plan.yKeys.filter((k) => numericCols.includes(k));
  const finalYKeys = validYKeys.length > 0 ? validYKeys : numericCols.slice(0, 2);

  if (finalYKeys.length === 0) {
    return {
      type: 'table',
      xKey,
      yKeys: [],
      title: plan.chartTitle,
      valueFormat: plan.valueFormat,
    };
  }

  return {
    type: plan.chartType === 'table' ? 'bar' : plan.chartType,
    xKey,
    yKeys: finalYKeys,
    title: plan.chartTitle,
    valueFormat: plan.valueFormat,
  };
}
