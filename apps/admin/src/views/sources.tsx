import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { useApi, type Source } from '../api';
import { Banner, EmptyState, Field, Pill, Spinner, errMsg } from '../ui';

const SOURCE_TYPES = ['document', 'news', 'image', 'rest', 'db', 'folder', 's3'] as const;

const DEFAULT_S3 = {
  endpoint: 'http://127.0.0.1:9000',
  bucket: 'content',
  prefix: '',
  region: 'us-east-1',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
  usePathStyle: true,
  includeSuffixes: '.txt,.md,.pdf',
  maxKeys: '500',
};

function s3ConfigFromForm(form: typeof DEFAULT_S3): Record<string, unknown> {
  const suffixes = form.includeSuffixes
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    endpoint: form.endpoint.trim(),
    bucket: form.bucket.trim(),
    prefix: form.prefix.trim(),
    region: form.region.trim() || 'us-east-1',
    accessKeyId: form.accessKeyId.trim(),
    secretAccessKey: form.secretAccessKey.trim(),
    usePathStyle: form.usePathStyle,
    includeSuffixes: suffixes.length ? suffixes : ['.txt', '.md', '.pdf'],
    maxKeys: Math.max(1, Number(form.maxKeys) || 500),
  };
}

export function SourcesPanel({ tenantId }: { tenantId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['sources', tenantId], queryFn: () => api.getSources(tenantId) });

  const [type, setType] = useState<string>('document');
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('');
  const [s3, setS3] = useState(DEFAULT_S3);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      const body: {
        type: string;
        name: string;
        schedule?: string | null;
        enabled?: boolean;
        connectorConfig?: Record<string, unknown>;
      } = {
        type,
        name: name.trim(),
        schedule: schedule.trim() || null,
        enabled: true,
      };
      if (type === 's3') {
        body.connectorConfig = s3ConfigFromForm(s3);
      }
      return api.createSource(tenantId, body);
    },
    onSuccess: () => {
      setName('');
      setSchedule('');
      setS3(DEFAULT_S3);
      setActionErr(null);
      void qc.invalidateQueries({ queryKey: ['sources', tenantId] });
    },
  });

  const testConn = useMutation({
    mutationFn: async (source: Source) => {
      setActionMsg(null);
      setActionErr(null);
      return api.testS3Connector({ tenantId, sourceId: source.id });
    },
    onSuccess: (res) => {
      if (res.ok) {
        setActionMsg(res.message ?? `OK — listed ${res.listed} object(s)`);
      } else {
        setActionErr(res.message ?? 'Connection test failed');
      }
    },
    onError: (err) => setActionErr(errMsg(err)),
  });

  const runSync = useMutation({
    mutationFn: async (args: { source: Source; mode: 'full' | 'incremental' }) => {
      setActionMsg(null);
      setActionErr(null);
      const tenant = await api.getConfig(tenantId);
      return api.ingestFromSource({
        tenantId,
        tenantPrefix: tenant.tenant.prefix,
        sourceId: args.source.id,
        mode: args.mode,
      });
    },
    onSuccess: (job) => {
      setActionMsg(`Sync job ${job.jobId} → ${job.status} (tasks: ${job.taskCount})`);
    },
    onError: (err) => setActionErr(errMsg(err)),
  });

  const busy = create.isPending || testConn.isPending || runSync.isPending;
  const s3Hint = useMemo(
    () =>
      type === 's3'
        ? 'Secrets are stored in Tenant Config and redacted on read. Leave secret as *** when editing later.'
        : null,
    [type],
  );

  return (
    <div>
      <div className="card">
        <h3>Register a source</h3>
        <p className="muted">
          Sources describe where documents come from. Use type <code>s3</code> for MinIO/S3 sync
          (full upsert + delete reconcile, or incremental by LastModified).
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

        {type === 's3' && (
          <div className="row gap wrap" style={{ marginTop: 12 }}>
            <Field label="Endpoint">
              <input
                value={s3.endpoint}
                onChange={(e) => setS3({ ...s3, endpoint: e.target.value })}
                placeholder="http://127.0.0.1:9000"
              />
            </Field>
            <Field label="Bucket">
              <input value={s3.bucket} onChange={(e) => setS3({ ...s3, bucket: e.target.value })} />
            </Field>
            <Field label="Prefix">
              <input
                value={s3.prefix}
                onChange={(e) => setS3({ ...s3, prefix: e.target.value })}
                placeholder="demo/handbook/"
              />
            </Field>
            <Field label="Region">
              <input value={s3.region} onChange={(e) => setS3({ ...s3, region: e.target.value })} />
            </Field>
            <Field label="Access key">
              <input
                value={s3.accessKeyId}
                onChange={(e) => setS3({ ...s3, accessKeyId: e.target.value })}
                autoComplete="off"
              />
            </Field>
            <Field label="Secret key">
              <input
                type="password"
                value={s3.secretAccessKey}
                onChange={(e) => setS3({ ...s3, secretAccessKey: e.target.value })}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Include suffixes">
              <input
                value={s3.includeSuffixes}
                onChange={(e) => setS3({ ...s3, includeSuffixes: e.target.value })}
                placeholder=".txt,.md,.pdf"
              />
            </Field>
            <Field label="Max keys">
              <input
                value={s3.maxKeys}
                onChange={(e) => setS3({ ...s3, maxKeys: e.target.value })}
              />
            </Field>
            <Field label="Path-style">
              <label className="row gap" style={{ alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={s3.usePathStyle}
                  onChange={(e) => setS3({ ...s3, usePathStyle: e.target.checked })}
                />
                <span className="muted">usePathStyle (required for MinIO)</span>
              </label>
            </Field>
          </div>
        )}

        {s3Hint && <p className="muted">{s3Hint}</p>}

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => create.mutate()}
          disabled={!name.trim() || busy || (type === 's3' && !s3.bucket.trim())}
        >
          {create.isPending ? 'Creating…' : 'Create source'}
        </button>
        {create.isError && <Banner kind="error">{errMsg(create.error)}</Banner>}
      </div>

      {(actionMsg || actionErr) && (
        <Banner kind={actionErr ? 'error' : 'success'}>{actionErr ?? actionMsg}</Banner>
      )}

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
                <th>Config</th>
                <th>Schedule</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td><code>{s.type}</code></td>
                  <td>
                    {s.type === 's3' ? (
                      <code className="muted">
                        {String(s.connectorConfig?.bucket ?? '?')} / {String(s.connectorConfig?.prefix ?? '')}
                      </code>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{s.schedule ?? <span className="muted">manual</span>}</td>
                  <td><Pill on={s.enabled} labelOn="enabled" labelOff="disabled" /></td>
                  <td>
                    {s.type === 's3' ? (
                      <div className="row gap wrap">
                        <button
                          type="button"
                          className="btn"
                          disabled={busy}
                          onClick={() => testConn.mutate(s)}
                        >
                          Test
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy}
                          onClick={() => runSync.mutate({ source: s, mode: 'full' })}
                        >
                          Run sync
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={busy}
                          onClick={() => runSync.mutate({ source: s, mode: 'incremental' })}
                        >
                          Incremental
                        </button>
                      </div>
                    ) : (
                      <span className="muted">inline ingest</span>
                    )}
                  </td>
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
