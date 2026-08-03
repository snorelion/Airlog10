import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { LANG_COOKIE } from '@/lib/i18n/core'
import WelcomeClient from './WelcomeClient'
import { WELCOME, resolveWelcomeLang } from './welcome.content'

// 로그인 없이 누구나 보는 유일한 소개 페이지. (middleware.ts의 PUBLIC_PATHS에 있어야 한다)
// 앱스토어의 지원·마케팅 URL이 이 사이트를 가리키므로, 처음 오는 사람이 보는 첫 화면이다.

function lang() {
  return resolveWelcomeLang(cookies().get(LANG_COOKIE)?.value, headers().get('accept-language'))
}

// 링크를 붙여넣었을 때(카톡·라인·인스타 DM) 그 사람의 언어로 미리보기가 뜨게 한다
export function generateMetadata(): Metadata {
  const m = WELCOME[lang()].meta
  return {
    title: m.title,
    description: m.description,
    openGraph: { title: m.title, description: m.description, type: 'website' },
    twitter: { card: 'summary_large_image', title: m.title, description: m.description },
  }
}

export default function WelcomePage() {
  return <WelcomeClient initial={lang()} />
}
