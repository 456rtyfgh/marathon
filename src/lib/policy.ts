/** 처리방침·약관 버전과 경로. 개정하면 POLICY_VERSION·REVISIONS 를 고친다. */
export const POLICY_VERSION = '2026-11-09'; // 시행일
export const RECONSENT_FROM: string = ''; // 재동의가 법상 필요한 개정이면 그 버전, 아니면 '' (안내만)
export const CONTACT_EMAIL = 'marathon82@kakao.com';
export const PRIVACY_PATH = '/privacy';
export const TERMS_PATH = '/terms';
/** 개정 이력(최신이 앞). 처리방침·약관 페이지가 그대로 보여 준다 */
export const REVISIONS: { version: string; ko: string; en: string }[] = [
  { version: POLICY_VERSION, ko: '제정', en: 'First published' },
];
/** user_metadata 에 남기는 동의 기록 */
export interface ConsentRecord {
  policy_version: string; // 동의·안내를 본 처리방침 버전
  agreed_at: string; // ISO 시각
  age14: true; // 만 14세 이상 확인
  optional?: Record<string, boolean>; // 선택 동의 항목, 없으면 생략
}
/** 가입 화면의 동의 체크 상태 (SignupConsent). 필수 3개 + 선택 항목 */
export interface ConsentChecks {
  age14: boolean;
  collect: boolean;
  terms: boolean;
  optional: Record<string, boolean>;
}
export const emptyConsent = (): ConsentChecks => ({ age14: false, collect: false, terms: false, optional: {} });
export const requiredOk = (c: ConsentChecks) => c.age14 && c.collect && c.terms;

type L = { ko: string; en: string };
/** 수집·이용 고지 4항목. 가입 동의(SignupConsent)·구독 고지(AlertForm)·처리방침(PrivacyPolicy)이 모두 이 값을 그대로 보여 준다(문구가 어긋나지 않게 한 곳에 둔다) */
export interface CollectionItem {
  purpose: L;
  items: L;
  retention: L;
  refusal: L;
}

/** 회원가입 */
export const COLLECT_MEMBER: CollectionItem = {
  purpose: {
    ko: '회원 확인과 로그인, 후기·대회 요청의 작성자 표시, 가입 확인·비밀번호 재설정 메일 발송',
    en: 'Identifying you and signing you in, showing you as the author of reviews and race requests, and sending sign-up confirmation and password reset emails',
  },
  items: {
    ko: '이메일, 비밀번호(암호화해 저장), 닉네임 / 자동 생성: 가입·인증·최근 로그인 시각',
    en: 'Email, password (stored encrypted), nickname / Created automatically: sign-up, confirmation and last sign-in times',
  },
  retention: {
    ko: '회원 탈퇴 때까지. 탈퇴하면 즉시 파기합니다.',
    en: 'Until you delete your account. It is destroyed immediately when you do.',
  },
  refusal: {
    ko: '동의하지 않을 수 있습니다. 동의하지 않으면 회원가입을 할 수 없어 후기 작성·대회 요청을 쓸 수 없고, 대회 일정 보기와 일정 알림 신청은 가입 없이 그대로 쓸 수 있습니다.',
    en: "You may refuse. If you do, you can't create an account, so you can't write reviews or send race requests. Browsing races and signing up for date alerts still work without an account.",
  },
};

/** 대회 일정 알림(이메일 구독) */
export const COLLECT_ALERT: CollectionItem = {
  purpose: {
    ko: '고른 대회의 접수 시작·마감 알림 메일 발송',
    en: 'Emailing you before entry opens or closes for the race you picked',
  },
  items: {
    ko: '이메일, 고른 대회와 알림 시점',
    en: 'Email, the race you picked and when to be reminded',
  },
  retention: {
    ko: '구독 해지를 요청할 때까지(문의 메일로 요청하면 바로 삭제합니다)',
    en: 'Until you ask us to unsubscribe (email us and we delete it right away)',
  },
  refusal: {
    ko: '동의하지 않을 수 있으며, 그러면 알림 메일만 받을 수 없습니다.',
    en: "You may refuse; you just won't get alert emails.",
  },
};
