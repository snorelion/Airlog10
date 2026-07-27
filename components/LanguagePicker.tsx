'use client'

import { useEffect, useState } from 'react'
import { Globe } from 'lucide-react'
import {
  LANG_LABEL,
  LANG_READY,
  LANG_SETTINGS,
  readLangCookie,
  setLangSetting,
  useT,
  type LangSetting,
} from '@/lib/i18n'
import { settings as dict } from '@/lib/i18n/settings'

// 2열 격자 — 좁은 폰에서 네 칸을 한 줄에 늘어놓으면 글자가 눌린다.
// 아직 번역이 준비되지 않은 언어는 목록에 넣지 않는다(LANG_READY).
export default function LanguagePicker() {
  const t = useT(dict)
  const [setting, setSetting] = useState<LangSetting>('auto')

  // 쿠키는 클라이언트에서만 읽을 수 있어 마운트 뒤에 맞춘다
  useEffect(() => setSetting(readLangCookie()), [])

  const options = LANG_SETTINGS.filter((s) => s === 'auto' || LANG_READY.includes(s))

  return (
    <div className="rounded-2xl border border-app-line bg-app-surface p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Globe size={18} className="text-app-sub" />
        {t.language}
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {options.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setSetting(s); setLangSetting(s) }}
            className={
              'rounded-lg px-3 py-2.5 text-sm font-semibold ' +
              (setting === s ? 'bg-app-btn text-white' : 'bg-app-bg text-app-sub')
            }
          >
            {LANG_LABEL[s]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-app-hint">{t.languageHint}</p>
    </div>
  )
}
