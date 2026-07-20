import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { type IssuedKey, useApi } from '../api';
import { Banner, CopyButton, EmptyState, Field, Pill, Spinner, errMsg } from '../ui';

const ALL_SCOPES = ['search', 'suggest', 'rag'] as const;

export function KeysPanel({ tenantId }: { tenantId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const keysQ = useQuery({ queryKey: ['keys', tenantId], queryFn: () => api.listKeys(tenantId) });

  const [scopes, setScopes] = useState<string[]>(['search', 'suggest']);
  const [rateLimit, setRateLimit] = useState(60);
  const [origins, setOrigins] = useState('');
  const [issued, setIssued] = useState<IssuedKey | null>(null);

  const issue = useMutation({
    mutationFn: () =>
      api.issueKey(tenantId, {
        scopes,
        rateLimit,
        originAllowlist: origins
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: (key) => {
      setIssued(key);
      void qc.invalidateQueries({ queryKey: ['keys', tenantId] });
    },
  });

  const revoke = useMutation({
    mutationFn: (keyId: string) => api.revokeKey(tenantId, keyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keys', tenantId] }),
  });

  const toggleScope = (s: string) =>
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <div>
      <div className="card">
        <h3>Issue a new key</h3>
        <div className="row gap wrap">
          <Field label="Scopes">
            <div className="row gap">
              {ALL_SCOPES.map((s) => (
                <label key={s} className="check">
                  <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} /> {s}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Rate limit (req/min)">
            <input
              type="number"
              min={1}
              value={rateLimit}
              onChange={(e) => setRateLimit(Number(e.target.value))}
              style={{ width: 120 }}
            />
          </Field>
        </div>
        <Field label="Origin allowlist" hint="Space/comma separated. Empty = allow all origins.">
          <input value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder="https://app.example.com" />
        </Field>
        <button type="button" className="btn btn-primary" onClick={() => issue.mutate()} disabled={issue.isPending || scopes.length === 0}>
          {issue.isPending ? 'Issuing…' : 'Issue key'}
        </button>
        {issue.isError && <Banner kind="error">{errMsg(issue.error)}</Banner>}

        {issued && (
          <Banner kind="success">
            <div>
              <strong>Copy this key now — it is shown only once.</strong>
            </div>
            <div className="row gap secret-row">
              <code className="secret">{issued.key}</code>
              <CopyButton value={issued.key} />
            </div>
          </Banner>
        )}
      </div>

      <div className="card">
        <h3>Existing keys</h3>
        {keysQ.isLoading ? (
          <Spinner />
        ) : keysQ.isError ? (
          <Banner kind="error">{errMsg(keysQ.error)}</Banner>
        ) : keysQ.data && keysQ.data.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Prefix</th>
                <th>Scopes</th>
                <th>Rate</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keysQ.data.map((k) => (
                <tr key={k.id}>
                  <td><code>{k.keyPrefix}…</code></td>
                  <td>{k.scopes.join(', ')}</td>
                  <td>{k.rateLimit}/min</td>
                  <td><Pill on={k.active} /></td>
                  <td className="right">
                    {k.active && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          if (confirm(`Revoke key ${k.keyPrefix}…? Apps using it will stop working.`)) revoke.mutate(k.id);
                        }}
                        disabled={revoke.isPending}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState>No keys yet. Issue one above.</EmptyState>
        )}
        {revoke.isError && <Banner kind="error">{errMsg(revoke.error)}</Banner>}
      </div>
    </div>
  );
}
