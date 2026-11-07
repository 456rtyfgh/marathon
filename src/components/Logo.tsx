/**
 * 헤더 로고: 심볼(남색 타일) + 'marathoncalendar' 워드마크. 파일은 scripts/brand.mjs 가 만든다.
 * 다크 모드(prefers-color-scheme: dark)에서는 흰 타일 심볼 + 흰 워드마크.
 * 워드마크 비율 2314:200 — 높이를 바꾸면 너비도 같이 바꾼다.
 */
export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <picture className="shrink-0">
        <source srcSet="/brand/symbol-inverse.svg" media="(prefers-color-scheme: dark)" />
        <img src="/brand/symbol.svg" width={32} height={32} alt="" className="block size-8" />
      </picture>
      <picture>
        <source srcSet="/brand/wordmark-inverse.svg" media="(prefers-color-scheme: dark)" />
        <img src="/brand/wordmark.svg" width={162} height={14} alt="마라톤 캘린더" className="block h-[13px] w-auto sm:h-[15px]" />
      </picture>
    </span>
  );
}
