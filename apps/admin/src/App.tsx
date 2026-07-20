import { useState } from 'react';

import { type Tenant } from './api';
import { useSettings } from './settings';
import { Banner } from './ui';
import { IngestView } from './views/ingest';
import { SearchPreviewView } from './views/search-preview';
import { SettingsView } from './views/settings';
import { TenantsView } from './views/tenants';

type View = 'tenants' | 'ingest' | 'search' | 'settings';
const NAV: { key: View; label: string }[] = [
  { key: 'tenants', label: 'Tenants' },
  { key: 'ingest', label: 'Ingest' },
  { key: 'search', label: 'Search preview' },
  { key: 'settings', label: 'Settings' },
];

export function App() {
  const { settings } = useSettings();
  const [view, setView] = useState<View>('tenants');
  const [tenant, setTenant] = useState<Tenant | null>(null);

  const host = safeHost(settings.adminApiBase);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>A</span>
          <span className="brand-name">AbyssSearch</span>
          <span className="brand-sub">Admin Console</span>
        </div>
        <nav className="topnav">
          {NAV.map((n) => (
            <button
              key={n.key}
              type="button"
              className={`navbtn ${view === n.key ? 'active' : ''}`}
              onClick={() => setView(n.key)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="conn" title="Admin API target">
          {tenant && <span className="conn-tenant">{tenant.name}</span>}
          <span className="conn-host">{host}</span>
        </div>
      </header>

      <main className="main">
        {!settings.adminToken && (
          <Banner kind="error">
            No admin token set. Open <strong>Settings</strong> and enter your admin token before managing tenants.
          </Banner>
        )}
        {view === 'tenants' && <TenantsView selected={tenant} onSelect={setTenant} />}
        {view === 'ingest' && <IngestView selected={tenant} />}
        {view === 'search' && <SearchPreviewView selected={tenant} />}
        {view === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
