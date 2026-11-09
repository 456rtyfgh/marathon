/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_GA_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** 목록 파일 주소 /d/<hash>.json (vite.config.ts 의 define, scripts/data-split.mjs) */
declare const __DATA_LIST_URL__: string;
