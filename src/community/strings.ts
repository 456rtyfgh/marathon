/**
 * 러닝톡(커뮤니티) 화면 글자 ko/en. 공용 사전(src/i18n/ko.ts·en.ts)과 따로 둔다 — 회원 기능 브랜치와 같은 파일을 고치지 않게.
 * 컴포넌트는 useS() 로 지금 언어 묶음을 받는다. 관리 화면(AdminCommunity)은 기존 관리 화면처럼 한국어만 쓴다.
 */
import { useLang, type Lang } from '../i18n';
import type { Category, PostState, ReportReason } from '../lib/communityTypes';

const ko = {
  nav: '러닝톡',
  tab: '이야기',
  seeAll: '러닝톡에서 보기',
  title: '러닝톡',
  lead: '대회 질문, 동행·크루 구하기, 대회 정보를 나누는 곳이에요.',
  cat: { question: '질문', companion: '동행/크루', info: '대회 정보', free: '자유' } as Record<Category, string>,
  all: '전체',
  catAria: '카테고리',
  race: '대회',
  raceAny: '모든 대회',
  racePick: '대회 고르기',
  raceSearch: '대회 이름으로 찾기',
  raceNone: '맞는 대회가 없어요',
  raceClear: '대회 연결 풀기',
  raceOptional: '선택 — 대회 이야기면 골라 주세요',
  write: '글쓰기',
  more: '더 보기',
  empty: '아직 글이 없어요. 첫 글을 남겨 보세요.',
  emptyRace: '이 대회 이야기가 아직 없어요. 첫 글을 남겨 보세요.',
  loadFail: '글을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  loading: '불러오는 중',
  back: '목록으로',
  comments: (n: number) => `댓글 ${n}`,
  likes: (n: number) => `좋아요 ${n}`,
  edited: '수정됨',
  stateText: {
    deleted: '삭제된 글입니다',
    temp_hidden: '권리 침해 신고로 임시조치된 글입니다',
    hidden: '신고가 쌓여 숨겨진 글입니다',
    visible: '',
  } as Record<PostState, string>,
  hiddenOwner: '신고가 쌓여 다른 사람에게는 숨겨졌어요. 운영자가 확인한 뒤 다시 보이거나 지워집니다.',
  commentGone: '삭제된 댓글입니다',
  commentHidden: '숨겨진 댓글입니다',
  notFound: '없는 글이거나 지워진 글이에요.',
  // 잠김·회원 안내
  lockedGuest: '회원 가입하고 메일 인증하면 볼 수 있어요',
  lockedGuestSub: '본문과 댓글은 메일 인증을 마친 회원에게만 보여요. 가입은 무료예요.',
  lockedUnverified: '메일 인증을 마치면 볼 수 있어요',
  lockedUnverifiedSub: '가입할 때 받은 메일의 링크를 눌러 주세요. 메일이 없으면 다시 보내 드려요.',
  signupOpen: '가입하기 · 로그인',
  resend: '인증 메일 다시 보내기',
  resent: '인증 메일을 다시 보냈어요. 메일함을 확인해 주세요.',
  resendFail: '메일을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  memberOnly: '회원만 쓸 수 있어요 — 무료 가입 30초',
  verifyToWrite: '메일 인증을 마치면 쓸 수 있어요',
  bannedUntil: (d: string) => `${d}까지 글쓰기가 제한되어 있어요.`,
  bannedForever: '글쓰기가 제한된 계정이에요.',
  // 글쓰기
  formNew: '새 글',
  formEdit: '글 고치기',
  fCat: '카테고리',
  fTitle: '제목',
  fBody: '내용',
  fTitlePh: '2~60자',
  fBodyPh: '대회·훈련 이야기를 나눠 주세요. 링크는 1개까지, 연락처·광고는 올릴 수 없어요.',
  post: '올리기',
  saveEdit: '고친 내용 저장',
  cancel: '취소',
  saving: '저장 중',
  postedAs: (n: string) => `${n} 이름으로 올라가요`,
  needCat: '카테고리를 골라 주세요.',
  titleLen: '제목은 2~60자로 써 주세요.',
  bodyLen: '내용을 1~3000자로 써 주세요.',
  tooManyLinks: '외부 링크는 1개까지만 넣을 수 있어요.',
  noMessenger: '오픈채팅·텔레그램·단축 주소 링크는 넣을 수 없어요.',
  bareUrl: '주소는 https:// 로 시작하는 링크 1개만 넣을 수 있어요.',
  saveFail: '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  // 글 상세
  like: '좋아요',
  report: '신고',
  edit: '수정',
  del: '삭제',
  confirmDelPost: '이 글을 지울까요? 제목과 내용이 바로 지워지고 되돌릴 수 없어요.',
  confirmDelComment: '이 댓글을 지울까요?',
  // 댓글
  cTitle: '댓글',
  cNone: '첫 댓글을 남겨 보세요.',
  cPh: '댓글을 남겨 주세요 (1000자까지)',
  cReplyPh: '답글을 남겨 주세요',
  cPost: '댓글 달기',
  cReply: '답글',
  cReplyPost: '답글 달기',
  cLen: '댓글은 1~1000자로 써 주세요.',
  // 신고
  rTitle: '신고하기',
  rReason: {
    spam: '광고·도배',
    abuse: '욕설·비방',
    privacy: '개인정보 노출',
    rights: '권리 침해(저작권·명예훼손 등)',
    other: '그 밖의 이유',
  } as Record<ReportReason, string>,
  rNote: '설명',
  rNotePh: '운영자가 확인할 수 있게 짧게 적어 주세요 (300자까지)',
  rRights: '권리 침해 신고가 받아들여지면 그 글은 최대 30일 동안 임시로 가려지고, 작성자는 이의를 제기할 수 있어요(정보통신망법 제44조의2).',
  rSend: '신고 보내기',
  rDone: '신고를 받았어요. 운영자가 확인할게요.',
  rDup: '이미 신고한 글이에요.',
  rNeedReason: '신고 이유를 골라 주세요.',
  // 내 글
  myTitle: '내가 쓴 러닝톡 글',
  myNone: '아직 쓴 글이 없어요.',
  myState: { visible: '', deleted: '삭제함', temp_hidden: '임시조치', hidden: '숨김' } as Record<PostState, string>,
  close: '닫기',
};

