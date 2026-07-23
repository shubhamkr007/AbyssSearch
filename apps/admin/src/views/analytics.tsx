import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  type CtrReport,
  type LatencyReport,
  type Tenant,
  type TopQueriesReport,
  type ZeroResultsReport,
  useApi,
} from '../api';
import { Banner, EmptyState, Spinner, errMsg } from '../ui';

const RANGES = [
  { days: 1, label: '24h' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

interface Bundle {
  top: TopQueriesReport;
  zero: ZeroResultsReport;
  ctr: CtrReport;
  latency: LatencyReport;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function ms(value: number | null): string {
  return value === null || value === undefined ? '—' : `${Math.round(value)} ms`;
}

function label(query: string): string {
  return query.trim() === '' ? '(blank search)' : query;
}

export function AnalyticsView({ selected }: { selected: Tenant | null }) {
  const api = useApi();
  const [days, setDays] = useState(7);
  const prefix = selected?.prefix ?? '';

  const q = useQuery<Bundle>({
    queryKey: ['analytics', prefix, days],
    enabled: prefix.length > 0,
    queryFn: async () => {
      const [top, zero, ctr, latency] = await Promise.all([
        api.topQueries(prefix, days, 10),
        api.zeroResults(prefix, days, 10),
        api.ctr(prefix, days, 10),
        api.latency(prefix, days),
      ]);
      return { top, zero, ctr, latency };
    },
  });

  if (!selected) {
    return (
      <div className="view">
        <h2>Analytics</h2>
        <EmptyState>Select a tenant in the Tenants tab to see its search analytics.</EmptyState>
      </div>
    );
  }

  return (
    <div className="view">
      <div className="row between wrap">
        <div>
          <h2>Analytics</h2>
          <p className="muted">
            Search behavior for <strong>{selected.name}</strong> (<code>{prefix}</code>). Query
            events are logged by the gateway; impressions and clicks come from the widget beacon.
          </p>
        </div>
        <div className="row gap end">
          <div className="seg">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                className={`seg-btn ${days === r.days ? 'active' : ''}`}
                onClick={() => setDays(r.days)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="card">
          <Spinner label="Loading reports…" />
        </div>
      ) : q.isError ? (
        <Banner kind="error">
          {errMsg(q.error)} — is the Analytics Service running on the configured base (Settings)?
        </Banner>
      ) : q.data ? (
        <Reports bundle={q.data} />
      ) : null}
    </div>
  );
}

function Reports({ bundle }: { bundle: Bundle }) {
  const { top, zero, ctr, latency } = bundle;
  const empty =
    top.total_queries === 0 && ctr.impressions === 0 && ctr.clicks === 0 && latency.count === 0;

  if (empty) {
    return (
      <div className="card">
        <EmptyState>
          No events yet for this window. Run a few searches through the widget or the Search preview
          tab, then click a result — data appears within a couple of seconds.
        </EmptyState>
      </div>
    );
  }

  return (
    <>
      <div className="stat-grid">
        <Stat label="Searches" value={top.total_queries.toLocaleString()} />
        <Stat label="Zero-result rate" value={pct(zero.zero_result_rate)} sub={`${zero.total_zero_result_searches} searches`} />
        <Stat label="Click-through rate" value={pct(ctr.ctr)} sub={`${ctr.clicks} clicks / ${ctr.impressions} impressions`} />
        <Stat label="Latency p95" value={ms(latency.p95_ms)} sub={`p50 ${ms(latency.p50_ms)} · max ${ms(latency.max_ms)}`} />
      </div>

      <div className="card">
        <h3>Top queries</h3>
        {top.items.length === 0 ? (
          <EmptyState>No queries in this window.</EmptyState>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Query</th>
                <th className="num">Searches</th>
                <th className="num">Zero-result</th>
                <th className="num">Avg latency</th>
              </tr>
            </thead>
            <tbody>
              {top.items.map((r) => (
                <tr key={r.query}>
                  <td>{label(r.query)}</td>
                  <td className="num">{r.count.toLocaleString()}</td>
                  <td className="num">{r.zero_results > 0 ? <span className="pill pill-off">{r.zero_results}</span> : 0}</td>
                  <td className="num">{ms(r.avg_latency_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Zero-result queries</h3>
          {zero.items.length === 0 ? (
            <EmptyState>None — every search returned something.</EmptyState>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Query</th>
                  <th className="num">Count</th>
                </tr>
              </thead>
              <tbody>
                {zero.items.map((r) => (
                  <tr key={r.query}>
                    <td>{label(r.query)}</td>
                    <td className="num">{r.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3>Click-through by query</h3>
          {ctr.items.length === 0 ? (
            <EmptyState>No impressions yet. The widget sends these as users search + click.</EmptyState>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Query</th>
                  <th className="num">Impr.</th>
                  <th className="num">Clicks</th>
                  <th className="num">CTR</th>
                </tr>
              </thead>
              <tbody>
                {ctr.items.map((r) => (
                  <tr key={r.query}>
                    <td>{label(r.query)}</td>
                    <td className="num">{r.impressions.toLocaleString()}</td>
                    <td className="num">{r.clicks.toLocaleString()}</td>
                    <td className="num">{pct(r.ctr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
