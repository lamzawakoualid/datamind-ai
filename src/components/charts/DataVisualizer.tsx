import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartConfig } from '../../core/types.ts';
import { formatMad, formatNumberFr } from '../../lib/format.ts';

const SERIES_COLORS = ['#4F46E5', '#0F172A', '#0EA5E9', '#64748B'];

function formatMetricVal(val: unknown, format?: ChartConfig['valueFormat']): string {
  const num = Number(val);
  if (!Number.isFinite(num)) return String(val ?? '—');
  if (format === 'currency') return formatMad(num);
  if (format === 'percent') return `${formatNumberFr(num)} %`;
  return formatNumberFr(num);
}

function prettifyColumn(col: string): string {
  return col
    .replace(/_/g, ' ')
    .replace(/\bpct\b/gi, '(%)')
    .replace(/\bht\b/gi, 'HT')
    .replace(/\bttc\b/gi, 'TTC')
    .replace(/^./, (c) => c.toUpperCase());
}

export function DataChart({
  config,
  rows,
  height = 280,
}: {
  config: ChartConfig;
  rows: Record<string, unknown>[];
  height?: number;
}) {
  if (!rows.length || !config.yKeys.length || config.type === 'table') {
    return null;
  }

  const normalized = rows.map((row) => {
    const item: Record<string, unknown> = { ...row };
    for (const key of config.yKeys) {
      item[key] = Number(row[key] ?? 0);
    }
    return item;
  });

  const axisTickStyle = { fontSize: 12, fill: '#64748B' };
  const formatYAxis = (v: number) => {
    if (config.valueFormat === 'currency') {
      if (Math.abs(v) >= 1_000_000) {
        return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M MAD`;
      }
      return Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k MAD` : `${v} MAD`;
    }
    if (config.valueFormat === 'percent') return `${v} %`;
    return formatNumberFr(v);
  };

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {config.type === 'line' ? (
          <LineChart data={normalized} margin={{ top: 10, right: 16, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey={config.xKey} tick={axisTickStyle} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
            <YAxis tickFormatter={formatYAxis} tick={axisTickStyle} axisLine={false} tickLine={false} width={86} />
            <Tooltip
              formatter={(value: unknown, name?: string | number) => [
                formatMetricVal(value, config.valueFormat),
                prettifyColumn(String(name ?? '')),
              ]}
              contentStyle={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                fontSize: '12px',
              }}
            />
            {config.yKeys.length > 1 && <Legend formatter={(v) => prettifyColumn(String(v))} wrapperStyle={{ fontSize: 12 }} />}
            {config.yKeys.map((key, idx) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
                strokeWidth={2.25}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        ) : config.type === 'area' ? (
          <AreaChart data={normalized} margin={{ top: 10, right: 16, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey={config.xKey} tick={axisTickStyle} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
            <YAxis tickFormatter={formatYAxis} tick={axisTickStyle} axisLine={false} tickLine={false} width={86} />
            <Tooltip
              formatter={(value: unknown, name?: string | number) => [
                formatMetricVal(value, config.valueFormat),
                prettifyColumn(String(name ?? '')),
              ]}
              contentStyle={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                fontSize: '12px',
              }}
            />
            {config.yKeys.length > 1 && <Legend formatter={(v) => prettifyColumn(String(v))} wrapperStyle={{ fontSize: 12 }} />}
            {config.yKeys.map((key, idx) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
                fill={SERIES_COLORS[idx % SERIES_COLORS.length]}
                fillOpacity={idx === 0 ? 0.14 : 0.06}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        ) : (
          <BarChart data={normalized} margin={{ top: 10, right: 16, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey={config.xKey} tick={axisTickStyle} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
            <YAxis tickFormatter={formatYAxis} tick={axisTickStyle} axisLine={false} tickLine={false} width={86} />
            <Tooltip
              formatter={(value: unknown, name?: string | number) => [
                formatMetricVal(value, config.valueFormat),
                prettifyColumn(String(name ?? '')),
              ]}
              contentStyle={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                fontSize: '12px',
              }}
            />
            {config.yKeys.length > 1 && <Legend formatter={(v) => prettifyColumn(String(v))} wrapperStyle={{ fontSize: 12 }} />}
            {config.yKeys.map((key, idx) => (
              <Bar
                key={key}
                dataKey={key}
                fill={SERIES_COLORS[idx % SERIES_COLORS.length]}
                radius={[4, 4, 0, 0]}
                maxBarSize={44}
              />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function DataResultTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
}) {
  if (!columns.length || !rows.length) {
    return (
      <p className="text-sm text-slate-500 py-6 text-center">
        Aucune donnée à afficher pour cette requête.
      </p>
    );
  }

  const isNumericCol = (col: string) =>
    rows.slice(0, 5).every((r) => r[col] === null || r[col] === undefined || typeof r[col] === 'number');

  const isMoneyCol = (col: string) =>
    /montant|chiffre|marge|ventes|ca|prix|cout|amount|total|impaye/i.test(col) && !/nb|count|pct|taux/i.test(col);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/70">
            {columns.map((col) => (
              <th
                key={col}
                className={`py-2.5 px-3.5 text-xs font-semibold text-slate-600 whitespace-nowrap ${
                  isNumericCol(col) ? 'text-right' : 'text-left'
                }`}
              >
                {prettifyColumn(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, idx) => (
            <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
              {columns.map((col) => {
                const raw = row[col];
                const numeric = typeof raw === 'number';
                let formatted = raw === null || raw === undefined ? '—' : String(raw);
                if (numeric) {
                  if (isMoneyCol(col)) formatted = formatMad(raw);
                  else if (/pct|taux/i.test(col)) formatted = `${formatNumberFr(raw)} %`;
                  else formatted = formatNumberFr(raw);
                }
                return (
                  <td
                    key={col}
                    className={`py-2.5 px-3.5 text-sm text-[#0F172A] whitespace-nowrap ${
                      numeric ? 'text-right font-mono tabular-nums text-[13px]' : 'text-left'
                    }`}
                  >
                    {formatted}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
