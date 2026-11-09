/**
 * 개인정보 처리방침 본문 (PLAN 4 파트 B). 조항마다 <section id> 컴포넌트 하나.
 * 수집 항목 표는 policy.ts 의 COLLECT_MEMBER·COLLECT_ALERT 를 그대로 그린다(가입 화면·알림 고지와 같은 문구).
 * 파기 내용은 파트 A 의 delete_my_account(0011_privacy.sql)와 같아야 한다.
 */
import { useState } from 'react';
import { langPath, useLang } from '../i18n';
import { COLLECT_ALERT, COLLECT_MEMBER, CONTACT_EMAIL, TERMS_PATH, type CollectionItem } from '../lib/policy';
import { getAnalyticsConsent, setAnalyticsConsent } from '../lib/analytics';

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

function Intro() {
  const { lang } = useLang();
  const terms = langPath(TERMS_PATH, lang);
  return (
    <section id="intro">
      {lang === 'ko' ? (
        <p>
          마라톤 캘린더(marathon82.com, 이하 ‘사이트’)는 개인정보 보호법에 따라 이용자의 개인정보를 보호하고 관련 문의를 빠르게 처리하려고 이
          처리방침을 둡니다. 회원 이용 조건은 <a href={terms}>이용약관</a>에 있습니다.
        </p>
      ) : (
        <p>
          Marathon Calendar (marathon82.com, “the site”) publishes this policy under Korea’s Personal Information Protection Act to protect your
          personal information and to handle your requests quickly. Account rules are in the <a href={terms}>Terms of Use</a>.
        </p>
      )}
    </section>
  );
}

