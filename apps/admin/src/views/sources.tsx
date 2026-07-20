import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useApi } from '../api';
import { Banner, EmptyState, Field, Pill, Spinner, errMsg } from '../ui';

const SOURCE_TYPES = ['document', 'news', 'image', 'rest', 'db', 'folder'] as const;

export function SourcesPanel({ tenantId }: { tenantId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['sources', tenantId], queryFn: () => api.getSources(tenantId) });

  const [type, setType] = useState<string>('document');
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.createSource(tenantId, { type, name: name.trim(), schedule: schedule.trim() || null, enabled: true }),
    onSuccess: () => {
      setName('');
      setSchedule('');
      void qc.invalidateQueries({ queryKey: ['sources', tenantId] });
    },
  });

  return (
    <div>
      <div className="card">
        <h3>Register a source</h3>
        <p className="muted">
          Sources describe where documents come from. Connector-based fetch is Phase 1.5; for now you ingest
          documents inline from the Ingest screen.
        </p>
        <div className="row gap wrap">
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {SOURCE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company handbook" />
          </Field>
          <Field label="Schedule (cron, optional)">
            <input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="0 * * * *" />
          </Field>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
          {create.isPending ? 'Creating…' : 'Create source'}
        </button>
        {create.isError && <Banner kind="error">{errMsg(create.error)}</Banner>}
      </div>

      <div className="card">
        <h3>Sources</h3>
        {q.isLoading ? (
          <Spinner />
        ) : q.isError ? (
          <Banner kind="error">{errMsg(q.error)}</Banner>
        ) : q.data && q.data.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Schedule</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td><code>{s.type}</code></td>
                  <td>{s.schedule ?? <span className="muted">manual</span>}</td>
                  <td><Pill on={s.enabled} labelOn="enabled" labelOff="disabled" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState>No sources registered yet.</EmptyState>
        )}
      </div>
    </div>
  );
}
