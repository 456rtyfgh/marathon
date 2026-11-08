/** 목록 section id (App.tsx 의 <section id="list">) */
export const RESULTS_ID = 'list';
/** 결과 0개 안내 블록 id ('‘○○’ 대회를 찾지 못했습니다.' + '혹시 이 대회인가요?') */
export const RESULTS_EMPTY_ID = 'list-empty';

/**
 * 검색 결과 위치로 스크롤. 결과 0개 안내(#list-empty)가 있으면 그쪽, 없으면 #list.
 * behavior 는 주지 않는다 — index.css 의 html { scroll-behavior: smooth } 로 부드럽게, reduced-motion 이면 바로 이동.
 * 고정 헤더에 가리지 않는 여백은 대상의 scroll-margin-top(scroll-mt-*) 이 맡는다.
 * 키보드가 닫히며 화면 높이가 바뀌는 중에 좌표가 흔들리지 않게 한 프레임 뒤에 스크롤한다 (고른 대상은 바로 돌려준다).
 * 대상이 없으면 아무것도 안 하고 null.
 */
export function scrollToResults(): 'empty' | 'list' | null {
  const empty = document.getElementById(RESULTS_EMPTY_ID);
  const el = empty ?? document.getElementById(RESULTS_ID);
  if (!el) return null;
  requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  return empty ? 'empty' : 'list';
}
