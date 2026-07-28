import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { LANG_COOKIE, resolveLang } from '@/lib/i18n/core'

// 법적 문서는 문장 단위로 쪼개 사전에 넣지 않는다 — 문단이 길고 언어마다 문장을
// 나누는 방식이 달라서, 통째로 나란히 두고 검토할 수 있어야 유지보수가 된다.
// 애플 심사도 이 문서를 영문으로 읽는다.

export const metadata = { title: 'Privacy Policy · AirLog10' }

// 문의처 — 애플은 개인정보처리방침에 실제 연락 수단을 요구한다.
// (Namecheap 포워딩: support_air → snorelion@gmail.com)
const CONTACT = 'support_air@bjjlog10.com'
const UPDATED = '2026-07-26'

export default function PrivacyPage() {
  const lang = resolveLang(cookies().get(LANG_COOKIE)?.value, headers().get('accept-language'))
  return lang === 'ko' ? <PrivacyKo /> : <PrivacyEn />
}

function Shell({ back, title, children }: { back: string; title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-app-text">
      <Link href="/login" className="text-sm text-app-accent">{back}</Link>
      <h1 className="mt-4 text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-app-hint">Last updated: {UPDATED}</p>
      <div className="mt-6 space-y-6 text-sm leading-relaxed text-app-sub">{children}</div>
    </main>
  )
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="font-semibold text-app-text">{children}</h2>
}

function PrivacyEn() {
  return (
    <Shell back="← Back" title="Privacy Policy">
      <section>
        <H>1. What we store</H>
        <p className="mt-1">AirLog10 (the &ldquo;Service&rdquo;) stores the following:</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Account: your email address. Sign-in uses a one-time code sent by email, or Google/Apple sign-in.</li>
          <li>Profile: name, airline, home base, staff number, licence number, expiry dates — whatever you choose to enter.</li>
          <li>Logbook: flights, aircraft, crew notes, airport notes and roster data that you enter or import.</li>
        </ul>
      </section>
      <section>
        <H>2. How we use it</H>
        <p className="mt-1">
          Only to provide the Service — storing, displaying, summarising and backing up your flight records.
          The operator cannot read other users&rsquo; logbooks: every account is isolated at the database level.
          We do not sell your data or pass it to third parties for advertising.
        </p>
      </section>
      <section>
        <H>3. Processors</H>
        <p className="mt-1">
          Your data is stored and processed by Supabase (database, Seoul region) and Vercel (hosting).
          Resend may be used to send email. Airport, runway and weather information comes from public
          sources (OurAirports, aviationweather.gov).
        </p>
      </section>
      <section>
        <H>4. Retention and deletion</H>
        <p className="mt-1">
          Your data is kept for as long as your account exists. You can permanently delete your account and
          all of its data at any time from Settings → Delete account. Deletion cannot be undone, so please
          export a CSV backup first if you want to keep a copy.
        </p>
      </section>
      <section>
        <H>5. Your rights</H>
        <p className="mt-1">
          You may view, correct, export (CSV) and delete your own data at any time, directly in the app.
        </p>
      </section>
      <section>
        <H>6. Contact</H>
        <p className="mt-1">
          For any privacy question, write to <a href={`mailto:${CONTACT}`} className="text-app-accent underline">{CONTACT}</a>.
        </p>
      </section>
    </Shell>
  )
}

function PrivacyKo() {
  return (
    <Shell back="← 돌아가기" title="개인정보처리방침">
      <section>
        <H>1. 수집하는 정보</H>
        <p className="mt-1">AirLog10(이하 &ldquo;서비스&rdquo;)은 다음을 저장합니다.</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>계정: 이메일 주소. 로그인은 메일로 받는 일회용 코드 또는 구글·애플 로그인을 사용합니다.</li>
          <li>프로필: 이름, 소속·홈베이스·사번·면장번호·자격 만료일 등 직접 입력한 정보</li>
          <li>로그북: 비행 기록, 항공기, 크루 메모, 공항 메모, 로스터 등 직접 입력·가져온 데이터</li>
        </ul>
      </section>
      <section>
        <H>2. 이용 목적</H>
        <p className="mt-1">
          비행 기록의 저장·표시·통계·백업 등 서비스 제공에만 사용합니다. 운영자는 다른 사용자의
          로그북을 볼 수 없으며(데이터베이스 접근 제어로 계정별 격리), 데이터를 광고·판매 목적으로
          제3자에게 제공하지 않습니다.
        </p>
      </section>
      <section>
        <H>3. 저장·처리 위탁</H>
        <p className="mt-1">
          데이터는 Supabase(데이터베이스, 서울 리전)와 Vercel(호스팅)에 저장·처리됩니다. 이메일
          발송에는 Resend를 사용할 수 있습니다. 공항·활주로·기상 정보는 공개 데이터(OurAirports,
          aviationweather.gov)를 이용합니다.
        </p>
      </section>
      <section>
        <H>4. 보관·삭제</H>
        <p className="mt-1">
          데이터는 계정이 유지되는 동안 보관됩니다. 앱의 설정 → 계정 삭제로 언제든 계정과 모든
          데이터를 영구 삭제할 수 있습니다. 삭제 후에는 복구되지 않으니, 사본이 필요하면 먼저
          CSV로 내보내 두세요.
        </p>
      </section>
      <section>
        <H>5. 사용자의 권리</H>
        <p className="mt-1">언제든 앱에서 본인 데이터를 열람·수정·CSV로 내보내기·삭제할 수 있습니다.</p>
      </section>
      <section>
        <H>6. 문의</H>
        <p className="mt-1">
          개인정보 관련 문의는 <a href={`mailto:${CONTACT}`} className="text-app-accent underline">{CONTACT}</a> 로 보내주세요.
        </p>
      </section>
    </Shell>
  )
}
