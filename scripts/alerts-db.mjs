/**
 * 알림 테스트용 로컬 DB (PGlite): Supabase 흉내 + 0001~0013 + 0017 (두 번). 실제 DB 는 건드리지 않는다.
 * scripts/alerts-sql-test.mjs · scripts/alerts-worker-test.mjs 가 쓴다. 흉내 방식은 member-sql-test.mjs 와 같다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url).pathname;
const mig = (f) => readFileSync(resolve(root, 'supabase/migrations', f), 'utf8');

export async function makeDb() {
  const dir = resolve(root, process.env.PGLITE_DIR ?? 'node_modules/.cache/pglite');
  const { PGlite } = await import(pathToFileURL(resolve(dir, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz,
      raw_user_meta_data jsonb not null default '{}', created_at timestamptz not null default now(),
      last_sign_in_at timestamptz, confirmation_sent_at timestamptz, confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    create schema extensions; grant usage on schema extensions to anon, authenticated, service_role;
    create function extensions.digest(text, text) returns bytea language sql immutable as
      $$ select sha256(convert_to($1, 'UTF8')) $$;
    create table public.stat_daily (day date, event text, key text, n int not null default 0, primary key (day, event, key));
    create table public.heartbeat (id int primary key, at timestamptz);
    create function public.spam_reason(text) returns text language sql immutable as $$ select null::text $$;
    create function public.guard_review() returns trigger language plpgsql as $$ begin return new; end $$;
    create function public.guard_request() returns trigger language plpgsql as $$ begin return new; end $$;
  `);
  for (const f of ['0001_init.sql', '0002_reviews_auth.sql', '0003_requests_automation.sql', '0004_admin_email.sql',
    '0010_security_hardening.sql', '0011_privacy.sql', '0012_security.sql', '0013_member.sql']) {
    let sql = mig(f);
    if (f === '0001_init.sql') sql = sql.replace(/create extension if not exists pgcrypto;/, '');
    // 0012 의 [0] 은 라이브 본문 md5 비교 — 저장소 본문으로 만든 이 DB 와는 달라 뺀다 (member-sql-test.mjs 와 같음)
    if (f === '0012_security.sql') {
      const a = sql.indexOf('-- ── [0] 사전 점검');
      sql = sql.slice(0, a) + sql.slice(sql.indexOf('end $$;', a) + 'end $$;'.length);
    }
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`기존 마이그레이션 ${f} 실패: ${e.message}`);
    }
  }
  // Supabase 처럼 새 표·함수에 API 역할 기본 권한 → 0017 의 revoke 가 먹는지 본다
  await db.exec(`
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  return db;
}

export const migration0017 = () => mig('0017_alert_send.sql');

/** 'YYYY-MM-DD' (KST 오늘 + n일) */
export const kstDay = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
