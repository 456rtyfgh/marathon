/**
 * 회원 안내 두 가지.
 * - LockedNotice: 본문·댓글 자리. 비회원 → '회원 가입하고 메일 인증하면 볼 수 있어요' + 가입 열기 / 미인증 → 인증 메일 다시 보내기
 * - GateNote: 글쓰기·댓글·좋아요·신고를 쓸 수 없는 사람이 눌렀을 때. 비회원 → '회원만 쓸 수 있어요 — 무료 가입 30초' / 미인증 / 정지
 */
import { useState } from 'react';
import { LockSimple } from '@phosphor-icons/react';
import { useLang } from '../i18n';
import { Button } from '../components/ui';
import type { Viewer } from '../lib/communityTypes';
import { useViewer } from './api';
import { fmtBan, useS } from './strings';

function Resend() {
  const s = useS();
  const { resend } = useViewer();
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'fail'>('idle');
  if (state === 'ok') return <p className="text-[15px] font-semibold text-ink">{s.resent}</p>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        tone="quiet"
        disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          try {
            await resend();
            setState('ok');
          } catch {
            setState('fail');
          }
        }}
      >
        {s.resend}
      </Button>
      {state === 'fail' && <span className="text-[13px] text-ink-2">{s.resendFail}</span>}
    </div>
  );
}

export function LockedNotice({ viewer, onLogin }: { viewer: Viewer; onLogin: () => void }) {
  const s = useS();
  const unverified = viewer === 'unverified';
  return (
    <div className="rounded-box border border-line bg-surface px-4 py-5 sm:px-5">
      <p className="flex items-start gap-2 text-[17px] leading-snug font-bold">
        <LockSimple size={18} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
        {unverified ? s.lockedUnverified : s.lockedGuest}
      </p>
      <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">{unverified ? s.lockedUnverifiedSub : s.lockedGuestSub}</p>
      <div className="mt-4">{unverified ? <Resend /> : <Button onClick={onLogin}>{s.signupOpen}</Button>}</div>
    </div>
  );
}

export function GateNote({ viewer, ban, onLogin }: { viewer: Viewer; ban: string | null; onLogin: () => void }) {
  const s = useS();
  const { lang } = useLang();
  if (viewer === 'guest')
    return (
      <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-box bg-sunken px-4 py-3">
        <span className="text-[15px] font-semibold">{s.memberOnly}</span>
        <Button size="sm" onClick={onLogin}>
          {s.signupOpen}
        </Button>
      </div>
    );
  if (viewer === 'unverified')
    return (
      <div role="status" className="space-y-3 rounded-box bg-sunken px-4 py-3">
        <p className="text-[15px] font-semibold">{s.verifyToWrite}</p>
        <Resend />
      </div>
    );
  if (ban) {
    const d = fmtBan(ban, lang);
    return (
      <p role="status" className="rounded-box bg-sunken px-4 py-3 text-[15px] font-semibold">
        {d ? s.bannedUntil(d) : s.bannedForever}
      </p>
    );
  }
  return null;
}
