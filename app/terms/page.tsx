import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { LANG_COOKIE, resolveLang } from '@/lib/i18n/core'

// 법적 문서는 문서 단위로 둔다 — 자세한 이유는 app/privacy/page.tsx 주석 참고.

export const metadata = { title: 'Terms of Service · AirLog10' }

const CONTACT = 'support_air@bjjlog10.com'
const UPDATED = '2026-07-26'

export default function TermsPage() {
  const lang = resolveLang(cookies().get(LANG_COOKIE)?.value, headers().get('accept-language'))
  return lang === 'ko' ? <TermsKo /> : <TermsEn />
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

function TermsEn() {
  return (
    <Shell back="← Back" title="Terms of Service">
      <section>
        <H>1. About the Service</H>
        <p className="mt-1">
          AirLog10 is a personal logbook tool that helps pilots record and organise their own flights.
        </p>
      </section>
      <section>
        <H>2. Your account</H>
        <p className="mt-1">
          Please provide accurate details when you sign up. Keeping access to your account — your email
          inbox, and any Google or Apple account you sign in with — is your responsibility.
        </p>
      </section>
      <section>
        <H>3. Accuracy and official records</H>
        <p className="mt-1">
          This is a personal record-keeping aid. You are responsible for the accuracy of what you enter.
          For proof of flight experience, or for any decision about regulatory compliance — flight time
          limits, recency, currency and the like — always use the official records held by your operator
          or your regulator. Figures and warnings shown in the app are for reference only.
        </p>
      </section>
      <section>
        <H>4. Weather and aeronautical information</H>
        <p className="mt-1">
          Weather (METAR / TAF) and airport data shown in the app come from public sources and are provided
          for convenience only. They are <b>not an official briefing</b> and must never be used as the sole
          basis for a flight decision. Always obtain your briefing through your operator or the official
          government channels. Cached data may be out of date; the app shows when it was last received.
        </p>
      </section>
      <section>
        <H>5. Limitation of liability</H>
        <p className="mt-1">
          The Service is provided &ldquo;as is&rdquo;. To the extent permitted by law, the operator is not liable
          for loss of data or for any damage arising from interruption of the Service. Please export a CSV
          backup regularly to keep your own copy of anything important.
        </p>
      </section>
      <section>
        <H>6. Changes</H>
        <p className="mt-1">
          These terms may change. We will announce any significant change in the app. Questions can be sent
          to <a href={`mailto:${CONTACT}`} className="text-app-accent underline">{CONTACT}</a>.
        </p>
      </section>
    </Shell>
  )
}

function TermsKo() {
  return (
    <Shell back="← 돌아가기" title="이용약관">
      <section>
        <H>1. 서비스 소개</H>
        <p className="mt-1">AirLog10은 조종사가 비행 기록을 저장·관리하는 개인용 로그북 도구입니다.</p>
      </section>
      <section>
        <H>2. 계정</H>
        <p className="mt-1">
          가입 시 정확한 정보를 제공해 주세요. 계정 접근 수단(메일함, 구글·애플 계정)을 안전하게
          관리할 책임은 사용자에게 있습니다.
        </p>
      </section>
      <section>
        <H>3. 데이터의 정확성 · 공식 기록</H>
        <p className="mt-1">
          본 서비스는 개인 기록 보조 도구이며, 입력된 데이터의 정확성은 사용자 책임입니다. 공식
          비행경력증명이나 규정 준수(비행시간 한도·기량유지 등)의 판단 근거로는 반드시 소속
          항공사·감독기관의 공식 기록을 사용하세요. 앱이 표시하는 통계·경고는 참고용입니다.
        </p>
      </section>
      <section>
        <H>4. 기상·항공 정보</H>
        <p className="mt-1">
          앱에 표시되는 기상(METAR / TAF)과 공항 정보는 공개 자료를 편의상 보여주는 것으로,
          <b> 공식 브리핑이 아닙니다.</b> 비행 판단의 유일한 근거로 삼아서는 안 되며, 브리핑은 반드시
          소속 항공사나 정부 공식 채널을 통해 받으세요. 저장된 자료는 오래된 것일 수 있으며, 앱은
          마지막으로 받은 시각을 함께 표시합니다.
        </p>
      </section>
      <section>
        <H>5. 책임의 한계</H>
        <p className="mt-1">
          서비스는 &ldquo;있는 그대로&rdquo; 제공되며, 데이터 손실·서비스 중단으로 인한 손해에 대해
          운영자는 법이 허용하는 범위에서 책임을 지지 않습니다. 중요한 데이터는 CSV 내보내기로
          정기 백업하시기를 권장합니다.
        </p>
      </section>
      <section>
        <H>6. 변경</H>
        <p className="mt-1">
          약관은 필요 시 변경될 수 있으며, 중요한 변경은 앱 내에서 안내합니다. 문의는{' '}
          <a href={`mailto:${CONTACT}`} className="text-app-accent underline">{CONTACT}</a> 로 보내주세요.
        </p>
      </section>
    </Shell>
  )
}
