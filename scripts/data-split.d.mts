// scripts/data-split.mjs 의 타입 (vite.config.ts 가 tsc 검사를 통과하게). 행은 public/data.json 그대로라 느슨하게
type Row = Record<string, any>;
interface Snapshot {
  generated_at?: string;
  races: Row[];
  agencies: Row[];
  packages: Row[];
  costs: Row[];
}
interface Notice {
  copyright: string;
  notice_ko: string;
  notice_en: string;
  terms: string;
}
export interface Split {
  list: { _notice: Notice; generated_at?: string; races: Row[] };
  full: Snapshot & { _notice: Notice };
  listJson: string;
  fullJson: string;
  listPath: string;
  fullPath: string;
}
export const LIST_FIELDS: string[];
export const DETAIL_FIELDS: string[];
export function splitData(snap: Snapshot): Split;
export function readSplit(): Split;
export function writeSplit(distDir: string): { listPath: string; fullPath: string };
