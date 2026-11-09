import { useMemo } from 'react';
import type { Race, RaceRating } from '../lib/types';
import { similarRaces } from '../lib/similar';
import RaceRow from './RaceRow';
import { useLang } from '../i18n';

/** 상세(정보 탭) 맨 아래 — 같은 지역·가까운 달·같은 종목 대회. 목록 행 모양 그대로, 누르면 그 대회 상세 */
export default function SimilarRaces({
  race,
  races,
  ratingMap,
  isFavorite,
  isRegistered,
  onOpen,
}: {
  race: Race;
  races: Race[];
  ratingMap?: Map<string, RaceRating>;
  isFavorite?: (id: string) => boolean;
  isRegistered?: (id: string) => boolean;
  onOpen: (race: Race) => void;
}) {
  const { t } = useLang();
  const list = useMemo(() => similarRaces(race, races), [race, races]);
  if (!list.length) return null;
  return (
    <section>
      <h3 className="text-[15px] font-bold">{t('similar.title')}</h3>
      {/* 목록 행은 자체 좌우 여백이 있어, 본문 글자 줄과 맞게 그만큼 바깥으로 뺀다 */}
      <ul className="-mx-3 mt-2 divide-y divide-line border-y border-line sm:-mx-5">
        {list.map((r) => (
          <RaceRow
            key={r.id}
            race={r}
            rating={ratingMap?.get(r.id)}
            favorite={isFavorite?.(r.id)}
            registered={isRegistered?.(r.id)}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </section>
  );
}
