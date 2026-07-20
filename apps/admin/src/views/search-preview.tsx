import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';

import { type Tenant, useApi } from '../api';
import { Banner, EmptyState, Field, Spinner, errMsg } from '../ui';

export function SearchPreviewView({ selected: _selected }: { selected: Tenant | null }) {
  const api = useApi();
  const [key, setKey] = useState('pk_test_demo');
  const [query, setQuery] = useState('');

  const run = useMutation({
    mutationFn: () => api.preview(key.trim(), query.trim(), 10),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (key.trim()) run.mutate();
  };

  return (
    <div className="view">
      <h2>Search preview</h2>
      <p className="muted">
        Runs a real query through the API Gateway using a <strong>tenant key</strong> (not the admin token), exactly
        as the embedded widget would. Secrets are only issued once, so paste the key here. A blank query browses all
        documents.
      </p>

      <form className="card" onSubmit={submit}>
        <div className="row gap wrap">
          <Field label="Tenant API key">
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="pk_test_demo" style={{ minWidth: 260 }} />
          </Field>
          <Field label="Query" hint="Leave blank to browse all documents.">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="how do I get reimbursed" style={{ minWidth: 320 }} />
          </Field>
          <div className="row end">
            <button type="submit" className="btn btn-primary" disabled={!key.trim() || run.isPending}>
              {run.isPending ? 'Searching…' : 'Search'}
            </button>
          </div>
        </div>
      </form>

      <div className="card">
        {run.isPending ? (
          <Spinner label="Searching…" />
        ) : run.isError ? (
          <Banner kind="error">{errMsg(run.error)}</Banner>
        ) : run.data ? (
          <>
            <p className="row between">
              <span className="muted">
                {run.data.total.toLocaleString()} result{run.data.total === 1 ? '' : 's'} · {run.data.took_ms} ms
              </span>
              {run.data.degraded ? (
                <span className="pill pill-off">degraded (BM25 only)</span>
              ) : (
                <span className="pill pill-on">hybrid</span>
              )}
            </p>
            {run.data.results.length === 0 ? (
              <EmptyState>No results.</EmptyState>
            ) : (
              <ol className="preview-results">
                {run.data.results.map((r) => (
                  <li key={r.id} className="preview-result">
                    <div className="preview-title">
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer">{r.title ?? r.url}</a>
                      ) : (
                        r.title ?? r.id
                      )}
                      {typeof r.score === 'number' && <span className="preview-score">score {r.score.toFixed(3)}</span>}
                    </div>
                    {r.snippet && <p className="preview-snippet" dangerouslySetInnerHTML={{ __html: sanitizeSnippet(r.snippet) }} />}
                    <div className="preview-meta">
                      {r.source && <span className="tag">{r.source}</span>}
                      {(r.tags ?? []).map((t) => (
                        <span key={t} className="tag">{t}</span>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : (
          <EmptyState>Enter a key and run a search to preview results.</EmptyState>
        )}
      </div>
    </div>
  );
}

/**
 * The gateway returns snippets with <em> highlight tags. Strip every tag except
 * <em>/</em> before using dangerouslySetInnerHTML, so highlights render but no
 * other markup from indexed content can inject into the page.
 */
function sanitizeSnippet(html: string): string {
  const escaped = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/&lt;(\/?)em&gt;/gi, '<$1em>');
}
