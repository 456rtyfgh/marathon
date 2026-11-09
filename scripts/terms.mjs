/**
 * 빌드 뒤 이용약관 정적 페이지를 만든다: dist/terms.html (/terms), dist/en/terms.html (/en/terms).
 * 인용한 법 조항은 국가법령정보센터 원문으로 확인한 것만 (.duo-data/antiscrape-legal.md).
 * 조(條)는 <section id="…"> 하나씩이다 — 개인정보 처리 조항 등을 붙일 때는 SECTIONS 에 같은 꼴로 한 칸 더 넣는다.
 * 회원 조항(제6~11조)도 여기가 원본이다 (예전 SPA 의 src/legal/TermsMember.tsx 를 옮김). 시행일·개정 이력은 src/lib/policy.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ORIGIN, esc, headLinks } from './seo-lib.mjs';
import { TERMS_PATH, noticeHtml } from '../src/lib/notice.ts';
import { CONTACT_EMAIL, POLICY_VERSION, PRIVACY_PATH, REVISIONS } from '../src/lib/policy.ts';

/** 시행일 (처리방침과 같은 POLICY_VERSION) */
const [Y, M, D] = POLICY_VERSION.split('-').map(Number);
const EFFECTIVE = {
  iso: POLICY_VERSION,
  ko: `${Y}년 ${M}월 ${D}일`,
  en: new Date(Date.UTC(Y, M - 1, D)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }),
};
const MAIL = CONTACT_EMAIL;
const PRIVACY = { ko: PRIVACY_PATH, en: `/en${PRIVACY_PATH}` };
const mail = `<a href="mailto:${MAIL}">${MAIL}</a>`;
const LAW = {
  copyright: 'https://www.law.go.kr/법령/저작권법',
  unfair: 'https://www.law.go.kr/법령/부정경쟁방지및영업비밀보호에관한법률',
  network: 'https://www.law.go.kr/법령/정보통신망이용촉진및정보보호등에관한법률',
};

const STYLE = `:root{color-scheme:light dark;--bg:#f1f2f4;--fg:#15171a;--mute:#5d636b;--line:#dcdfe3;--card:#fff;--link:#0b57d0}
@media (prefers-color-scheme:dark){:root{--bg:#0e0f11;--fg:#e8eaed;--mute:#9aa0a6;--line:#2a2d31;--card:#17191c;--link:#8ab4f8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.7 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;word-break:keep-all}
a{color:var(--link)}header{display:flex;align-items:center;justify-content:space-between;gap:1rem;max-width:48rem;margin:0 auto;padding:1rem}
.brand{font-weight:800;font-size:1.1rem;text-decoration:none;color:var(--fg)}
main{max-width:48rem;margin:0 auto;padding:0 1rem 3rem}h1{font-size:1.6rem;line-height:1.3;margin:.5rem 0}
h2{font-size:1.1rem;margin:2rem 0 .5rem;padding-top:1rem;border-top:1px solid var(--line)}
.lead,.meta{color:var(--mute)}ol,ul{padding-left:1.4rem}li{margin:.25rem 0}
footer{max-width:48rem;margin:0 auto;padding:2rem 1rem;color:var(--mute);font-size:.9rem}`;

/** 개정 이력 (최신이 앞, 처리방침 페이지와 같은 REVISIONS) */
const revisions = (lang) => `<ul>
${REVISIONS.map((r) => `<li>${r.version} — ${esc(r[lang])}</li>`).join('\n')}
</ul>`;

