import { useState } from 'react';

import { useApi } from '../api';
import { DEFAULT_SETTINGS, useSettings } from '../settings';
import { Banner, Field } from '../ui';

type Health = Record<string, boolean | undefined>;

export function SettingsView() {
  const { settings, update, reset } = useSettings();
  const api = useApi();
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [health, setHealth] = useState<Health>({});
  const [checking, setChecking] = useState(false);

  const set = (patch: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  };

  const save = () => {
    update(draft);
    setSaved(true);
  };

  const check = async () => {
    setChecking(true);
    update(draft); // probe against what we're about to save
    const [s4, ingest, gw] = await Promise.all([
      api.health(draft.adminApiBase),
      api.health(draft.ingestBase),
      api.health(draft.gatewayBase),
    ]);
    setHealth({ s4, ingest, gw });
    setChecking(false);
  };

  const dot = (ok: boolean | undefined) =>
    ok === undefined ? '' : ok ? ' ✓ up' : ' ✗ down';

  return (
    <div className="view">
      <h2>Connection</h2>
      <p className="muted">
        The console runs entirely in your browser and talks to these services directly. Settings are stored
        in this browser only.
      </p>

      <div className="card">
        <Field label="Admin API (S4 tenant-config)" hint={`Health:${dot(health.s4) || ' —'}`}>
          <input value={draft.adminApiBase} onChange={(e) => set({ adminApiBase: e.target.value })} />
        </Field>
        <Field label="Ingestion API (S5)" hint={`Health:${dot(health.ingest) || ' —'}`}>
          <input value={draft.ingestBase} onChange={(e) => set({ ingestBase: e.target.value })} />
        </Field>
        <Field label="API Gateway (S2, for search preview)" hint={`Health:${dot(health.gw) || ' —'}`}>
          <input value={draft.gatewayBase} onChange={(e) => set({ gatewayBase: e.target.value })} />
        </Field>
        <Field label="Admin token" hint="Sent as a Bearer token to S4 + ingestion. Dev default: dev-admin-token">
          <input
            type="password"
            value={draft.adminToken}
            onChange={(e) => set({ adminToken: e.target.value })}
          />
        </Field>

        <div className="row gap">
          <button type="button" className="btn btn-primary" onClick={save}>
            Save settings
          </button>
          <button type="button" className="btn" onClick={check} disabled={checking}>
            {checking ? 'Checking…' : 'Test connections'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { reset(); setDraft(DEFAULT_SETTINGS); setHealth({}); }}>
            Reset to defaults
          </button>
        </div>

        {saved && <Banner kind="success">Settings saved.</Banner>}
      </div>
    </div>
  );
}
