import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { type IngestDoc, type Tenant, useApi } from '../api';
import { Banner, EmptyState, Field, Spinner, errMsg } from '../ui';

const SAMPLE: IngestDoc[] = [
  {
    title: 'Employee Onboarding Guide',
    body: 'New hires at Acme Corp get accounts, benefits enrollment, and a first-week checklist. IT provisions a laptop and SSO access on day one.',
    tags: ['hr', 'onboarding'],
    source: 'document',
  },
  {
    title: 'Expense Reimbursement Policy',
    body: 'Submit receipts within 30 days to get reimbursed for travel and business expenses. Manager approval is required for amounts over 500 USD.',
    tags: ['finance', 'policy'],
    source: 'document',
  },
];

export function IngestView({ selected }: { selected: Tenant | null }) {
  const api = useApi();
  const qc = useQueryClient();
  const tenantsQ = useQuery({ queryKey: ['tenants'], queryFn: () => api.listTenants() });

  const [tenantId, setTenantId] = useState<string>(selected?.id ?? '');
  const effectiveId = tenantId || selected?.id || '';
  const tenant = (tenantsQ.data ?? []).find((t) => t.id === effectiveId) ?? selected ?? null;
  const prefix = tenant?.prefix ?? '';

  const [docsText, setDocsText] = useState(JSON.stringify(SAMPLE, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  const jobsQ = useQuery({
    queryKey: ['jobs', prefix],
    queryFn: () => api.listJobs(prefix),
    enabled: Boolean(prefix),
    refetchInterval: 5000,
  });

  const ingest = useMutation({
    mutationFn: () => {
      let docs: IngestDoc[];
      try {
        const parsed = JSON.parse(docsText);
        if (!Array.isArray(parsed)) throw new Error('Documents must be a JSON array');
        docs = parsed as IngestDoc[];
        const bad = docs.find((d) => !d || typeof d.title !== 'string' || typeof d.body !== 'string');
        if (bad) throw new Error('Every document needs a non-empty "title" and "body"');
      } catch (e) {
        setParseError(errMsg(e));
        return Promise.reject(e);
      }
      setParseError(null);
      // tenant_id must equal the prefix so the search tenant filter matches.
      return api.ingest({ tenantId: prefix, tenantPrefix: prefix, documents: docs });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs', prefix] }),
  });

  const analyze = useMutation({
    mutationFn: () => api.analyze({ tenantId: prefix, tenantPrefix: prefix, limit: 1000 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs', prefix] }),
  });

  return (
    <div className="view">
      <h2>Ingest &amp; enrich</h2>
      <div className="card">
        <div className="row gap wrap">
          <Field label="Tenant" hint={prefix ? `Indexes into ${prefix}-*` : 'Pick a tenant'}>
            <select value={effectiveId} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">— select —</option>
              {(tenantsQ.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.prefix})</option>
              ))}
            </select>
          </Field>
          <div className="row gap end">
            <button type="button" className="btn btn-ghost" onClick={() => setDocsText(JSON.stringify(SAMPLE, null, 2))}>
              Load sample
            </button>
          </div>
        </div>

        <Field label="Documents (JSON array)" hint='Each item: { "title", "body", "url"?, "tags"?, "source"? }'>
          <textarea rows={12} className="mono" value={docsText} onChange={(e) => setDocsText(e.target.value)} />
        </Field>
        {parseError && <Banner kind="error">{parseError}</Banner>}

        <div className="row gap">
          <button type="button" className="btn btn-primary" onClick={() => ingest.mutate()} disabled={!prefix || ingest.isPending}>
            {ingest.isPending ? 'Ingesting…' : 'Ingest documents'}
          </button>
          <button type="button" className="btn" onClick={() => analyze.mutate()} disabled={!prefix || analyze.isPending} title="Generate NER entities (ORG/PERSON/GPE…) for docs already in Elasticsearch">
            {analyze.isPending ? 'Analyzing…' : 'Run NER on tenant'}
          </button>
        </div>
        {ingest.isSuccess && (
          <Banner kind="success">
            Ingest job <code>{ingest.data.jobId}</code> — {ingest.data.status} ({ingest.data.taskCount} task
            {ingest.data.taskCount === 1 ? '' : 's'}).
          </Banner>
        )}
        {ingest.isError && !parseError && <Banner kind="error">{errMsg(ingest.error)}</Banner>}
        {analyze.isSuccess && (
          <Banner kind="success">
            Analyze job <code>{analyze.data.jobId}</code> — {analyze.data.status}.
          </Banner>
        )}
        {analyze.isError && <Banner kind="error">{errMsg(analyze.error)}</Banner>}
      </div>

      <div className="card">
        <div className="row between">
          <h3>Recent jobs {prefix && <span className="muted">· {prefix}</span>}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => jobsQ.refetch()} disabled={!prefix}>
            Refresh
          </button>
        </div>
        {!prefix ? (
          <EmptyState>Select a tenant to see its jobs.</EmptyState>
        ) : jobsQ.isLoading ? (
          <Spinner />
        ) : jobsQ.isError ? (
          <Banner kind="error">{errMsg(jobsQ.error)}</Banner>
        ) : jobsQ.data && jobsQ.data.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Type</th>
                <th>Status</th>
                <th>OK</th>
                <th>Failed</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {jobsQ.data.map((j) => (
                <tr key={j.jobId}>
                  <td><code>{j.jobId.slice(0, 8)}…</code></td>
                  <td>{j.type}</td>
                  <td><span className={`job-status job-${j.status}`}>{j.status}</span></td>
                  <td>{j.counts.ok}</td>
                  <td>{j.counts.failed}</td>
                  <td className="muted">{j.createdAt ? new Date(j.createdAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState>No jobs yet for this tenant.</EmptyState>
        )}
      </div>
    </div>
  );
}
