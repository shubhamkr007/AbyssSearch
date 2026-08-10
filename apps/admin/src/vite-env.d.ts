/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_API_BASE?: string;
  readonly VITE_INGEST_BASE?: string;
  readonly VITE_GATEWAY_BASE?: string;
  readonly VITE_ANALYTICS_BASE?: string;
  readonly VITE_ADMIN_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
