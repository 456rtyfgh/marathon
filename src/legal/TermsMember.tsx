/** 이용약관 중 회원 조항 (가입·계정·닉네임·게시물·탈퇴·이용 제한). 다른 조항과 합칠 수 있게 섹션 하나만 돌려준다 */
import { langPath, useLang } from '../i18n';
import { CONTACT_EMAIL, PRIVACY_PATH } from '../lib/policy';

export default function TermsMember() {
  const { lang } = useLang();
  const privacy = langPath(PRIVACY_PATH, lang);
  const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

  if (lang === 'en')
    return (
      <section id="terms-member">
        <h2>Accounts</h2>
        <p>
          You can browse races and sign up for date alerts without an account. An account is only needed to write reviews and send race
          requests.
        </p>

        <h3>Signing up</h3>
        <ul>
          <li>You can sign up if you are 14 or older and agree to these terms and to the collection and use of your personal information.</li>
          <li>Sign up with an email address you actually use; the account is created once you confirm it. One person may use only their own email.</li>
          <li>
            What we collect and how we handle it is set out in the <a href={privacy}>Privacy Policy</a>.
          </li>
        </ul>

        <h3>Looking after your account</h3>
        <ul>
          <li>You are responsible for keeping your password safe. Do not let anyone else use your account.</li>
          <li>If you think someone else has used your account, change your password and let us know at {mail}.</li>
        </ul>

        <h3>Nickname</h3>
        <ul>
          <li>Your nickname is shown as the author of your reviews and race requests. It must be 2–16 characters and not already taken.</li>
          <li>
            You may not use a nickname that impersonates the operator (such as “admin” or “Marathon Calendar”), impersonates someone else,
            or is offensive or promotional. We may ask you to change such a nickname, or change it for you.
          </li>
        </ul>

        <h3>What you post</h3>
        <ul>
          <li>You are responsible for the reviews and race requests you post. Do not post anything false, insulting, promotional, or that infringes someone else’s rights.</li>
          <li>Do not post anyone’s personal information, such as phone numbers or addresses.</li>
          <li>You can delete your own reviews at any time. We may hide or delete posts that break these rules without notice.</li>
        </ul>

        <h3>Deleting your account</h3>
        <ul>
          <li>You can delete your account at any time from “My account”. There is no waiting period.</li>
          <li>
            When you do, your account, email and nickname are destroyed immediately, and your reviews are deleted with them. Race requests
            you sent stay on the list without an author name, because they are about adding races for everyone. This cannot be undone.
          </li>
        </ul>

        <h3>Restricting use</h3>
        <ul>
          <li>
            If you repeatedly break these terms, post spam, or interfere with the service, we may limit your ability to post or delete your
            account. Except in urgent cases, we will tell you the reason by email first.
          </li>
          <li>If you disagree with a restriction, email us at {mail}.</li>
        </ul>
      </section>
    );

  return (
    <section id="terms-member">
      <h2>회원</h2>
      <p>대회 일정 보기와 일정 알림 신청은 회원가입 없이 쓸 수 있습니다. 회원 계정은 후기 작성과 대회 추가 요청에만 필요합니다.</p>

      <h3>회원가입</h3>
      <ul>
        <li>만 14세 이상이고 이 약관과 개인정보 수집·이용에 동의하면 가입할 수 있습니다.</li>
        <li>실제로 쓰는 이메일로 가입하고, 그 메일로 확인하면 가입이 끝납니다. 다른 사람의 이메일로 가입할 수 없습니다.</li>
        <li>
          모으는 정보와 처리 방법은 <a href={privacy}>개인정보 처리방침</a>에 적혀 있습니다.
        </li>
      </ul>

      <h3>계정 관리</h3>
      <ul>
        <li>비밀번호는 회원이 직접 관리하며, 다른 사람이 계정을 쓰게 해서는 안 됩니다.</li>
        <li>다른 사람이 계정을 쓴 것 같으면 비밀번호를 바꾸고 {mail} 로 알려 주세요.</li>
      </ul>

      <h3>닉네임</h3>
      <ul>
        <li>닉네임은 후기와 대회 요청의 작성자로 표시됩니다. 2~16자이고 다른 회원과 겹치지 않아야 합니다.</li>
        <li>
          운영자로 오해할 수 있는 이름(관리자·운영자·마라톤 캘린더 등), 다른 사람을 사칭하는 이름, 욕설·광고성 이름은 쓸 수 없습니다. 이런
          닉네임은 바꾸도록 요청하거나 운영자가 바꿀 수 있습니다.
        </li>
      </ul>

      <h3>게시물</h3>
      <ul>
        <li>후기와 대회 요청의 책임은 작성한 회원에게 있습니다. 사실이 아닌 내용, 욕설·비방, 광고, 다른 사람의 권리를 침해하는 내용은 올릴 수 없습니다.</li>
        <li>전화번호·주소처럼 다른 사람의 개인정보를 올려서는 안 됩니다.</li>
        <li>자기 후기는 언제든 지울 수 있습니다. 이 약관을 어긴 게시물은 운영자가 알리지 않고 가리거나 지울 수 있습니다.</li>
      </ul>

      <h3>회원 탈퇴와 게시물 처리</h3>
      <ul>
        <li>회원은 언제든 ‘내 정보’에서 탈퇴할 수 있으며, 기다리는 기간은 없습니다.</li>
        <li>
          탈퇴하면 계정·이메일·닉네임을 즉시 파기하고 작성한 후기도 함께 삭제합니다. 대회 추가 요청은 모든 이용자를 위한 대회 정보라서 작성자
          표시 없이 남습니다. 탈퇴는 되돌릴 수 없습니다.
        </li>
      </ul>

      <h3>이용 제한</h3>
      <ul>
        <li>이 약관을 되풀이해 어기거나 스팸을 올리거나 서비스 운영을 방해하면 글쓰기를 제한하거나 계정을 삭제할 수 있습니다. 급한 경우가 아니면 먼저 이메일로 이유를 알립니다.</li>
        <li>제한에 이의가 있으면 {mail} 로 알려 주세요.</li>
      </ul>
    </section>
  );
}
