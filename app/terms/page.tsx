import Link from 'next/link'

export const metadata = { title: '이용약관 · AirLog10' }

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-app-text">
      <Link href="/login" className="text-sm text-app-accent">← 돌아가기</Link>
      <h1 className="mt-4 text-2xl font-bold">이용약관</h1>
      <p className="mt-1 text-sm text-app-hint">최종 업데이트: 2026-07-21</p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-app-sub">
        <section>
          <h2 className="font-semibold text-app-text">1. 서비스 소개</h2>
          <p className="mt-1">AirLog10은 조종사가 비행 기록을 저장·관리하는 개인용 로그북 도구입니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-app-text">2. 계정</h2>
          <p className="mt-1">가입 시 정확한 정보를 제공하고, 비밀번호를 안전하게 관리할 책임은 사용자에게 있습니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-app-text">3. 데이터의 정확성 · 법적 효력</h2>
          <p className="mt-1">본 서비스는 개인 기록 보조 도구이며, 입력된 데이터의 정확성은 사용자 책임입니다.
            공식 비행경력증명이나 규정 준수(비행시간 한도·기량유지 등)의 판단 근거로는 반드시
            소속 항공사·감독기관의 공식 기록을 사용하세요. 앱이 표시하는 통계·경고는 참고용입니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-app-text">4. 책임의 한계</h2>
          <p className="mt-1">서비스는 &ldquo;있는 그대로&rdquo; 제공되며, 데이터 손실·서비스 중단으로 인한 손해에
            대해 운영자는 법이 허용하는 범위에서 책임을 지지 않습니다. 중요한 데이터는 CSV 내보내기로
            정기 백업하시기를 권장합니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-app-text">5. 변경</h2>
          <p className="mt-1">약관은 필요 시 변경될 수 있으며, 중요한 변경은 앱 내에서 안내합니다.</p>
        </section>
      </div>
    </main>
  )
}
