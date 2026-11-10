/**
 * 내 정보 맨 위 '저장한 대회': 저장(user_favorites)·접수했어요·참가했어요 대회를 묶음별로 한눈에.
 * 데이터는 App 이 갖고 있는 저장·접수 상태(useMyRaceList — lib/myRacesContext) 그대로 — 여기서 저장 해제하면 목록·상세에도 바로 반영된다.
 * 묶음·정렬·D-day 계산은 lib/myRaces.ts. 이 파일은 그리기만 한다.
 * 내 정보 창(dialog.sheet)은 최대 420px 이라 PC 도 휴대폰과 같은 좁은 한 줄 배치.
 */
import { useState } from 'react';
import { ArrowDown, BookmarkSimple, Check } from '@phosphor-icons/react';
import { useLang } from '../i18n';
import type { Key } from '../i18n/t';
import { DIST_TEXT, STATUS_TEXT } from '../i18n/format';
import { raceName, whereText } from '../i18n/names';
import { expectedEntryText, fmtDate, TODAY } from '../lib/util';
import { fmtFinish } from '../lib/member';
import { MY_GROUPS, type MyGroup, type MyRaceItem } from '../lib/myRaces';
import { useMyRaceList } from '../lib/myRacesContext';
import { Button, MoreButton } from './ui';

type Filter = 'all' | MyGroup;

const GROUP_KEY: Record<MyGroup, Key> = {
  open: 'me.saved.group.open',
  soon: 'me.saved.group.soon',
  registered: 'me.saved.group.registered',
  waiting: 'me.saved.group.waiting',
  past: 'me.saved.group.past',
};

/** 전체 보기에서 지난 대회는 처음 몇 개만 */
const PAST_FIRST = 3;

const TAG = 'inline-flex h-5 items-center rounded-tag px-1.5 text-[12px] font-bold whitespace-nowrap';
const dday = (n: number) => (n === 0 ? 'D-DAY' : `D-${n}`);

