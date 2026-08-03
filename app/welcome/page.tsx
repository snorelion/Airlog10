import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { LANG_COOKIE } from '@/lib/i18n/core'
import WelcomeClient from './WelcomeClient'
import { WELCOME, langFromQuery, resolveWelcomeLang } from './welcome.content'

// 로그인 없이 누구나 보는 유일한 소개 페이지. (middleware.ts의 PUBLIC_PATHS에 있어야 한다)
// 앱스토어의 지원·마케팅 URL이 이 사이트를 가리키므로, 처음 오는 사람이 보는 첫 화면이다.

type Props = { searchParams?: { lang?: string | string[] } }

// 본문 언어 — 주소로 지정한 게 우선, 없으면 쿠키(직접 고른 언어), 그다음 브라우저 설정.
// 태국 조종사가 태국어 폰으로 열면 태국어로 읽힌다.
function bodyLang(sp: Props['searchParams']) {
  return (
    langFromQuery(sp?.lang) ??
    resolveWelcomeLang(cookies().get(LANG_COOKIE)?.value, headers().get('accept-language'))
  )
}

// 미리보기 카드(카톡·라인·인스타에 링크를 붙였을 때 뜨는 그것)의 언어.
//
// ⚠️ 본문과 규칙이 다르다. 카드는 방문자가 아니라 **메신저 서버가 한 번 가져와서
//    모두에게 같은 것을 보여준다.** 한국 서버가 가져오면 태국 조종사도 한글 카드를
//    보게 되고, 눌러보기도 전에 "한국 앱이네" 하고 지나친다(2026-08-03 라이언님).
//    그래서 기본은 영어로 고정하고, ?lang=th 처럼 대놓고 지정했을 때만 그 언어를 쓴다.
function cardLang(sp: Props['searchParams']) {
  return langFromQuery(sp?.lang) ?? 'en'
}

export function generateMetadata({ searchParams }: Props): Metadata {
  const m = WELCOME[cardLang(searchParams)].meta
  return {
    title: m.title,
    description: m.description,
    openGraph: { title: m.title, description: m.description, type: 'website' },
    twitter: { card: 'summary_large_image', title: m.title, description: m.description },
  }
}

export default function WelcomePage({ searchParams }: Props) {
  return <WelcomeClient initial={bodyLang(searchParams)} />
}
