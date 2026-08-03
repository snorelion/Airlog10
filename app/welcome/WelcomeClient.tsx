'use client'

import { useCallback, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { LANG_COOKIE } from '@/lib/i18n/core'
import {
  WELCOME,
  WELCOME_LANGS,
  type WelcomeLang,
} from './welcome.content'

// 앱스토어 주소 — 승인되면 여기만 채우면 배지가 진짜 링크가 된다.
// (비어 있으면 "출시 예정"으로 그려진다)
const APP_STORE_URL = ''

const CONTACT = 'support_air@bjjlog10.com'

// 스크린샷은 public/shots/*.png (600×1303, iPhone 17 Pro Max 촬영본을 줄인 것)
const SHOTS = ['1-home', '2-log', '3-logbook', '4-ledger', '5-weather', '6-map', '7-stats']
const SHOT_W = 600
const SHOT_H = 1303
const GAP = 16 // 갤러리 사이 간격(px) — 스크롤 위치로 몇 번째인지 계산할 때 쓴다

// ── 아이콘 ──────────────────────────────────────────
// lucide에 없는 모양(끊긴 와이파이 등)이 섞여 있어 선 아이콘을 직접 그린다.
function Icon({ d, className = 'w-5 h-5' }: { d: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {d}
    </svg>
  )
}
const P = {
  offline: <><path d="M2 8.8a16 16 0 0 1 20 0" /><path d="M5 12.3a11 11 0 0 1 14 0" /><path d="M8.5 15.8a6 6 0 0 1 7 0" /><circle cx="12" cy="19.5" r="1.2" fill="currentColor" stroke="none" /><path d="M3 3l18 18" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5z" /></>,
  cloud: <path d="M7 18a4 4 0 0 1 .6-8 5.5 5.5 0 0 1 10.4 1.6A3.5 3.5 0 0 1 17.5 18z" />,
  map: <><path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5z" /><path d="M9 4v13" /><path d="M15 6.5v13" /></>,
  gauge: <><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-5" /></>,
  bell: <><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9z" /><path d="M10 18.5a2 2 0 0 0 4 0" /></>,
  widget: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></>,
  chart: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10.5 18.5h3" /></>,
}
const STRIP_ICONS = [P.offline, P.moon, P.book]
const ALLIN_ICONS = [P.chart, P.gauge, P.bell, P.cloud]
const FEAT_ICONS = [P.moon, P.cloud, P.map, P.gauge, P.bell, P.widget, P.chart, P.phone]

const AppleGlyph = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6" aria-hidden>
    <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.8-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.1.8 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.7-1-2.7-4.1zM14.2 5.4c.7-.8 1.1-1.9 1-3-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.5z" />
  </svg>
)

