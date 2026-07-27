import type { Dict } from './core'

type LoginStrings = {
  tagline: string
  emailPlaceholder: string
  agreePrefix: string
  terms: string
  agreeMiddle: string
  privacy: string
  agreeSuffix: string
  agreeRequired: string
  sending: string
  sendCode: string
  or: string
  google: string
  apple: string
  noPassword: string
  codeSentPrefix: string
  codeSentSuffix: string
  codePlaceholder: string
  verifying: string
  signIn: string
  backToEmail: string
  resend: string
  codeExpired: string
}

export const login = {
  en: {
    tagline: 'Pilot logbook — your flights, hours, and stats anywhere.',
    emailPlaceholder: 'Email',
    // "I agree to the [Terms] and [Privacy Policy]." 를 링크 두 개로 쪼갠 것
    agreePrefix: 'I agree to the ',
    terms: 'Terms of Service',
    agreeMiddle: ' and ',
    privacy: 'Privacy Policy',
    agreeSuffix: '.',
    agreeRequired: 'Please agree to the Terms and Privacy Policy.',
    sending: 'Sending…',
    sendCode: 'Email me a sign-in code',
    or: 'or',
    google: 'Continue with Google',
    apple: 'Continue with Apple',
    noPassword: 'No password needed. We email you a 6-digit code.',
    codeSentPrefix: 'We sent a 6-digit code to ',
    codeSentSuffix: '. Check your inbox (and spam folder).',
    codePlaceholder: 'Code from email',
    verifying: 'Checking…',
    signIn: 'Sign in',
    backToEmail: '← Change email',
    resend: 'Resend code',
    codeExpired: 'That code expired or does not match. Request a new one and try again.',
  },
  ko: {
    tagline: '파일럿 로그북 — 비행 기록, 통계, 어디서나.',
    emailPlaceholder: '이메일',
    agreePrefix: '',
    terms: '이용약관',
    agreeMiddle: ' 및 ',
    privacy: '개인정보처리방침',
    agreeSuffix: '에 동의합니다.',
    agreeRequired: '약관과 개인정보처리방침에 동의해 주세요.',
    sending: '보내는 중…',
    sendCode: '이메일로 로그인 코드 받기',
    or: '또는',
    google: '구글로 계속하기',
    apple: 'Apple로 계속하기',
    noPassword: '비밀번호가 없어요. 이메일로 오는 6자리 코드로 로그인해요.',
    codeSentPrefix: '',
    codeSentSuffix: ' 으로 6자리 코드를 보냈어요. 메일함(스팸함도)에서 확인해 입력해 주세요.',
    codePlaceholder: '메일로 온 코드',
    verifying: '확인 중…',
    signIn: '로그인',
    backToEmail: '← 이메일 다시 입력',
    resend: '코드 다시 받기',
    codeExpired: '코드가 만료됐거나 맞지 않아요. 새 코드를 받아 다시 입력해 주세요.',
  },
} satisfies Dict<LoginStrings>