function CollectTable({ item, title }: { item: CollectionItem; title: string }) {
  const { lang } = useLang();
  const ko = lang === 'ko';
  return (
    <>
      <h3>{title}</h3>
      <table>
        <tbody>
          <tr>
            <th scope="row">{ko ? '목적' : 'Purpose'}</th>
            <td>{item.purpose[lang]}</td>
          </tr>
          <tr>
            <th scope="row">{ko ? '항목' : 'Items'}</th>
            <td>{item.items[lang]}</td>
          </tr>
          <tr>
            <th scope="row">{ko ? '보유기간' : 'Retention'}</th>
            <td>{item.retention[lang]}</td>
          </tr>
          <tr>
            <th scope="row">{ko ? '거부할 권리' : 'Your right to refuse'}</th>
            <td>{item.refusal[lang]}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function Collect() {
  const { lang } = useLang();
  const ko = lang === 'ko';
  return (
    <section id="collect">
      <h2>{ko ? '1. 모으는 개인정보와 목적·보유기간' : '1. What we collect, why, and for how long'}</h2>
      <p>
        {ko
          ? '사이트는 아래 목적에 필요한 만큼만 모으며, 목적이 바뀌면 미리 알리고 필요한 경우 다시 동의를 받습니다.'
          : 'We collect only what these purposes need. If a purpose changes, we will tell you in advance and ask again where required.'}
      </p>
      <CollectTable item={COLLECT_MEMBER} title={ko ? '회원가입' : 'Accounts'} />
      <CollectTable item={COLLECT_ALERT} title={ko ? '대회 일정 알림(이메일)' : 'Race date alerts (email)'} />
      <h3>{ko ? '자동으로 생기는 정보' : 'Collected automatically'}</h3>
      {ko ? (
        <ul>
          <li>방문 통계(Google Analytics): 본 화면, 기기·브라우저 종류, 대략적인 지역, 유입 경로. 쿠키를 씁니다(아래 6항).</li>
          <li>자체 집계: 검색어, 많이 본 대회, 공식 홈페이지·여행사 클릭 수를 하루 합계로만 저장합니다. 누구인지 알 수 있는 정보는 담지 않고 쿠키도 쓰지 않습니다.</li>
          <li>남용 방지: 글쓰기·알림 신청 횟수를 세려고 접속 IP 를 되돌릴 수 없는 해시로 바꿔 보관하고, 이틀이 지나면 지웁니다.</li>
          <li>서버 접속 기록: 사이트를 전송하는 Cloudflare 가 보안을 위해 접속 IP·시각 등을 처리합니다.</li>
        </ul>
      ) : (
        <ul>
          <li>Visit statistics (Google Analytics): pages viewed, device and browser type, approximate region and referrer. This uses cookies (see section 6).</li>
          <li>Our own counts: search terms, most-viewed races, and clicks on official and travel agency links, stored only as daily totals. They contain nothing that identifies you and use no cookies.</li>
          <li>Abuse prevention: to count posts and alert sign-ups, your IP address is turned into a one-way hash and deleted after two days.</li>
          <li>Server logs: Cloudflare, which delivers the site, processes IP addresses and access times for security.</li>
        </ul>
      )}
    </section>
  );
}

function Destroy() {
  const { lang } = useLang();
  return lang === 'ko' ? (
    <section id="destroy">
      <h2>2. 파기</h2>
      <ul>
        <li>회원 탈퇴: 계정·이메일·닉네임을 즉시 파기하고, 작성한 후기도 함께 삭제합니다. 대회 추가 요청은 작성자 표시(닉네임) 없이 남습니다.</li>
        <li>회원 탈퇴 때 가입 이메일과 같은 주소로 신청한 대회 일정 알림도 함께 삭제합니다.</li>
        <li>보유기간이 끝났거나 목적을 이룬 정보는 지체 없이 데이터베이스에서 되살릴 수 없게 삭제합니다.</li>
        <li>법령에 따로 보관하라는 정보는 없습니다. 생기면 이 방침에 항목과 기간을 적습니다.</li>
      </ul>
    </section>
  ) : (
    <section id="destroy">
      <h2>2. Destruction</h2>
      <ul>
        <li>When you delete your account, your account, email and nickname are destroyed immediately and your reviews are deleted with them. Race requests stay without an author name (nickname).</li>
        <li>Date alerts signed up with the same email as your account are deleted at the same time.</li>
        <li>Information whose retention period has ended or whose purpose is fulfilled is deleted from the database without delay so it cannot be recovered.</li>
        <li>No law currently requires us to keep any of it. If one does, we will list the items and period here.</li>
      </ul>
    </section>
  );
}

function Alerts() {
  const { lang } = useLang();
  return lang === 'ko' ? (
    <section id="alerts">
      <h2>3. 일정 알림 메일</h2>
      <p>
        알림 메일은 직접 고른 대회의 접수 시작·마감을 알려 주는 정보성 메일이며 광고를 보내지 않습니다. 구독을 해지하거나 이메일을 지우려면 신청한
        이메일 주소를 적어 <Mail /> 로 보내 주세요. 확인 후 바로 삭제합니다.
      </p>
    </section>
  ) : (
    <section id="alerts">
      <h2>3. Alert emails</h2>
      <p>
        Alert emails only tell you when entry opens or closes for races you picked; we do not send advertising. To unsubscribe or have your
        email deleted, write to <Mail /> from (or naming) the address you signed up with. We delete it as soon as we confirm.
      </p>
    </section>
  );
}

function Processors() {
  const { lang } = useLang();
  const ko = lang === 'ko';
  // [ ] 는 사이트에 공개되지 않아 채우지 못한 값 (privacy-applied.md 에 목록)
  const rows: [string, string, string][] = ko
    ? [
        ['Supabase Inc. (supabase.com)', '데이터베이스·회원 인증, 가입 확인·비밀번호 재설정 메일 발송', '[ ]'],
        ['Cloudflare, Inc. (cloudflare.com)', '사이트 호스팅·전송, 보안', '전 세계 데이터센터'],
        ['Google LLC (policies.google.com)', '방문 통계(Google Analytics)', '미국'],
        ['[ ]', '대회 일정 알림 메일 발송', '[ ]'],
      ]
    : [
        ['Supabase Inc. (supabase.com)', 'Database and sign-in, sign-up confirmation and password reset emails', '[ ]'],
        ['Cloudflare, Inc. (cloudflare.com)', 'Hosting, delivery and security', 'Data centers worldwide'],
        ['Google LLC (policies.google.com)', 'Visit statistics (Google Analytics)', 'United States'],
        ['[ ]', 'Sending race date alert emails', '[ ]'],
      ];
  return (
    <section id="processors">
      <h2>{ko ? '4. 제3자 제공·처리 위탁·국외 이전' : '4. Sharing, processors and transfers abroad'}</h2>
      <p>
        {ko
          ? '이용자의 개인정보를 제3자에게 제공하지 않습니다. 법령에 근거가 있거나 수사기관이 법에 정한 절차로 요구하는 경우만 예외입니다. 사이트 운영을 위해 아래 업체에 처리를 맡기며, 이 업체들의 서버가 국외에 있어 정보가 국외로 이전됩니다.'
          : 'We do not give your personal information to third parties, except where the law allows it or investigators request it through legal procedures. We use the processors below to run the site; their servers are outside Korea, so your information is transferred abroad.'}
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">{ko ? '받는 자' : 'Recipient'}</th>
            <th scope="col">{ko ? '맡기는 일' : 'Task'}</th>
            <th scope="col">{ko ? '이전되는 나라' : 'Country'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([who, what, where]) => (
            <tr key={who + what}>
              <td>{who}</td>
              <td>{what}</td>
              <td>{where}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ko ? (
        <ul>
          <li>이전 항목: 1항의 항목 가운데 각 업체가 맡은 일에 필요한 것</li>
          <li>이전 시기와 방법: 사이트를 쓰거나 가입·알림 신청을 할 때 암호화된 네트워크(HTTPS)로 전송</li>
          <li>보유기간: 1항의 보유기간과 같음(위탁 계약이 끝나면 삭제)</li>
          <li>거부 방법과 불이익: 국외 이전을 거부하려면 가입·알림 신청을 하지 않거나 탈퇴하면 됩니다. 이 경우 회원 기능과 알림을 쓸 수 없습니다. 방문 통계는 6항의 방법으로 끌 수 있습니다.</li>
        </ul>
      ) : (
        <ul>
          <li>Items transferred: those in section 1 that each processor needs for its task</li>
          <li>When and how: sent over an encrypted connection (HTTPS) when you use the site, sign up or request alerts</li>
          <li>Retention: as in section 1 (deleted when the processing contract ends)</li>
          <li>How to refuse and what happens: don’t sign up or request alerts, or delete your account; you then can’t use account features or alerts. Visit statistics can be turned off as described in section 6.</li>
        </ul>
      )}
    </section>
  );
}

/** [GA 끄기/켜기] — localStorage 'mc:ga-consent' 에 남기고 다음 방문부터 적용(끄면 이 탭에서도 바로 멈춤) */
function GaToggle() {
  const { lang } = useLang();
  const ko = lang === 'ko';
  const [denied, setDenied] = useState(() => getAnalyticsConsent() === 'denied');
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-ink">
        {ko ? '이 브라우저의 방문 통계: ' : 'Visit statistics in this browser: '}
        <strong>{denied ? (ko ? '꺼짐' : 'Off') : ko ? '켜짐' : 'On'}</strong>
      </span>
      <button
        type="button"
        onClick={() => {
          const next = denied ? 'granted' : 'denied';
          setAnalyticsConsent(next);
          setDenied(next === 'denied');
        }}
        className="inline-flex h-11 items-center rounded-ctl border border-line px-4 text-[15px] font-semibold text-ink transition-colors hover:bg-sunken sm:h-9"
      >
        {denied ? (ko ? 'Google Analytics 켜기' : 'Turn on Google Analytics') : ko ? 'Google Analytics 끄기' : 'Turn off Google Analytics'}
      </button>
    </p>
  );
}

function Cookies() {
  const { lang } = useLang();
  return lang === 'ko' ? (
    <section id="cookies">
      <h2>6. 쿠키와 방문 통계</h2>
      <p>
        방문 통계를 내려고 Google Analytics 를 쓰며, 이때 Google 의 쿠키(_ga 등)가 브라우저에 저장됩니다. 쿠키에는 이름이나 이메일처럼 누구인지
        알 수 있는 정보를 담지 않습니다. 로그인 상태·언어·저장한 대회 같은 사이트 기능용 값은 쿠키가 아니라 브라우저 저장소(localStorage)에
        두며 서버로 보내지 않습니다(로그인 정보 제외).
      </p>
      <p>방문 통계를 원하지 않으면 다음 방법으로 끌 수 있으며, 꺼도 사이트를 쓰는 데 지장이 없습니다.</p>
      <ul>
        <li>아래 [Google Analytics 끄기] 버튼: 이 브라우저에서 다음 방문부터 Google Analytics 를 불러오지 않습니다.</li>
        <li>
          브라우저 설정에서 쿠키 저장을 막거나 지우기, 또는 Google 이 제공하는{' '}
          <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noreferrer">
            Google Analytics 차단 부가기능
          </a>{' '}
          설치
        </li>
      </ul>
      <GaToggle />
    </section>
  ) : (
    <section id="cookies">
      <h2>6. Cookies and visit statistics</h2>
      <p>
        We use Google Analytics for visit statistics, which stores Google cookies (such as _ga) in your browser. They contain nothing that
        identifies you, such as your name or email. Values the site needs to work — sign-in, language, saved races — are kept in browser
        storage (localStorage), not cookies, and are not sent to our servers (except sign-in).
      </p>
      <p>If you don’t want visit statistics, you can turn them off in these ways; the site works the same either way.</p>
      <ul>
        <li>The “Turn off Google Analytics” button below: this browser stops loading Google Analytics from your next visit.</li>
        <li>
          Block or clear cookies in your browser settings, or install Google’s{' '}
          <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noreferrer">
            Google Analytics Opt-out Add-on
          </a>
        </li>
      </ul>
      <GaToggle />
    </section>
  );
}

function Rights() {
  const { lang } = useLang();
  return lang === 'ko' ? (
    <section id="rights">
      <h2>5. 이용자의 권리와 행사 방법</h2>
      <p>이용자는 언제든 자기 개인정보에 대해 다음을 요구할 수 있습니다.</p>
      <ul>
        <li>열람: 로그인 후 ‘내 정보’에서 가입 이메일과 닉네임을 볼 수 있습니다.</li>
        <li>정정: ‘내 정보’에서 닉네임을 바꿀 수 있습니다. 이메일을 바꾸려면 문의 메일로 요청해 주세요.</li>
        <li>삭제: ‘내 정보’의 ‘회원 탈퇴’로 바로 지울 수 있습니다. 알림 구독은 3항의 방법으로 지웁니다.</li>
        <li>처리정지: <Mail /> 로 요청해 주세요.</li>
      </ul>
      <p>
        메일로 받은 요청은 본인인지 확인한 뒤 10일 안에 처리하고 결과를 알려 드립니다. 다른 법령에 따라 거절해야 하는 경우에는 그 이유를
        알립니다. 대리인을 통해 요청할 수도 있으며, 이때는 위임장이 필요합니다.
      </p>
    </section>
  ) : (
    <section id="rights">
      <h2>5. Your rights and how to use them</h2>
      <p>You can ask us at any time to:</p>
      <ul>
        <li>See your information: after signing in, “My account” shows your sign-up email and nickname.</li>
        <li>Correct it: change your nickname in “My account”. To change your email, email us.</li>
        <li>Delete it: “Delete account” in “My account” deletes it right away. Alerts are removed as described in section 3.</li>
        <li>Stop processing: email <Mail />.</li>
      </ul>
      <p>
        We handle emailed requests within 10 days after confirming it is you, and tell you the result. If another law requires us to refuse, we
        tell you why. You can also ask through a representative with a letter of authorization.
      </p>
    </section>
  );
}

function Children() {
  const { lang } = useLang();
  return lang === 'ko' ? (
    <section id="children">
      <h2>7. 만 14세 미만 아동</h2>
      <p>만 14세 미만은 회원가입을 할 수 없으며, 가입할 때 만 14세 이상인지 확인합니다. 만 14세 미만이 가입한 사실을 알게 되면 그 계정을 바로 삭제합니다.</p>
    </section>
  ) : (
    <section id="children">
      <h2>7. Children under 14</h2>
      <p>Children under 14 can’t create an account; we ask you to confirm your age when you sign up. If we learn that a child under 14 has an account, we delete it right away.</p>
    </section>
  );
}

function Security() {
  const { lang } = useLang();
  return lang === 'ko' ? (
    <section id="security">
      <h2>8. 안전성 확보 조치</h2>
      <ul>
        <li>비밀번호는 되돌릴 수 없게 암호화해 저장하며 운영자도 볼 수 없습니다.</li>
        <li>모든 통신은 HTTPS 로 암호화합니다.</li>
        <li>데이터베이스는 행 단위 접근 권한으로 자기 정보만 다룰 수 있게 막고, 관리 권한은 운영자 계정에만 줍니다.</li>
        <li>접속 IP 는 해시로만 보관하고 이틀 뒤 지웁니다.</li>
      </ul>
    </section>
  ) : (
    <section id="security">
      <h2>8. How we keep it safe</h2>
      <ul>
        <li>Passwords are stored with one-way encryption; not even the operator can read them.</li>
        <li>All traffic is encrypted with HTTPS.</li>
        <li>Database access is restricted row by row so each user can only reach their own data, and admin rights are given only to the operator’s account.</li>
        <li>IP addresses are kept only as hashes and deleted after two days.</li>
      </ul>
    </section>
  );
}

function Officer() {
  const { lang } = useLang();
  return lang === 'ko' ? (
    <section id="officer">
      <h2>9. 개인정보 보호책임자</h2>
      <ul>
        <li>운영자·보호책임자: [ ]</li>
        <li>
          연락처: <Mail />
        </li>
      </ul>
      <p>개인정보에 관한 문의·불만·피해 구제는 위 연락처로 보내 주시면 지체 없이 답하겠습니다.</p>
    </section>
  ) : (
    <section id="officer">
      <h2>9. Privacy officer</h2>
      <ul>
        <li>Operator and privacy officer: [ ]</li>
        <li>
          Contact: <Mail />
        </li>
      </ul>
      <p>Send any questions, complaints or requests for redress about your personal information to the address above, and we will reply without delay.</p>
    </section>
  );
}

function Remedies() {
  const { lang } = useLang();
  const ko = lang === 'ko';
  const rows: [string, string, string][] = [
    [ko ? '개인정보침해 신고센터' : 'Personal Information Infringement Report Center (KISA)', 'privacy.kisa.or.kr', '118'],
    [ko ? '개인정보 분쟁조정위원회' : 'Personal Information Dispute Mediation Committee', 'www.kopico.go.kr', '1833-6972'],
    [ko ? '대검찰청' : 'Supreme Prosecutors’ Office', 'www.spo.go.kr', '1301'],
    [ko ? '경찰청' : 'Korean National Police Agency', 'ecrm.police.go.kr', '182'],
  ];
  return (
    <section id="remedies">
      <h2>{ko ? '10. 권익침해 구제 방법' : '10. Where else to get help'}</h2>
      <p>
        {ko
          ? '개인정보 침해에 대한 신고나 상담이 필요하면 아래 기관에 문의할 수 있습니다.'
          : 'If you need to report or get advice about a privacy violation, you can also contact these Korean agencies.'}
      </p>
      <ul>
        {rows.map(([name, site, tel]) => (
          <li key={site}>
            {name}:{' '}
            <a href={`https://${site}`} target="_blank" rel="noreferrer">
              {site}
            </a>
            , {ko ? '국번 없이' : 'tel.'} {tel}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Changes() {
  const { lang } = useLang();
  return lang === 'ko' ? (
    <section id="changes">
      <h2>11. 처리방침 변경</h2>
      <p>
        이 방침을 바꾸면 시행 7일 전(이용자 권리에 중요한 변경은 30일 전)부터 이 페이지에 알리고, 회원에게는 다음 로그인 때 바뀐 내용을
        안내합니다. 지난 내용은 아래 개정 이력에서 볼 수 있습니다.
      </p>
    </section>
  ) : (
    <section id="changes">
      <h2>11. Changes to this policy</h2>
      <p>
        If we change this policy, we announce it on this page 7 days before it takes effect (30 days for changes that matter to your rights),
        and show members what changed the next time they sign in. Earlier versions are listed in the revision history below.
      </p>
    </section>
  );
}

// 처리방침 조항 순서 (제목의 번호와 같은 차례)
const SECTIONS = [Intro, Collect, Destroy, Alerts, Processors, Rights, Cookies, Children, Security, Officer, Remedies, Changes];

export default function PrivacyPolicy() {
  return (
    <>
      {SECTIONS.map((S, i) => (
        <S key={i} />
      ))}
    </>
  );
}