export default function WelcomeClient({ initial }: { initial: WelcomeLang }) {
  const [lang, setLang] = useState<WelcomeLang>(initial)
  const [shot, setShot] = useState(0)
  const gallery = useRef<HTMLDivElement>(null)
  const t = WELCOME[lang]

  // 고른 언어를 기억한다. 앱과 같은 쿠키를 쓰지만 'th'는 앱이 무시하므로(LANG_READY)
  // 앱 화면이 태국어로 반쯤 번역된 채 뜨는 일은 없다.
  const choose = (code: WelcomeLang) => {
    setLang(code)
    document.cookie = `${LANG_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`
  }

  // 갤러리를 넘길 때마다 아래 설명·점을 그 화면에 맞춘다
  const onGalleryScroll = useCallback(() => {
    const el = gallery.current
    if (!el) return
    const item = el.firstElementChild as HTMLElement | null
    if (!item) return
    const i = Math.round(el.scrollLeft / (item.offsetWidth + GAP))
    setShot(Math.min(Math.max(i, 0), SHOTS.length - 1))
  }, [])

  return (
    // lang을 여기에 두는 이유: 태국어는 낱말 사이에 공백이 없어 브라우저의 태국어
    // 사전이 있어야 줄이 제대로 끊긴다. globals.css의 [lang='th'] 규칙도 이걸 본다.
    <div lang={lang} className="min-h-screen bg-app-bg text-app-text">
      {/* ── 상단 바 ── */}
      <header className="sticky top-0 z-30 border-b border-app-line/70 bg-app-bg/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-5">
          <span className="select-none text-[19px] font-bold tracking-tight text-app-accent">
            AirLog<span className="text-app-text">10</span>
          </span>
          <nav className="flex items-center gap-0.5 rounded-full border border-app-line bg-app-surface p-0.5">
            {WELCOME_LANGS.map(({ code, label }) => (
              <button key={code} type="button" onClick={() => choose(code)}
                aria-current={code === lang ? 'true' : undefined}
                className={
                  'rounded-full px-2.5 py-1 text-[13px] transition ' +
                  (code === lang ? 'bg-app-accent-soft font-semibold text-app-accent' : 'text-app-sub hover:text-app-text')
                }>
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main>
        {/* ── 히어로 ── */}
        <section className="mx-auto max-w-5xl px-5 pb-4 pt-12 sm:pt-16 lg:pt-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_.95fr] lg:gap-14">
            <div className="text-center lg:text-left">
              <h1 className="text-[32px] font-bold leading-[1.18] tracking-tight text-app-text sm:text-[42px] sm:leading-[1.15] lg:text-[52px]">
                {t.hero.title}
              </h1>
              <p className="mx-auto mt-5 max-w-[36rem] text-[16px] leading-relaxed text-app-sub sm:text-[18px] lg:mx-0">
                {t.hero.sub}
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 lg:items-start">
                {APP_STORE_URL ? (
                  <a href={APP_STORE_URL}
                    className="inline-flex items-center gap-2.5 rounded-2xl bg-black px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-black/10 transition hover:opacity-90">
                    <AppleGlyph />
                    <span>{t.hero.cta}</span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-2.5 rounded-2xl border border-app-line bg-app-surface px-6 py-3.5 text-[15px] font-semibold text-app-sub">
                    <span className="opacity-60"><AppleGlyph /></span>
                    <span>{t.hero.ctaSoon}</span>
                  </span>
                )}
                <p className="text-[13px] text-app-hint">{t.hero.note}</p>
              </div>
              <p className="mt-7 inline-flex items-center gap-2 text-[13.5px] text-app-sub">
                <span className="h-1.5 w-1.5 rounded-full bg-app-accent" />
                {t.hero.byline}
              </p>
            </div>

            {/* 폰 목업은 이 갤러리 하나뿐 — 옆으로 넘기면 앱 전체를 볼 수 있다 */}
            <div className="flex justify-center lg:justify-end">
              <div className="w-[230px] sm:w-[262px]">
                <div ref={gallery} onScroll={onGalleryScroll}
                  className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto">
                  {SHOTS.map((f, i) => (
                    <div key={f}
                      className="w-full shrink-0 snap-center overflow-hidden rounded-[2.2rem] border-[7px] border-neutral-900 shadow-2xl shadow-air-900/20 dark:border-neutral-700">
                      <Image src={`/shots/${f}.png`} alt={t.shots.caps[i]} width={SHOT_W} height={SHOT_H}
                        priority={i === 0} sizes="262px" className="block h-auto w-full" />
                    </div>
                  ))}
                </div>
                <p className="mt-4 h-5 text-center text-[13.5px] text-app-sub">{t.shots.caps[shot]}</p>
                <div className="mt-2 flex justify-center gap-1.5">
                  {SHOTS.map((f, i) => (
                    <span key={f}
                      className={'h-1.5 w-1.5 rounded-full transition-colors ' + (i === shot ? 'bg-app-accent' : 'bg-app-line')} />
                  ))}
                </div>
                <p className="mt-3 text-center text-[12.5px] text-app-hint">{t.shots.hint}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 핵심 3가지 ── */}
        <section className="mx-auto max-w-5xl px-5 pb-16 pt-12 sm:pt-16">
          <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            {t.strip.map((s, i) => (
              <div key={s.t} className="rounded-2xl border border-app-line bg-app-surface p-5">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-app-accent-soft text-app-accent">
                  <Icon d={STRIP_ICONS[i]} />
                </div>
                <h3 className="mt-3.5 text-[15.5px] font-semibold text-app-text">{s.t}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-app-sub">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 왜 만들었나 ── */}
        <section className="px-5 pb-16 sm:pb-20">
          <div className="mx-auto max-w-5xl rounded-3xl bg-air-900 p-8 text-center text-white sm:p-12 lg:p-14">
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-air-200">{t.offline.kicker}</p>
            <p className="mx-auto mt-4 max-w-3xl text-[19px] font-medium leading-[1.6] text-air-50 sm:text-[23px]">
              {t.offline.body}
            </p>
          </div>
        </section>

        {/* ── 한 앱에서 다 된다 ── */}
        <section className="mx-auto max-w-5xl px-5 pb-16 sm:pb-20">
          <div className="rounded-3xl border border-app-line bg-app-surface p-7 sm:p-10">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-[24px] font-bold tracking-tight text-app-text sm:text-[30px]">{t.allinone.heading}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-app-sub">{t.allinone.body}</p>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {t.allinone.items.map((label, i) => (
                <div key={label} className="rounded-2xl bg-app-accent-soft/70 p-4 text-center">
                  <div className="mx-auto grid h-9 w-9 place-items-center rounded-xl bg-app-surface text-app-accent">
                    <Icon d={ALLIN_ICONS[i]} />
                  </div>
                  <p className="mt-2.5 text-[13.5px] font-semibold text-app-text">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 쓰는 방법 ── */}
        <section className="mx-auto max-w-5xl px-5 pb-16 sm:pb-20">
          <h2 className="text-center text-[24px] font-bold tracking-tight text-app-text sm:text-[30px]">{t.how.heading}</h2>
          <p className="mt-2 text-center text-[15px] text-app-sub">{t.how.sub}</p>
          <ol className="mt-9 grid gap-4 sm:gap-5 md:grid-cols-3">
            {t.how.steps.map((s, i) => (
              <li key={s.t} className="rounded-2xl border border-app-line bg-app-surface p-6">
                <span className="inline-grid h-8 w-8 place-items-center rounded-full bg-app-accent text-[14px] font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-[17px] font-semibold text-app-text">{s.t}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-app-sub">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── 기능 ── */}
        <section className="mx-auto max-w-5xl px-5 pb-16 sm:pb-20">
          <h2 className="text-center text-[24px] font-bold tracking-tight text-app-text sm:text-[30px]">{t.features.heading}</h2>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {t.features.items.map((f, i) => (
              <div key={f.t} className="rounded-2xl border border-app-line bg-app-surface p-5">
                <div className="text-app-accent"><Icon d={FEAT_ICONS[i]} /></div>
                <h3 className="mt-3 text-[15px] font-semibold text-app-text">{f.t}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-app-sub">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 가격 ── */}
        <section className="mx-auto max-w-5xl px-5 pb-16 sm:pb-20">
          <h2 className="text-center text-[24px] font-bold tracking-tight text-app-text sm:text-[30px]">{t.pricing.heading}</h2>
          <div className="mx-auto mt-8 max-w-2xl overflow-hidden rounded-3xl border border-app-line bg-app-surface">
            <div className="px-6 pt-7 text-center">
              <span className="inline-block rounded-full bg-app-accent-soft px-3.5 py-1.5 text-[13px] font-semibold text-app-accent">
                {t.pricing.trial}
              </span>
            </div>
            <div className="grid gap-3 p-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-app-line p-5 pt-6 text-center">
                <p className="text-[14px] text-app-sub">{t.pricing.monthly}</p>
                <p className="mt-1 text-[28px] font-bold text-app-text">{t.pricing.monthlyPrice}</p>
                <p className="text-[13px] text-app-hint">{t.pricing.per}</p>
              </div>
              <div className="relative rounded-2xl border-2 border-app-accent p-5 pt-6 text-center">
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-app-accent px-2.5 py-0.5 text-[11.5px] font-bold text-white">
                  {t.pricing.save}
                </span>
                <p className="text-[14px] text-app-sub">{t.pricing.yearly}</p>
                <p className="mt-1 text-[28px] font-bold text-app-text">{t.pricing.yearlyPrice}</p>
                <p className="text-[13px] text-app-hint">{t.pricing.perYear}</p>
              </div>
            </div>
            <div className="border-t border-app-line bg-app-accent-soft/60 px-6 py-6">
              <h3 className="text-[16px] font-semibold text-app-text">{t.pricing.freeTitle}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-app-sub">{t.pricing.freeBody}</p>
            </div>
          </div>
          <p className="mt-4 text-center text-[13px] text-app-hint">{t.pricing.note}</p>
        </section>

        {/* ── FAQ ── */}
        <section className="mx-auto max-w-3xl px-5 pb-16 sm:pb-20">
          <h2 className="text-center text-[24px] font-bold tracking-tight text-app-text sm:text-[30px]">{t.faq.heading}</h2>
          <div className="mt-8 divide-y divide-app-line overflow-hidden rounded-2xl border border-app-line bg-app-surface">
            {t.faq.items.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
                  <span className="text-[15px] font-medium text-app-text">{f.q}</span>
                  <ChevronDown size={16} className="mt-1 shrink-0 text-app-hint transition-transform group-open:rotate-180" />
                </summary>
                <p className="-mt-1 px-5 pb-5 text-[14.5px] leading-relaxed text-app-sub">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      {/* ── 푸터 ── */}
      <footer className="border-t border-app-line">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-5 py-9 sm:flex-row">
          <span className="text-[15px] font-bold tracking-tight text-app-accent">
            AirLog<span className="text-app-text">10</span>
          </span>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13.5px] text-app-sub">
            <Link href="/privacy" className="hover:text-app-text">{t.footer.privacy}</Link>
            <Link href="/terms" className="hover:text-app-text">{t.footer.terms}</Link>
            <a href={`mailto:${CONTACT}`} className="hover:text-app-text">{t.footer.contact}</a>
            <Link href="/login" className="hover:text-app-text">{t.footer.signin}</Link>
          </nav>
          <span className="text-[13px] text-app-hint">{t.footer.rights}</span>
        </div>
      </footer>
    </div>
  )
}