type S = typeof ko;

const en: S = {
  nav: 'Run Talk',
  tab: 'Talk',
  seeAll: 'Open in Run Talk',
  title: 'Run Talk',
  lead: 'Ask about races, find running buddies and crews, and share race info.',
  cat: { question: 'Question', companion: 'Buddies/Crew', info: 'Race info', free: 'Chat' },
  all: 'All',
  catAria: 'Category',
  race: 'Race',
  raceAny: 'All races',
  racePick: 'Pick a race',
  raceSearch: 'Search races by name',
  raceNone: 'No matching race',
  raceClear: 'Remove race',
  raceOptional: 'Optional — pick one if the post is about a race',
  write: 'Write',
  more: 'Load more',
  empty: 'No posts yet. Be the first to write one.',
  emptyRace: 'No posts about this race yet. Be the first to write one.',
  loadFail: "Couldn't load posts. Please try again shortly.",
  loading: 'Loading',
  back: 'Back to list',
  comments: (n: number) => (n === 1 ? '1 comment' : `${n} comments`),
  likes: (n: number) => (n === 1 ? '1 like' : `${n} likes`),
  edited: 'edited',
  stateText: {
    deleted: 'This post was deleted',
    temp_hidden: 'This post is temporarily hidden after a rights claim',
    hidden: 'This post was hidden after reports',
    visible: '',
  },
  hiddenOwner: "After several reports this post is hidden from others. We'll review it and either restore or remove it.",
  commentGone: 'This comment was deleted',
  commentHidden: 'This comment is hidden',
  notFound: "This post doesn't exist or was deleted.",
  lockedGuest: 'Sign up and confirm your email to read this',
  lockedGuestSub: "Posts and comments are only shown to members who've confirmed their email. Signing up is free.",
  lockedUnverified: 'Confirm your email to read this',
  lockedUnverifiedSub: "Click the link in the email we sent when you signed up. Didn't get it? We'll send it again.",
  signupOpen: 'Sign up · Log in',
  resend: 'Resend confirmation email',
  resent: 'Sent again. Please check your inbox.',
  resendFail: "Couldn't send the email. Please try again shortly.",
  memberOnly: 'Members only — free sign-up takes 30 seconds',
  verifyToWrite: 'Confirm your email to post',
  bannedUntil: (d: string) => `You can't post until ${d}.`,
  bannedForever: 'Posting is disabled for this account.',
  formNew: 'New post',
  formEdit: 'Edit post',
  fCat: 'Category',
  fTitle: 'Title',
  fBody: 'Text',
  fTitlePh: '2–60 characters',
  fBodyPh: 'Share race or training talk. One link at most; no contact details or ads.',
  post: 'Post',
  saveEdit: 'Save changes',
  cancel: 'Cancel',
  saving: 'Saving',
  postedAs: (n: string) => `Posting as ${n}`,
  needCat: 'Pick a category.',
  titleLen: 'Titles need 2–60 characters.',
  bodyLen: 'Text needs 1–3,000 characters.',
  tooManyLinks: 'You can include one external link at most.',
  noMessenger: "Open chat, Telegram and short links aren't allowed.",
  bareUrl: 'Add at most one link, starting with https://.',
  saveFail: "Couldn't save. Please try again shortly.",
  like: 'Like',
  report: 'Report',
  edit: 'Edit',
  del: 'Delete',
  confirmDelPost: 'Delete this post? The title and text are removed right away and this cannot be undone.',
  confirmDelComment: 'Delete this comment?',
  cTitle: 'Comments',
  cNone: 'Be the first to comment.',
  cPh: 'Write a comment (up to 1,000 characters)',
  cReplyPh: 'Write a reply',
  cPost: 'Comment',
  cReply: 'Reply',
  cReplyPost: 'Reply',
  cLen: 'Comments need 1–1,000 characters.',
  rTitle: 'Report',
  rReason: {
    spam: 'Ads or spam',
    abuse: 'Insults or abuse',
    privacy: 'Exposes personal info',
    rights: 'Infringes rights (copyright, defamation…)',
    other: 'Something else',
  },
  rNote: 'Details',
  rNotePh: 'A short note for the moderators (up to 300 characters)',
  rRights:
    'If a rights claim is accepted, the post is hidden for up to 30 days and the author can object (Korean Network Act, Article 44-2).',
  rSend: 'Send report',
  rDone: "Thanks — we'll take a look.",
  rDup: "You've already reported this.",
  rNeedReason: 'Pick a reason.',
  myTitle: 'My Run Talk posts',
  myNone: "You haven't posted yet.",
  myState: { visible: '', deleted: 'Deleted', temp_hidden: 'Temporarily hidden', hidden: 'Hidden' },
  close: 'Close',
};

export const COMMUNITY_TEXT: Record<Lang, S> = { ko, en };

export function useS() {
  const { lang } = useLang();
  return COMMUNITY_TEXT[lang];
}

/** 목록·상세 날짜: 오늘이면 시:분, 올해면 월·일, 아니면 연·월·일 (한국 시간) */
export function fmtWhen(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const tz = 'Asia/Seoul';
  const day = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: tz });
  const now = new Date();
  const locale = lang === 'ko' ? 'ko-KR' : 'en-US';
  if (day(d) === day(now)) return d.toLocaleTimeString(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const sameYear = day(d).slice(0, 4) === day(now).slice(0, 4);
  return d.toLocaleDateString(locale, { timeZone: tz, month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** 정지 기한 글자 ('infinity' 는 null) */
export function fmtBan(until: string, lang: Lang): string | null {
  const d = new Date(until);
  if (!Number.isFinite(d.getTime()) || d.getUTCFullYear() > 9000) return null;
  return d.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
