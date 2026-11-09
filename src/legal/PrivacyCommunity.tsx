/**
 * 처리방침 1항 '모으는 개인정보' 안의 러닝톡(커뮤니티) 항목. PrivacyPolicy 의 수집 절에서 한 줄로 그린다.
 * 파기 내용은 0014_community.sql 과 같아야 한다: 탈퇴(auth.users 삭제) → 글·댓글·좋아요·신고가 cascade 로 함께 삭제,
 * 직접 지운 글·댓글은 제목·본문을 바로 비움(status='deleted'), 신고 기록은 대상이 지워지거나 신고한 회원이 탈퇴할 때까지.
 */
import type { Lang } from '../i18n/lang';

const ROWS: Record<Lang, [string, string][]> = {
  ko: [
    ['목적', '러닝톡 게시판 운영(글·댓글 작성과 표시), 작성자 표시(닉네임), 신고 처리와 이용 제한, 광고·도배 방지'],
    ['항목', '작성한 글(제목·내용·카테고리·연결한 대회)과 댓글, 좋아요, 신고한 사유·설명, 작성·수정 시각, 이용 제한(글쓰기 정지) 기록'],
    [
      '보유기간',
      '회원 탈퇴 때까지. 탈퇴하면 글·댓글·좋아요·신고 기록을 즉시 삭제하고, 그 글에 달린 다른 회원의 댓글도 함께 삭제됩니다. 직접 지운 글·댓글은 제목·내용을 바로 비우고 ‘삭제된 글’ 자리만 남깁니다. 신고 기록은 신고한 글·댓글이 데이터베이스에서 삭제되거나(작성자 탈퇴 등) 신고한 회원이 탈퇴할 때까지 보관합니다.',
    ],
    ['거부할 권리', '러닝톡에 글을 쓰지 않으면 이 정보는 생기지 않습니다. 글 제목 목록은 가입 없이 볼 수 있고, 본문·댓글 읽기와 쓰기는 메일 인증을 마친 회원만 할 수 있습니다.'],
  ],
  en: [
    ['Purpose', 'Running the Run Talk board (writing and showing posts and comments), showing the author (nickname), handling reports and restrictions, and keeping out ads and spam'],
    ['Items', 'Posts you write (title, text, category, linked race) and comments, likes, report reasons and notes, posting and editing times, and posting restriction records'],
    [
      'Retention',
      'Until you delete your account. When you do, your posts, comments, likes and reports are deleted immediately, along with other members’ comments on your posts. Posts and comments you delete yourself have their title and text cleared right away, leaving only a “deleted” placeholder. Reports are kept until the reported post or comment is removed from the database (for example when its author deletes their account) or the reporting member deletes their account.',
    ],
    ['Your right to refuse', 'If you don’t post on Run Talk, none of this is created. Post titles can be browsed without an account; reading full posts and comments, and writing, are for members who have confirmed their email.'],
  ],
};

export function PrivacyCommunity({ lang }: { lang: Lang }) {
  return (
    <>
      <h3>{lang === 'ko' ? '러닝톡(게시판)' : 'Run Talk (community board)'}</h3>
      <table>
        <tbody>
          {ROWS[lang].map(([th, td]) => (
            <tr key={th}>
              <th scope="row">{th}</th>
              <td>{td}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
