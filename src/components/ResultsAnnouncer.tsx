/**
 * 검색 결과 수를 스크린 리더에 알린다 (화면에는 안 보임).
 * live 영역은 처음부터 DOM 에 있어야 바뀐 내용이 읽히므로 항상 렌더하고 내용만 바꾼다.
 * 결과 0개 문장은 화면 문구('‘○○’ 대회를 찾지 못했습니다.', '혹시 이 대회인가요?') 그대로.
 * 필터 때문에 안 보이는 대회가 있으면 그 수를, 한/영 자판을 바꿔 찾았으면 바꾼 검색어를 덧붙인다.
 */
import { useLang } from '../i18n';
import { fmtCount } from '../i18n/format';

export function ResultsAnnouncer({
  query,
  count,
  suggestions,
  loading,
  hidden = 0,
  fixed = null,
}: {
  query: string;
  count: number;
  suggestions: number;
  loading: boolean;
  /** 필터 때문에 안 보이는 대회 수 */
  hidden?: number;
  /** 한/영 자판을 바꿔 찾은 경우 바꾼 검색어 */
  fixed?: string | null;
}) {
  const { lang, t } = useLang();
  const extra = `${fixed ? t('announce.fixed', { q: fixed }) : ''}${hidden > 0 ? t('announce.hidden', { n: fmtCount(hidden, lang) }) : ''}`;
  const text =
    loading || !query
      ? ''
      : count > 0
        ? `${t('announce.results', { q: query, count: fmtCount(count, lang) })}${extra}`
        : `${t('list.notFound', { q: query })}${extra}${suggestions > 0 ? t('announce.suggest', { n: suggestions }) : ''}`;
  return (
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </p>
  );
}
