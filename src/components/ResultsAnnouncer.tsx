/**
 * 검색 결과 수를 스크린 리더에 알린다 (화면에는 안 보임).
 * live 영역은 처음부터 DOM 에 있어야 바뀐 내용이 읽히므로 항상 렌더하고 내용만 바꾼다.
 * 결과 0개 문장은 화면 문구('‘○○’ 대회를 찾지 못했습니다.', '혹시 이 대회인가요?') 그대로.
 */
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
  const text =
    loading || !query
      ? ''
      : count > 0
        ? `‘${query}’ 검색 결과 ${count}개`
        : `‘${query}’ 대회를 찾지 못했습니다.${suggestions > 0 ? ` 혹시 이 대회인가요? ${suggestions}개` : ''}`;
  return (
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </p>
  );
}
