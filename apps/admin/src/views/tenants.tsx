import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { type Tenant, useApi } from '../api';
import { Banner, CopyButton, EmptyState, Field, Spinner, errMsg } from '../ui';
import { KeysPanel } from './keys';
import { RelevancePanel } from './relevance';
import { SourcesPanel } from './sources';
import { TabsPanel } from './tabs';

type SubTab = 'keys' | 'tabs' | 'sources' | 'relevance';
const SUBTABS: { key: SubTab; label: string }[] = [
  { key: 'keys', label: 'API keys' },
  { key: 'tabs', label: 'Tabs' },
  { key: 'sources', label: 'Sources' },
  { key: 'relevance', label: 'Relevance' },
];

export function TenantsView({
  selected,
  onSelect,
}: {
  selected: Tenant | null;
  onSelect: (t: Tenant | null) => void;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const tenantsQ = useQuery({ queryKey: ['tenants'], queryFn: () => api.listTenants() });

  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [sub, setSub] = useState<SubTab>('keys');

  const create = useMutation({
    mutationFn: () => api.createTenant(name.trim(), prefix.trim()),
    onSuccess: (t) => {
      setName('');
      setPrefix('');
      void qc.invalidateQueries({ queryKey: ['tenants'] });
      onSelect(t);
    },
  });

  return (
    <div className="view split">
      <aside className="sidebar">
        <div className="card">
          <h3>New tenant</h3>
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corp" />
          </Field>
          <Field label="Prefix" hint="3–40 chars, lowercase, a–z 0–9 and hyphens. Immutable; used in index names.">
            <input value={prefix} onChange={(e) => setPrefix(e.target.value.toLowerCase())} placeholder="acme" />
          </Field>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => create.mutate()}
            disabled={!name.trim() || !prefix.trim() || create.isPending}
          >
            {create.isPending ? 'Creating…' : 'Create tenant'}
          </button>
          {create.isError && <Banner kind="error">{errMsg(create.error)}</Banner>}
        </div>

        <div className="card">
          <div className="row between">
            <h3>Tenants</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => tenantsQ.refetch()}>
              Refresh
            </button>
          </div>
          {tenantsQ.isLoading ? (
            <Spinner />
          ) : tenantsQ.isError ? (
            <Banner kind="error">{errMsg(tenantsQ.error)}</Banner>
          ) : tenantsQ.data && tenantsQ.data.length > 0 ? (
            <ul className="list">
              {tenantsQ.data.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={`list-item ${selected?.id === t.id ? 'active' : ''}`}
                    onClick={() => onSelect(t)}
                  >
                    <span className="list-item-title">{t.name}</span>
                    <span className="list-item-sub"><code>{t.prefix}</code> · {t.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>No tenants yet. Create one to get started.</EmptyState>
          )}
        </div>
      </aside>

      <section className="detail">
        {!selected ? (
          <EmptyState>Select a tenant on the left, or create one, to manage its keys, tabs, sources, and relevance.</EmptyState>
        ) : (
          <>
            <div className="detail-head">
              <div>
                <h2>{selected.name}</h2>
                <div className="muted">
                  prefix <code>{selected.prefix}</code> · status {selected.status} · id <code>{selected.id}</code>{' '}
                  <CopyButton value={selected.id} />
                </div>
              </div>
            </div>
            <nav className="subtabs">
              {SUBTABS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`subtab ${sub === s.key ? 'active' : ''}`}
                  onClick={() => setSub(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </nav>
            <div className="subpanel">
              {sub === 'keys' && <KeysPanel tenantId={selected.id} />}
              {sub === 'tabs' && <TabsPanel tenantId={selected.id} />}
              {sub === 'sources' && <SourcesPanel tenantId={selected.id} />}
              {sub === 'relevance' && <RelevancePanel tenantId={selected.id} />}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
