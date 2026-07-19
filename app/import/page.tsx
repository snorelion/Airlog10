'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { decodeLogbookFile, parseLogTen, type ParseResult } from '@/lib/logten'
import { minToHMGrouped } from '@/lib/time'

type Step = 'pick' | 'preview' | 'importing' | 'done'

export default function ImportPage() {
  const [step, setStep] = useState<Step>('pick')
  const [result, setResult] = useState<ParseResult | null>(null)
  const [progress, setProgress] = useState('')
  const [imported, setImported] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [error, setError] = useState('')

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError('')
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await decodeLogbookFile(file)
      const parsed = parseLogTen(text)
      if (!parsed.flights.length) {
        setError(parsed.errors[0] || '비행 기록을 찾지 못했어요.')
        return
      }
      setResult(parsed)
      setStep('preview')
    } catch (err) {
      setError('파일을 읽는 중 문제가 생겼어요: ' + String(err))
    }
  }

  async function runImport() {
    if (!result) return
    setStep('importing')
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('로그인이 풀렸어요. 다시 로그인해 주세요.'); setStep('preview'); return }

    try {
      // 1) 기존 기록 키 수집 (중복 건너뛰기) — Supabase 1,000행 한도 때문에 페이지로 나눠 읽음
      setProgress('기존 기록 확인 중…')
      const existing = new Set<string>()
      for (let fromRow = 0; ; fromRow += 1000) {
        const { data, error: qErr } = await supabase
          .from('flights')
          .select('flight_date, flight_number, origin, destination')
          .eq('deleted', false)
          .range(fromRow, fromRow + 999)
        if (qErr) throw new Error(qErr.message)
        for (const f of data ?? []) {
          existing.add(`${f.flight_date}|${f.flight_number ?? ''}|${f.origin ?? ''}|${f.destination ?? ''}`)
        }
        if (!data || data.length < 1000) break
      }

      const fresh = result.flights.filter(
        (f) => !existing.has(`${f.flight_date}|${f.flight_number ?? ''}|${f.origin ?? ''}|${f.destination ?? ''}`)
      )
      const skippedCount = result.flights.length - fresh.length
      setSkipped(skippedCount)

      // 2) 내 항공기 upsert
      setProgress('항공기 정보 저장 중…')
      if (result.aircraft.length) {
        const rows = result.aircraft.map((a) => ({ ...a, user_id: user.id }))
        const { error: acErr } = await supabase
          .from('aircraft')
          .upsert(rows, { onConflict: 'user_id,registration' })
        if (acErr) throw new Error('항공기 저장 실패: ' + acErr.message)
      }

      // 3) 비행 기록 500건씩 나눠 저장
      let done = 0
      for (let i = 0; i < fresh.length; i += 500) {
        const chunk = fresh.slice(i, i + 500).map((f) => ({ ...f, user_id: user.id }))
        const { error: insErr } = await supabase.from('flights').insert(chunk)
        if (insErr) throw new Error('저장 실패: ' + insErr.message)
        done += chunk.length
        setProgress(`비행 기록 저장 중… ${done}/${fresh.length}`)
      }
      setImported(done)
      setStep('done')
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
      setStep('preview')
    }
  }

  const totalMin = result?.flights.reduce((s, f) => s + f.total_min, 0) ?? 0
  const dates = result?.flights.map((f) => f.flight_date).sort() ?? []

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">로그북 가져오기</h1>
        <Link href="/" className="text-sm text-air-600">홈으로</Link>
      </div>

      {step === 'pick' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-ink-line bg-white p-5">
            <h2 className="font-semibold">LogTen Pro 내보내기 파일</h2>
            <p className="mt-1 text-sm text-ink-sub">
              LogTen에서 내보낸 탭 구분 텍스트(.txt) 파일을 선택하세요.
              먼저 내용을 요약해 보여드리고, 확인 후에 저장돼요.
            </p>
            <label className="mt-4 block">
              <span className="inline-block cursor-pointer rounded-xl bg-air-600 px-5 py-3 font-semibold text-white">
                파일 선택
              </span>
              <input type="file" accept=".txt,.tsv,.csv,text/plain" className="hidden" onChange={onFile} />
            </label>
          </div>
          <p className="text-xs text-ink-hint">
            다른 로그북 앱 형식(CSV 등)도 순차적으로 추가할 예정이에요. 안 열리는 파일이 있으면 그대로 보내주세요.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {step === 'preview' && result && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-ink-line bg-white p-5">
            <h2 className="font-semibold">이렇게 읽었어요</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-ink-hint">비행 수</dt><dd className="text-lg font-bold">{result.flights.length.toLocaleString()}편</dd></div>
              <div><dt className="text-ink-hint">총 비행시간</dt><dd className="text-lg font-bold">{minToHMGrouped(totalMin)}</dd></div>
              <div><dt className="text-ink-hint">기간</dt><dd className="font-medium">{dates[0]} ~ {dates[dates.length - 1]}</dd></div>
              <div><dt className="text-ink-hint">항공기</dt><dd className="font-medium">{result.aircraft.length}대</dd></div>
            </dl>
            {result.errors.length > 0 && (
              <p className="mt-3 text-xs text-amber-600">건너뛴 줄 {result.errors.length}개 (형식을 읽지 못함)</p>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button onClick={() => { setStep('pick'); setResult(null) }} className="flex-1 rounded-xl border border-ink-line bg-white py-3 font-semibold">
              다시 선택
            </button>
            <button onClick={runImport} className="flex-1 rounded-xl bg-air-600 py-3 font-semibold text-white">
              가져오기
            </button>
          </div>
          <p className="text-xs text-ink-hint">이미 있는 기록(같은 날짜·편명·구간)은 자동으로 건너뛰어요.</p>
        </div>
      )}

      {step === 'importing' && (
        <div className="rounded-2xl border border-ink-line bg-white p-8 text-center">
          <p className="font-semibold">{progress || '가져오는 중…'}</p>
          <p className="mt-2 text-sm text-ink-sub">화면을 닫지 말고 잠시만 기다려 주세요.</p>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-ink-line bg-white p-8 text-center">
            <p className="text-3xl">🎉</p>
            <p className="mt-2 text-lg font-bold">{imported.toLocaleString()}편 가져왔어요</p>
            {skipped > 0 && <p className="mt-1 text-sm text-ink-sub">이미 있던 {skipped.toLocaleString()}편은 건너뛰었어요.</p>}
          </div>
          <Link href="/" className="block rounded-xl bg-air-600 py-3 text-center font-semibold text-white">
            홈에서 확인하기
          </Link>
        </div>
      )}
    </main>
  )
}
