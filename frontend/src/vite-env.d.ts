/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When UI and API are on different origins, set to the public backend URL (no trailing slash). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
