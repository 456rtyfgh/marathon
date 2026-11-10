/**
 * 개발 서버 전용 내 정보 '저장한 대회' 미리보기 (mypage-preview.html). 로그인·DB 없이 SavedRaces 를 실제 내 정보 창(Panel sheet) 안에 띄운다.
 *   ?who=member|guest  (guest = 비로그인 — 로그인 유도 줄)
 *   ?state=full|empty|local|loading  (local = 회원인데 계정 동기화 전·실패, 브라우저 저장분)
 *   ?lang=en
 * 가짜 데이터는 dev/myRacesFixture (오늘 기준 상대 날짜). 저장 해제는 이 화면 상태에서 실제로 빠진다.
 * 줄을 누르면 실제 앱처럼 상세 자리 창이 내 정보 창 위로 뜨고, 화면에 'openRace: <id>' 를 적는다.
 * 아래 회색 상자는 내 정보의 다른 구역 자리 — '내 일정 구독' 자리에 id="me-feed" 를 달아 구독 버튼 스크롤을 본다.
 */
import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { LangProvider, useLang } from '../i18n';
import { raceName } from '../i18n/names';
import type { Race } from '../lib/types';
import { MyRacesProvider, type MyRacesBridge } from '../lib/myRacesContext';
import SavedRaces from '../components/SavedRaces';
import { Button, CloseButton, Panel } from '../components/ui';
import { emptyFixture, fixture } from './myRacesFixture';

const q = new URLSearchParams(location.search);
const who = q.get('who') === 'guest' ? 'guest' : 'member';
const st = q.get('state');
const state = st === 'empty' || st === 'local' || st === 'loading' ? st : 'full';
// 비로그인은 늘 브라우저 저장분
const synced = who === 'member' && state === 'full';

/** 내 정보의 다른 구역 자리. 닉네임(form)은 실제로 위 선이 없다 → top={false} */
function Placeholder({ label, id, top = true }: { label: string; id?: string; top?: boolean }) {
  return (
    <section id={id} className={top ? 'border-t border-line pt-5' : undefined}>
      <div className="grid h-24 place-items-center rounded-box bg-sunken text-[13px] text-ink-3">{label}</div>
    </section>
  );
}

export default function Preview() {
  const { lang, t } = useLang();
  const start = useMemo(() => (state === 'empty' ? emptyFixture() : fixture(undefined, { synced })), []);
  const [favIds, setFavIds] = useState(start.favIds);
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<Race | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const say = (s: string) => setLog((l) => [...l, s]);

  const bridge: MyRacesBridge = useMemo(
    () => ({
      races: state === 'loading' ? [] : start.races,
      loading: state === 'loading',
      favIds,
      toggleFavorite: (id) => {
        say(`toggleFavorite: ${id}`);
        setFavIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
      },
      favSynced: synced,
      registeredIds: start.registeredIds,
      records: start.records,
      loggedIn: who === 'member',
      openRace: (r) => {
        say(`openRace: ${r.id}`);
        setSelected(r);
      },
      onLogin: () => say('onLogin'),
    }),
    [start, favIds],
  );

  return (
    <div className="min-h-dvh">
      <main className="mx-auto max-w-6xl space-y-3 px-4 py-6 text-[15px] text-ink-2 sm:px-6">
        <p>
          내 정보 미리보기 — who={who}, state={state}, lang={lang}
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          {t('auth.me')}
        </Button>
        <ol data-log className="space-y-1 font-semibold text-ink">
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      </main>
      <MyRacesProvider value={bridge}>
        <Panel open={open} onClose={() => setOpen(false)} label={t('auth.me')} variant="sheet">
          <div className="space-y-6 p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[20px] font-bold tracking-tight">{t('auth.me')}</h2>
              <CloseButton onClick={() => setOpen(false)} />
            </div>
            <SavedRaces />
            <Placeholder label={t('auth.nick')} top={false} />
            <Placeholder label={t('me.records.title')} />
            <Placeholder id="me-feed" label={t('me.feed.title')} />
            <Placeholder label={t('me.alerts.title')} />
          </div>
        </Panel>
      </MyRacesProvider>
      {/* 실제 앱의 대회 상세 자리 — 나중에 연 dialog 가 위에 뜬다 */}
      <Panel open={!!selected} onClose={() => setSelected(null)} label={selected ? raceName(selected, lang) : t('panel.race')}>
        {selected && (
          <div className="space-y-4 p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[20px] font-bold tracking-tight">{raceName(selected, lang)}</h2>
              <CloseButton onClick={() => setSelected(null)} />
            </div>
            <p className="text-[15px] text-ink-2">상세 자리 (미리보기) — {selected.id}</p>
          </div>
        )}
      </Panel>
    </div>
  );
}

if (import.meta.env.DEV) {
  const lang = q.get('lang') === 'en' ? 'en' : 'ko';
  document.documentElement.lang = lang;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LangProvider initial={lang}>
        <Preview />
      </LangProvider>
    </StrictMode>,
  );
}