const SECTIONS = {
  ko: [
    {
      id: 'purpose',
      h: '제1조 (목적과 적용)',
      body: `<p>이 약관은 마라톤 캘린더(${ORIGIN}, 이하 “사이트”)와 사이트에 실린 대회 정보의 이용 조건을 정합니다. 회원 가입 여부와 관계없이 사이트에 접속하는 모든 사람과, 사람 대신 사이트에 접속하는 프로그램(크롤러·봇·스크립트 등)을 운영하는 자(이하 “이용자”)에게 적용됩니다.</p>`,
    },
    {
      id: 'database',
      h: '제2조 (대회 데이터베이스와 권리)',
      body: `<ol>
<li>사이트에 실린 국내·해외 마라톤·트레일러닝 대회 정보(대회명, 날짜, 장소, 종목, 접수 방식과 기간, 참가비, 공식 홈페이지 주소 등)와 그 목록·분류·검색 구성은 운영자가 직접 조사하고 계속 갱신·검증·보충해 만든 데이터베이스(이하 “대회 데이터베이스”)입니다.</li>
<li>대회 데이터베이스에 대한 권리는 운영자에게 있습니다. 운영자는 「저작권법」 제93조(데이터베이스제작자의 권리), 「부정경쟁방지 및 영업비밀보호에 관한 법률」 제2조 제1호 파목 등 관련 법령에 따른 보호를 주장합니다.</li>
</ol>`,
    },
    {
      id: 'data-use',
      h: '제3조 (데이터 이용 제한)',
      body: `<ol>
<li>누구든지 운영자의 사전 서면 허락 없이 다음 행위를 해서는 안 됩니다.
<ol>
<li>크롤링·스크래핑·봇·자동화된 스크립트, 사이트 화면을 거치지 않은 데이터 파일·API 직접 호출 등 자동화 수단으로 대회 데이터베이스의 전부 또는 일부를 수집하는 행위, 그리고 사이트가 적용한 접근 제한(접속 차단, 요청 횟수 제한 등)을 우회하는 행위</li>
<li>대회 데이터베이스의 전부 또는 상당한 부분을 복제·배포·전송하거나, 일부라도 반복적이거나 체계적으로 복제하는 행위</li>
<li>수집하거나 복제한 대회 정보를 다른 웹사이트·앱·서비스·데이터셋에 재배포하거나, 판매·광고 등 상업적으로 이용하는 행위</li>
</ol></li>
<li>사이트는 자동화 수단에 의한 접근을 허락하지 않습니다. 다만 검색 서비스가 검색 결과에 사이트를 보여 주기 위해 <a href="/robots.txt">robots.txt</a> 에 따라 공개 페이지를 수집·색인하는 것은 허락합니다.</li>
<li>사이트 화면에서 대회 정보를 보고 개인적으로 메모하거나, 대회 페이지 주소를 다른 사람에게 공유하는 것은 이 조의 제한을 받지 않습니다.</li>
</ol>`,
    },
    {
      id: 'enforcement',
      h: '제4조 (위반 시 조치)',
      body: `<ol>
<li>운영자는 제3조를 위반한 접속을 확인하면 미리 알리지 않고 그 접속(IP 주소, 프로그램 등)의 사이트 접근을 차단하거나 제한할 수 있습니다.</li>
<li>운영자는 위반 행위에 대하여 「저작권법」(제123조 침해의 정지 등 청구, 제125조 손해배상의 청구, 제136조 제3항 제3호), 「부정경쟁방지 및 영업비밀보호에 관한 법률」(제4조 금지청구, 제5조 손해배상), 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」(제48조 제1항) 등 관련 법령에 따라 침해 정지·손해배상 청구, 고소 등 법적 조치를 할 수 있습니다.</li>
</ol>`,
    },
    {
      id: 'contact',
      h: '제5조 (이용 허락과 문의)',
      body: `<p>대회 정보를 제3조에서 제한하는 방법으로 이용하려면 이용 목적과 범위를 적어 ${mail} 로 문의해 주세요. 운영자가 서면(이메일 포함)으로 허락한 범위에서만 이용할 수 있습니다.</p>`,
    },
    {
      id: 'signup',
      h: '제6조 (회원가입)',
      body: `<p>대회 일정 보기는 회원가입 없이 쓸 수 있습니다. 캘린더 파일 받기·일정 알림 신청·후기 작성·대회 추가 요청·러닝톡(게시판)과 저장한 대회 동기화·내 일정 캘린더 구독·내 기록 같은 회원 기능에는 회원 계정이 필요합니다.</p>
<ol>
<li>만 14세 이상이고 이 약관과 개인정보 수집·이용에 동의하면 가입할 수 있습니다.</li>
<li>실제로 쓰는 이메일로 가입하고, 그 메일로 확인하면 가입이 끝납니다. 다른 사람의 이메일로 가입할 수 없습니다.</li>
<li>모으는 정보와 처리 방법은 <a href="${PRIVACY.ko}">개인정보 처리방침</a>에 적혀 있습니다.</li>
</ol>`,
    },
    {
      id: 'account',
      h: '제7조 (계정 관리)',
      body: `<ol>
<li>비밀번호는 회원이 직접 관리하며, 다른 사람이 계정을 쓰게 해서는 안 됩니다.</li>
<li>다른 사람이 계정을 쓴 것 같으면 비밀번호를 바꾸고 ${mail} 로 알려 주세요.</li>
</ol>`,
    },
    {
      id: 'nickname',
      h: '제8조 (닉네임)',
      body: `<ol>
<li>닉네임은 후기·대회 요청과 러닝톡 글·댓글의 작성자로 표시됩니다. 2~16자이고 다른 회원과 겹치지 않아야 합니다.</li>
<li>운영자로 오해할 수 있는 이름(관리자·운영자·마라톤 캘린더 등), 다른 사람을 사칭하는 이름, 욕설·광고성 이름은 쓸 수 없습니다. 이런 닉네임은 바꾸도록 요청하거나 운영자가 바꿀 수 있습니다.</li>
</ol>`,
    },
    {
      id: 'posts',
      h: '제9조 (게시물)',
      body: `<ol>
<li>후기·대회 요청과 러닝톡 글·댓글(이하 “게시물”)의 책임은 작성한 회원에게 있습니다. 사실이 아닌 내용, 욕설·비방, 광고, 다른 사람의 권리를 침해하는 내용은 올릴 수 없습니다.</li>
<li>전화번호·주소처럼 다른 사람의 개인정보를 올려서는 안 됩니다.</li>
<li>자기 후기와 러닝톡 글·댓글은 언제든 지울 수 있습니다. 이 약관을 어긴 게시물은 운영자가 알리지 않고 가리거나 지울 수 있습니다(러닝톡은 제12조).</li>
</ol>`,
    },
    {
      id: 'delete-account',
      h: '제10조 (회원 탈퇴와 게시물 처리)',
      body: `<ol>
<li>회원은 언제든 ‘내 정보’에서 탈퇴할 수 있으며, 기다리는 기간은 없습니다.</li>
<li>탈퇴하면 계정·이메일·닉네임을 즉시 파기하고 작성한 후기와 러닝톡 글·댓글·좋아요·신고도 함께 삭제합니다. 탈퇴한 회원의 러닝톡 글에 달린 다른 회원의 댓글도 그 글과 함께 삭제됩니다. 대회 추가 요청·조기 마감 제보는 모든 이용자를 위한 대회 정보라서 작성자 표시 없이 남습니다. 탈퇴는 되돌릴 수 없습니다.</li>
</ol>`,
    },
    {
      id: 'restriction',
      h: '제11조 (이용 제한)',
      body: `<ol>
<li>이 약관을 되풀이해 어기거나 스팸을 올리거나 서비스 운영을 방해하면 글쓰기를 제한하거나 계정을 삭제할 수 있습니다. 급한 경우가 아니면 먼저 이메일로 이유를 알립니다. 다만 러닝톡의 신고 자동 숨김과 글쓰기 정지는 제12조에 따라 먼저 알리지 않고 할 수 있습니다.</li>
<li>제한에 이의가 있으면 ${mail} 로 알려 주세요.</li>
</ol>`,
    },
    {
      id: 'community',
      h: '제12조 (러닝톡 게시물)',
      body: `<p>러닝톡은 회원이 대회 질문·동행·크루·대회 정보 등을 나누는 게시판입니다. 제9조가 그대로 적용되고, 아래 내용을 더합니다.</p>
<ol>
<li>공개 범위: 글의 제목·카테고리·연결한 대회·닉네임·작성일·댓글 수는 누구나 볼 수 있고 검색 서비스에 노출될 수 있습니다. 글 본문과 댓글은 메일 인증을 마친 회원에게만 보입니다. 글쓰기·댓글·좋아요·신고도 메일 인증을 마친 회원만 할 수 있습니다.</li>
<li>금지 내용: 제9조의 내용과 함께 상업 광고·홍보, 같은 내용을 되풀이해 올리는 도배, 메신저 아이디·단축 주소 등 외부 연락 유도, 불법 정보, 다른 사람을 사칭하는 글은 올릴 수 없습니다. 광고·도배를 막기 위해 외부 링크는 글 하나에 1개까지, 짧은 시간·하루에 올릴 수 있는 글과 댓글 수에 한도가 있습니다.</li>
<li>운영자 조치: 운영자는 이 약관을 어긴 글·댓글을 숨기거나 삭제할 수 있습니다. 서로 다른 회원 3명이 신고한 글·댓글은 자동으로 숨겨지고, 운영자가 확인한 뒤 다시 보이게 하거나 삭제합니다. 되풀이해 어기면 글쓰기를 1일·7일 동안 또는 영구히 정지할 수 있습니다.</li>
<li>임시조치: 글·댓글 때문에 사생활 침해나 명예훼손 등 권리를 침해당했다는 사람이 소명과 함께 삭제를 요청하면, 운영자는 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 제44조의2에 따라 그 게시물을 최대 30일 동안 임시로 가릴 수 있습니다. 작성자는 그 기간에 ${mail} 로 다시 보이게 해 달라고 요청(이의 제기)할 수 있고, 운영자는 양쪽 주장을 보고 복구하거나 삭제합니다.</li>
<li>저작권: 글·댓글의 저작권은 작성한 회원에게 있습니다. 회원은 사이트가 그 게시물을 사이트 안에 보여 주고, 검색 서비스에 노출되도록 제목 등 공개 범위의 정보를 표시하는 것을 허락합니다. 사이트는 이 범위를 넘어 게시물을 쓰지 않습니다.</li>
<li>삭제: 회원은 자기 글·댓글을 언제든 지울 수 있습니다. 지운 글은 제목·본문을 바로 비우고 ‘삭제된 글’ 자리만 남깁니다.</li>
</ol>`,
    },
    {
      id: 'addendum',
      h: '부칙',
      body: `<p>이 약관은 ${EFFECTIVE.ko}부터 시행합니다.</p>
<p class="meta">관련 법령 원문: <a href="${LAW.copyright}">저작권법</a> · <a href="${LAW.unfair}">부정경쟁방지 및 영업비밀보호에 관한 법률</a> · <a href="${LAW.network}">정보통신망 이용촉진 및 정보보호 등에 관한 법률</a> (국가법령정보센터)</p>`,
    },
    {
      id: 'revisions',
      h: '개정 이력',
      body: revisions('ko'),
    },
  ],
  en: [
    {
      id: 'purpose',
      h: 'Article 1 (Purpose and Scope)',
      body: `<p>These Terms set out the conditions for using Marathon Calendar (${ORIGIN}, the “Site”) and the race information on it. They apply to everyone who accesses the Site, whether or not they have an account, and to anyone who operates a program (crawler, bot, script, etc.) that accesses the Site on their behalf (each a “User”).</p>`,
    },
    {
      id: 'database',
      h: 'Article 2 (Race Database and Rights)',
      body: `<ol>
<li>The marathon and trail race information on the Site (race names, dates, locations, distances, entry type and registration windows, entry fees, official website addresses, etc.) and the way it is listed, categorized and searchable form a database that the operator researches and keeps updating, verifying and supplementing (the “Race Database”).</li>
<li>The rights to the Race Database belong to the operator. The operator asserts the protection given by Article 93 of the Korean Copyright Act (rights of database producers), Article 2(1)(pa) of the Unfair Competition Prevention and Trade Secret Protection Act and other applicable laws.</li>
</ol>`,
    },
    {
      id: 'data-use',
      h: 'Article 3 (Restrictions on Use of Data)',
      body: `<ol>
<li>No one may do any of the following without the operator’s prior written permission:
<ol>
<li>Collect all or part of the Race Database by automated means, such as crawling, scraping, bots, automated scripts, or calling data files or APIs directly without going through the Site’s pages; or circumvent access restrictions applied by the Site (blocking, rate limits, etc.).</li>
<li>Copy, distribute or transmit all or a substantial part of the Race Database, or copy any part of it repeatedly or systematically.</li>
<li>Redistribute collected or copied race information on other websites, apps, services or datasets, or use it commercially, for example by selling it or using it for advertising.</li>
</ol></li>
<li>The Site does not permit access by automated means. However, search services may collect and index public pages in accordance with <a href="/robots.txt">robots.txt</a> in order to show the Site in search results.</li>
<li>Viewing race information on the Site and taking personal notes, or sharing the address of a race page with others, is not restricted by this Article.</li>
</ol>`,
    },
    {
      id: 'enforcement',
      h: 'Article 4 (Measures Against Violations)',
      body: `<ol>
<li>If the operator finds access that violates Article 3, it may block or restrict that access (IP address, program, etc.) without prior notice.</li>
<li>The operator may take legal action against violations under the Copyright Act (Article 123 claims to stop infringement, Article 125 claims for damages, Article 136(3)(iii)), the Unfair Competition Prevention and Trade Secret Protection Act (Article 4 injunctions, Article 5 damages), the Act on Promotion of Information and Communications Network Utilization and Information Protection (Article 48(1)) and other applicable laws, including claims to stop the infringement, claims for damages and criminal complaints.</li>
</ol>`,
    },
    {
      id: 'contact',
      h: 'Article 5 (Permission and Contact)',
      body: `<p>To use race information in a way restricted by Article 3, contact ${mail} with the purpose and scope of the use. You may use it only within the scope the operator permits in writing (including by email).</p>`,
    },
    {
      id: 'signup',
      h: 'Article 6 (Signing up)',
      body: `<p>You can browse races without an account. An account is needed to download calendar files, sign up for date alerts, write reviews, send race requests, use Run Talk (the community board), and use member features such as saved races across devices, your calendar feed and your race log.</p>
<ol>
<li>You can sign up if you are 14 or older and agree to these terms and to the collection and use of your personal information.</li>
<li>Sign up with an email address you actually use; the account is created once you confirm it. One person may use only their own email.</li>
<li>What we collect and how we handle it is set out in the <a href="${PRIVACY.en}">Privacy Policy</a>.</li>
</ol>`,
    },
    {
      id: 'account',
      h: 'Article 7 (Looking after your account)',
      body: `<ol>
<li>You are responsible for keeping your password safe. Do not let anyone else use your account.</li>
<li>If you think someone else has used your account, change your password and let us know at ${mail}.</li>
</ol>`,
    },
    {
      id: 'nickname',
      h: 'Article 8 (Nickname)',
      body: `<ol>
<li>Your nickname is shown as the author of your reviews, race requests, and Run Talk posts and comments. It must be 2–16 characters and not already taken.</li>
<li>You may not use a nickname that impersonates the operator (such as “admin” or “Marathon Calendar”), impersonates someone else, or is offensive or promotional. We may ask you to change such a nickname, or change it for you.</li>
</ol>`,
    },
    {
      id: 'posts',
      h: 'Article 9 (What you post)',
      body: `<ol>
<li>You are responsible for the reviews, race requests and Run Talk posts and comments (“posts”) you publish. Do not post anything false, insulting, promotional, or that infringes someone else’s rights.</li>
<li>Do not post anyone’s personal information, such as phone numbers or addresses.</li>
<li>You can delete your own reviews and Run Talk posts and comments at any time. We may hide or delete posts that break these rules without notice (see Article 12 for Run Talk).</li>
</ol>`,
    },
    {
      id: 'delete-account',
      h: 'Article 10 (Deleting your account)',
      body: `<ol>
<li>You can delete your account at any time from “My account”. There is no waiting period.</li>
<li>When you do, your account, email and nickname are destroyed immediately, and your reviews and Run Talk posts, comments, likes and reports are deleted with them. Other members’ comments on your Run Talk posts are deleted along with those posts. Race requests and sold-out reports you sent stay without an author name, because they are race information for everyone. This cannot be undone.</li>
</ol>`,
    },
    {
      id: 'restriction',
      h: 'Article 11 (Restricting use)',
      body: `<ol>
<li>If you repeatedly break these terms, post spam, or interfere with the service, we may limit your ability to post or delete your account. Except in urgent cases, we will tell you the reason by email first. However, on Run Talk, automatic hiding after reports and posting suspensions may happen without prior notice under Article 12.</li>
<li>If you disagree with a restriction, email us at ${mail}.</li>
</ol>`,
    },
    {
      id: 'community',
      h: 'Article 12 (Run Talk posts)',
      body: `<p>Run Talk is a board where members ask about races, find running buddies and crews, and share race information. Article 9 applies in full, with the following additions.</p>
<ol>
<li>Who can see what: a post’s title, category, linked race, nickname, date and comment count are visible to everyone and may appear in search results. The text of posts and comments is shown only to members who have confirmed their email. Posting, commenting, liking and reporting are also limited to members who have confirmed their email.</li>
<li>Not allowed: in addition to Article 9, commercial ads or promotion, posting the same thing repeatedly (spam), steering people to outside contacts such as messenger IDs or short links, illegal content, and impersonating others. To keep out ads and spam, a post may contain at most one external link, and there are limits on how many posts and comments you can make in a short time and per day.</li>
<li>What we may do: we may hide or delete posts and comments that break these terms. A post or comment reported by three different members is hidden automatically, and we review it and then restore or delete it. If you break the rules repeatedly, we may suspend your posting for 1 day, 7 days or permanently.</li>
<li>Temporary measures: if someone claims, with supporting reasons, that a post or comment violates their rights (for example their privacy or reputation) and asks for it to be removed, we may hide it temporarily for up to 30 days under Article 44-2 of the Act on Promotion of Information and Communications Network Utilization and Information Protection. During that time the author can ask us at ${mail} to restore it (an objection); we consider both sides and then restore or delete it.</li>
<li>Copyright: you keep the copyright in your posts and comments. You allow the Site to show them on the Site and to display the publicly visible information, such as the title, so they can appear in search results. The Site does not use your posts beyond this.</li>
<li>Deleting: you can delete your own posts and comments at any time. A deleted post has its title and text cleared right away, leaving only a “deleted” placeholder.</li>
</ol>`,
    },
    {
      id: 'addendum',
      h: 'Addendum',
      body: `<p>These Terms take effect on ${EFFECTIVE.en}.</p>
<p>These Terms are a translation of the Korean version. If the two differ, the <a href="${TERMS_PATH.ko}">Korean version</a> prevails.</p>`,
    },
    {
      id: 'revisions',
      h: 'Revision history',
      body: revisions('en'),
    },
  ],
};

