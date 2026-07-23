import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

/** Connection settings for the three backends the console drives. */
export interface Settings {
  /** S4 Tenant/Config admin API. */
  adminApiBase: string;
  /** S5 Ingestion orchestrator (ingest + NER analyze + jobs). */
  ingestBase: string;
  /** S2 API Gateway, used only for the live search preview. */
  gatewayBase: string;
  /** S13 Analytics Service (reports: top queries, zero-results, CTR, latency). */
  analyticsBase: string;
  /** Shared admin token (Phase 1 auth) sent to S4 + ingestion + analytics. */
  adminToken: string;
}

const STORAGE_KEY = 'abyss-admin-settings';

export const DEFAULT_SETTINGS: Settings = {
  adminApiBase: 'http://localhost:8001',
  ingestBase: 'http://localhost:8090',
  gatewayBase: 'http://localhost:8081',
  analyticsBase: 'http://localhost:8093',
  adminToken: 'dev-admin-token',
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota / private-mode errors */
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const value = useMemo(() => ({ settings, update, reset }), [settings, update, reset]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