export default function SavedRaces() {
  const data = useMyRaceList();
  const { t } = useLang();
  const [filter, setFilter] = useState<Filter>('all');
  const [pastAll, setPastAll] = useState(false);
  if (!data) return null;
  const { bridge, list } = data;
  const { summary, byGroup, items } = list;
  // 고른 묶음이 (저장 해제로) 비면 전체로
  const shown: Filter = filter !== 'all' && byGroup[filter].length === 0 ? 'all' : filter;
  const groups = MY_GROUPS.filter((g) => byGroup[g].length > 0 && (shown === 'all' || shown === g));
  const showFeed = bridge.loggedIn && bridge.favSynced;

  return (
    <section aria-labelledby="me-saved-title" className="space-y-4 border-b border-line pb-6">
      <h3 id="me-saved-title" className="text-[15px] font-semibold text-ink">
        {t('me.saved.title')}
      </h3>

      {/* 안내는 목록 위에 — 목록이 길면 아래 것은 안 보인다 */}
      {!bridge.loading && !bridge.loggedIn && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-box bg-sunken px-4 py-3">
          <p className="min-w-0 flex-1 basis-48 text-[13px] leading-relaxed text-ink-2">{t('me.saved.guest')}</p>
          <Button size="sm" onClick={bridge.onLogin}>
            {t('auth.login')}
          </Button>
        </div>
      )}
      {!bridge.loading && bridge.loggedIn && !bridge.favSynced && items.length > 0 && (
        <p className="text-[13px] leading-relaxed text-ink-3">{t('me.saved.local')}</p>
      )}

      {bridge.loading ? (
        <p aria-busy="true" className="text-[15px] text-ink-3">
          {t('me.saved.loading')}
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-box border border-dashed border-line px-4 py-4">
          <p className="text-[15px] font-semibold text-ink">{t('me.saved.emptyTitle')}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            <BookmarkSimple size={14} weight="bold" className="mr-1 inline-block align-[-2px]" aria-hidden />
            {t('me.saved.emptyHow', { btn: t('detail.save') })}
          </p>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-box bg-line">
            <Stat label={t('me.saved.sumSaved')} value={t('me.saved.count', { n: summary.saved })} />
            <Stat
              label={t('me.saved.sumOpen')}
              value={t('me.saved.count', { n: summary.open })}
              hint={summary.closingSoon > 0 ? t('me.saved.sumUrgent', { n: summary.closingSoon }) : undefined}
            />
            <Stat label={t('me.saved.sumOpensMonth')} value={t('me.saved.count', { n: summary.opensThisMonth })} />
            <Stat label={t('me.saved.sumRegistered')} value={t('me.saved.count', { n: summary.registered })} />
          </dl>

          {showFeed && (
            <button
              type="button"
              onClick={() => document.getElementById('me-feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="inline-flex min-h-11 items-center gap-2 rounded-ctl bg-sunken px-3 py-2 text-left text-[15px] leading-snug font-semibold text-ink transition hover:bg-line active:translate-y-px sm:min-h-9"
            >
              <ArrowDown size={16} weight="bold" aria-hidden />
              {t('me.saved.toFeed')}
            </button>
          )}

          {/* 칩 한 줄 가로 스크롤 — 창 안쪽 여백(p-6)까지 끝까지 밀어 잘린 칩이 보이게. 위아래 4px 는 초점 테두리 자리 */}
          <div
            role="group"
            aria-label={t('me.saved.filterAria')}
            className="-mx-6 flex gap-2 overflow-x-auto px-6 py-1 [scrollbar-width:none] [&>*]:shrink-0"
          >
            <FilterChip on={shown === 'all'} onClick={() => setFilter('all')} label={t('me.saved.all')} n={items.length} />
            {MY_GROUPS.filter((g) => byGroup[g].length > 0).map((g) => (
              <FilterChip key={g} on={shown === g} onClick={() => setFilter(g)} label={t(GROUP_KEY[g])} n={byGroup[g].length} />
            ))}
          </div>

          <div className="space-y-5">
            {groups.map((g) => {
              const all = byGroup[g];
              const cut = g === 'past' && shown === 'all' && !pastAll && all.length > PAST_FIRST;
              const rows = cut ? all.slice(0, PAST_FIRST) : all;
              return (
                <div key={g}>
                  <h4 className="flex items-baseline gap-2 text-[13px] font-semibold text-ink-2">
                    {t(GROUP_KEY[g])}
                    <span className="num font-normal text-ink-3">{all.length}</span>
                  </h4>
                  <ul className="mt-1 divide-y divide-line border-y border-line">
                    {rows.map((it) => (
                      <Row key={it.race.id} item={it} onOpen={() => bridge.openRace(it.race)} onUnsave={() => bridge.toggleFavorite(it.race.id)} />
                    ))}
                  </ul>
                  {cut && <MoreButton left={all.length - PAST_FIRST} onClick={() => setPastAll(true)} className="mt-2 w-full" />}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface px-3 py-3">
      <dt className="text-[13px] leading-snug text-ink-3">{label}</dt>
      <dd className="num mt-1 text-[17px] leading-7 font-semibold text-ink">{value}</dd>
      {hint && (
        <dd className="mt-1">
          {/* 반 칸 너비라 영어('2 closing within 7 days')는 좁은 휴대폰에서 넘친다 — 한 줄 고정(TAG) 대신 줄바꿈 허용 */}
          <span className="inline-block rounded-tag bg-accent px-1.5 py-0.5 text-[12px] leading-4 font-bold text-on-accent">{hint}</span>
        </dd>
      )}
    </div>
  );
}

/** 선택 = 테두리 진하게 + 체크 (검정으로 꽉 채우지 않는다) */
function FilterChip({ on, onClick, label, n }: { on: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex h-11 items-center gap-1.5 rounded-ctl border bg-surface px-3 text-[15px] font-semibold whitespace-nowrap transition-colors active:translate-y-px sm:h-9 ${
        on ? 'border-ink text-ink' : 'border-line text-ink-2 hover:border-ink-3 hover:text-ink'
      }`}
    >
      {on && <Check size={14} weight="bold" aria-hidden />}
      {label}
      <span className={`num text-[13px] ${on ? 'text-ink-2' : 'text-ink-3'}`}>{n}</span>
    </button>
  );
}

function Row({ item, onOpen, onUnsave }: { item: MyRaceItem; onOpen: () => void; onUnsave: () => void }) {
  const { lang, t } = useLang();
  const { race, group, status, record, urgent } = item;
  const name = raceName(race, lang);
  const finished = record?.status === 'finished';
  const cancelled = status === 'cancelled';
  // 배지: 접수 완료·지난 대회는 내 상태, 나머지는 접수 상태
  const badge =
    group === 'past'
      ? finished
        ? t('me.saved.finished')
        : t('st.raceOver')
      : group === 'registered'
        ? t('row.registered')
        : STATUS_TEXT[lang][status];
  const badgeCls =
    group === 'registered' || (group === 'past' && finished)
      ? 'border border-ink text-ink'
      : group === 'open'
        ? 'bg-sunken text-ink'
        : 'border border-line text-ink-3';
  // 거리: 기록에 고른 종목이 있으면 그것만, 아니면 대회 종목 전부
  const dists = record?.distance ? [record.distance] : race.distances;
  const distText = dists.map((d) => DIST_TEXT[lang](d)).join(' · ');
  const expected = group === 'waiting' && !cancelled ? expectedEntryText(race, TODAY(), lang) : null;

  // 오른쪽 칸: D-day(접수 마감·시작·대회까지) / 지난 대회 기록
  let right: { label: string; value: string | null } | null = null;
  if (item.dday) {
    const { kind, days } = item.dday;
    const label =
      kind === 'closes'
        ? t(days === 0 ? 'st.closesToday' : 'st.closesIn')
        : kind === 'opens'
          ? t('st.opensIn')
          : t(days === 0 ? 'st.raceToday' : 'st.raceIn');
    right = { label, value: dday(days) };
  } else if (finished && record?.finish_sec != null) {
    right = { label: t('me.saved.record'), value: fmtFinish(record.finish_sec) };
  } else if (group === 'open') {
    // 접수 중인데 마감일이 없는 대회 (선착순 — 정원이 차면 마감)
    right = { label: t('st.untilFull'), value: null };
  }

  return (
    <li className="flex items-stretch gap-1">
      <button
        type="button"
        onClick={onOpen}
        className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-3 pr-1 text-left transition-colors hover:bg-sunken"
      >
        <span className="min-w-0">
          <span className={`block text-[15px] leading-snug font-semibold break-words ${cancelled ? 'text-ink-2' : 'text-ink'}`}>{name}</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">
            {fmtDate(race.race_date, lang)} · {whereText(race, lang)}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-5 text-ink-3">
            <span className={`${TAG} ${badgeCls}`}>{badge}</span>
            {distText && <span className="min-w-0 break-words">{distText}</span>}
            {expected && <span className="num whitespace-nowrap">{expected}</span>}
          </span>
        </span>
        {right && (
          <span className="flex max-w-[6.5rem] flex-col items-end text-right">
            <span className={`text-[12px] text-ink-3 ${right.value ? 'whitespace-nowrap' : 'leading-snug'}`}>{right.label}</span>
            {right.value && (
              <span
                className={`num mt-0.5 inline-block rounded-tag px-1 text-[20px] leading-tight font-bold whitespace-nowrap ${
                  urgent ? 'bg-accent text-on-accent' : 'text-ink'
                }`}
              >
                {right.value}
              </span>
            )}
          </span>
        )}
      </button>
      {item.saved ? (
        <button
          type="button"
          onClick={onUnsave}
          aria-label={t('me.saved.unsave', { name })}
          title={t('me.saved.unsaveTitle')}
          className="grid size-11 shrink-0 place-items-center self-center rounded-ctl text-ink transition hover:bg-sunken active:scale-95"
        >
          <BookmarkSimple size={18} weight="fill" aria-hidden />
        </button>
      ) : (
        // 저장 안 한(접수·참가만 표시한) 대회: 버튼 자리를 비워 D-day 줄을 맞춘다
        <span className="w-11 shrink-0" aria-hidden />
      )}
    </li>
  );
}