const TEXT = {
  ko: {
    title: '이용약관 | 마라톤 캘린더',
    h1: '이용약관',
    desc: '마라톤 캘린더 이용약관: 대회 정보 데이터베이스의 권리와 자동 수집·무단 복제·재배포 금지, 위반 시 조치, 회원 가입·계정·게시물·러닝톡·탈퇴.',
    site: '마라톤 캘린더',
    home: '/',
    back: '전체 일정·검색',
    lead: `시행일 ${EFFECTIVE.ko}`,
  },
  en: {
    title: 'Terms of Use | Marathon Calendar',
    h1: 'Terms of Use',
    desc: 'Marathon Calendar Terms of Use: rights in the race database, the ban on automated collection, unauthorized copying and redistribution, measures against violations, and accounts, posts, Run Talk and account deletion.',
    site: 'Marathon Calendar',
    home: '/en/',
    back: 'All races & search',
    lead: `Effective ${EFFECTIVE.en}`,
  },
};

function page(lang) {
  const x = TEXT[lang];
  const url = `${ORIGIN}${TERMS_PATH[lang]}`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(x.title)}</title>
<meta name="description" content="${esc(x.desc)}">
<link rel="canonical" href="${url}">
${headLinks(url, { ko: `${ORIGIN}${TERMS_PATH.ko}`, en: `${ORIGIN}${TERMS_PATH.en}` })}
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f1f2f4">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0e0f11">
<style>${STYLE}</style>
</head>
<body>
<header><a class="brand" href="${x.home}">${esc(x.site)}</a><a href="${x.home}">${esc(x.back)}</a></header>
<main>
<h1>${esc(x.h1)}</h1>
<p class="lead">${esc(x.lead)} · <a href="${TERMS_PATH[lang === 'ko' ? 'en' : 'ko']}" hreflang="${lang === 'ko' ? 'en' : 'ko'}">${lang === 'ko' ? 'English' : '한국어'}</a></p>
${SECTIONS[lang].map((s) => `<section id="${s.id}">\n<h2>${esc(s.h)}</h2>\n${s.body}\n</section>`).join('\n')}
</main>
<footer><a href="${x.home}">${esc(x.site)}</a> — ${lang === 'ko' ? '문의' : 'Contact'} ${mail}${noticeHtml(lang)}</footer>
</body>
</html>
`;
}

mkdirSync(new URL('../dist/en/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/terms.html', import.meta.url), page('ko'));
writeFileSync(new URL('../dist/en/terms.html', import.meta.url), page('en'));
console.log(`terms: /terms, /en/terms (시행 ${EFFECTIVE.iso})`);
