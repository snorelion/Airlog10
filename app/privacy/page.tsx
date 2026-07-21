import Link from 'next/link'

export const metadata = { title: '개인정보처리방침 · AirLog10' }

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-app-text">
      <Link href="/login" className="text-sm text-app-accent">← 돌아가기</Link>
      <h1 className="mt-4 text-2xl font-bold">개인정보처리방침</h1>
      <p className="mt-1 text-sm text-app-hint">최종 업데이트: 2026-07-21</p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-app-sub">
        <section>
          <h2 className="font-semibold text-app-text">1. 수집하는 정보</h2>
          <p className="mt-1">AirLog10(이하 &ldquo;서비스&rdquo;)은 다음을 저장합니다.</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>계정: 이메일 주소, 비밀번호(암호화되어 저장, 운영자도 볼 수 없음)</li>
            <li>프로필: 이름, 소속·홈베이스·사번·면장번호·자격 만료일 등 직접 입력한 정보</li>
            <li>로그북: 비행 기록, 항공기, 크루 메모, 공항 메모, 로스터 등 직접 입력·가져온 데이터</li>
          </ul>
        </section>
        <section>
          <h2 className="font-semibold text-app-text">2. 이용 목적</h2>
          <p className="mt-1">비행 기록의 저장·표시·통계·백업 등 서비스 제공에만 사용합니다.
            운영자는 다른 사용자의 로그북을 볼 수 없으며(데이터베이스 접근 제어로 계정별 격리),
            데이터를 광고·판매 목적으로 제3자에게 제공하지 않습니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-app-text">3. 저장·처리 위탁</h2>
          <p className="mt-1">데이터는 Supabase(데이터베이스, 서울 리전)와 Vercel(호스팅)에 저장·처리됩니다.
            이메일 발송에는 Resend를 사용할 수 있습니다. 공항·활주로·기상 정보는 공개 데이터
            (OurAirports, aviationweather.gov)를 이용합니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-app-text">4. 보관·삭제</h2>
          <p className="mt-1">데이터는 계정이 유지되는 동안 보관됩니다. 앱의 설정 → 계정 삭제로
            언제든 계정과 모든 데이터를 영구 삭제할 수 있습니다. 삭제 후에는 복구되지 않습니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-app-text">5. 사용자의 권리</h2>
          <p className="mt-1">언제든 본인 데이터를 열람·수정·CSV로 내보내기·삭제할 수 있습니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-app-text">6. 문의</h2>
          <p className="mt-1">개인정보 관련 문의는 앱 운영자에게 연락해 주세요.</p>
        </section>
      </div>
    </main>
  )
}
