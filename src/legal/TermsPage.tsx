/** 이용약관 본문: 조항 섹션을 차례로 그린다 (PLAN 3-8) */
import TermsMember from './TermsMember';

// 데이터 이용 제한 조항(antiscrape 세션)은 이 배열에 추가
const SECTIONS = [TermsMember];

export default function TermsPage() {
  return (
    <>
      {SECTIONS.map((S, i) => (
        <S key={i} />
      ))}
    </>
  );
}
