import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { minToHM, minToHMGrouped } from '@/lib/time'

// 로그북 사본을 이메일로 발송 (CSV 첨부) — Resend 사용
// 필요 환경변수: RESEND_API_KEY (+선택 MAIL_FROM, 기본 noreply@bjjlog10.com)
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type FlightRow = Record<string, unknown> & {
  flight_date: string
  total_min: number
  pic_min: number
  sic_min: number
  night_min: number
  day_landings: number
  night_landings: number
}

function esc(s: unknown): string {
  const t = s === null || s === undefined ? '' : String(s)
  return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
}

export async function POST() {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: '메일 발송 설정(RESEND_API_KEY)이 아직 없어요. Vercel 환경변수에 추가해 주세요.' },
      { status: 503 }
    )
  }

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })

  // 받을 주소: 프로필 copy_email → 없으면 계정 이메일
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, copy_email')
    .eq('id', user.id)
    .single()
  const to = profile?.copy_email || user.email
  if (!to) return NextResponse.json({ error: '받을 이메일 주소가 없어요.' }, { status: 400 })

  // 전체 비행 (1,000행 한도 → 루프)
  const flights: FlightRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('flights')
      .select('*')
      .eq('deleted', false)
      .order('flight_date', { ascending: true })
      .order('created_at', { ascending: true })
      .range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    flights.push(...((data ?? []) as FlightRow[]))
    if (!data || data.length < 1000) break
  }

  // CSV
  const header = [
    'date', 'flight_number', 'from', 'to', 'aircraft_reg', 'aircraft_type',
    'out', 'in', 'takeoff', 'landing', 'block_time', 'flight_time',
    'pic', 'sic', 'picus', 'night', 'actual_inst',
    'day_takeoffs', 'day_landings', 'night_takeoffs', 'night_landings',
    'autolands', 'capacity', 'pf', 'crew_pic', 'crew_sic', 'remarks',
  ]
  const lines = [header.join(',')]
  let totalMin = 0, picMin = 0, sicMin = 0, nightMin = 0, landings = 0
  for (const f of flights) {
    totalMin += f.total_min
    picMin += f.pic_min
    sicMin += f.sic_min
    nightMin += f.night_min
    landings += f.day_landings + f.night_landings
    lines.push([
      f.flight_date, f.flight_number, f.origin, f.destination, f.aircraft_reg, f.aircraft_type,
      f.out_time, f.in_time, f.takeoff_time, f.landing_time,
      minToHM(f.total_min), (f.flight_min as number) ? minToHM(f.flight_min as number) : '',
      f.pic_min ? minToHM(f.pic_min) : '', f.sic_min ? minToHM(f.sic_min) : '',
      (f.picus_min as number) ? minToHM(f.picus_min as number) : '',
      f.night_min ? minToHM(f.night_min) : '',
      (f.inst_actual_min as number) ? minToHM(f.inst_actual_min as number) : '',
      f.day_takeoffs, f.day_landings, f.night_takeoffs, f.night_landings,
      f.autolands, f.capacity, f.is_pf ? 'PF' : '', f.crew_pic, f.crew_sic, f.remarks,
    ].map(esc).join(','))
  }
  const csv = '﻿' + lines.join('\n')
  const today = new Date().toISOString().slice(0, 10)

  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="color:#0D3D6E">✈️ AirLog10 로그북 사본</h2>
      <p>${profile?.name ?? ''}님의 로그북 백업이에요. 전체 기록은 첨부된 CSV 파일에 있어요.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr><td style="padding:6px 0;color:#6b7280">총 비행</td><td style="text-align:right;font-weight:700">${flights.length.toLocaleString()}편 · ${minToHMGrouped(totalMin)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">PIC / SIC</td><td style="text-align:right;font-weight:700">${minToHMGrouped(picMin)} / ${minToHMGrouped(sicMin)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">야간</td><td style="text-align:right;font-weight:700">${minToHMGrouped(nightMin)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">착륙</td><td style="text-align:right;font-weight:700">${landings.toLocaleString()}회</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">기간</td><td style="text-align:right;font-weight:700">${flights[0]?.flight_date ?? '-'} ~ ${flights[flights.length - 1]?.flight_date ?? '-'}</td></tr>
      </table>
      <p style="color:#9ca3af;font-size:12px;margin-top:20px">발송일 ${today} · airlog10.vercel.app</p>
    </div>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || 'AirLog10 <noreply@bjjlog10.com>',
      to: [to],
      subject: `[AirLog10] 로그북 사본 — ${flights.length.toLocaleString()}편 · ${minToHMGrouped(totalMin)} (${today})`,
      html,
      attachments: [
        {
          filename: `airlog10-logbook-${today}.csv`,
          content: Buffer.from(csv, 'utf-8').toString('base64'),
        },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    return NextResponse.json({ error: '발송 실패: ' + body.slice(0, 200) }, { status: 502 })
  }
  return NextResponse.json({ ok: true, to, flights: flights.length })
}
