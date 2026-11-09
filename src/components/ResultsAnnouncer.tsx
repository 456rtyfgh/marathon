/**
 * 검색 결과 수를 스크린 리더에 알린다 (화면에는 안 보임).
 * live 영역은 처음부터 DOM 에 있어야 바뀐 내용이 읽히므로 항상 렌더하고 내용만 바꾼다.
 * 결과 0개 문장은 화면 문구('‘○○’ 대회를 찾지 못했습니다.', '혹시 이 대회인가요?') 그대로.
 */
import { useLang } from '../i18n';

export function ResultsAnnouncer({
  query,
  count,
  suggestions,
  loading,
}: {
  query: string;
  count: number;
  suggestions: number;
  loading: boolean;
}) {
  const { t } = useLang();
  const text =
    loading || !query
      ? ''
      : count > 0
        ? t('announce.results', { q: query, count })
        : `${t('list.notFound', { q: query })}${suggestions > 0 ? t('announce.suggest', { n: suggestions }) : ''}`;
  return (
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </p>
  );
}
