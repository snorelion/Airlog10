# CLAUDE.md — AirLog10 (파일럿 로그북)

라이언님(Thai Lion Air 파일럿, 코더 아님)의 개인 파일럿 로그북 앱.
BJJ Log10과 같은 플레이북: Next.js 14 + Supabase + Vercel + PWA (+ 추후 iOS 래퍼).

## 제품 방향 (합의된 핵심)
1. **기존 로그북 임포트** — LogTen Pro 탭텍스트 완성. 다른 로그북(추가 형식)은 파일 받으면 파서 추가.
2. **오프라인 우선** — 비행모드에서 읽기·쓰기 모두 동작해야 함 (파일럿 앱의 생명). IndexedDB 사본 + 온라인 복귀 시 동기화. flights.updated_at + deleted(tombstone)가 그 토대.
3. **통계·파일럿 맵·공유 카드** — BJJ 공유카드 패턴 재사용.
4. **공항 자동입력** — airports/runways 테이블 (OurAirports 오픈데이터, /api/airports/seed로 시딩).
5. **METAR/TAF** — aviationweather.gov 무료 API (온라인일 때만, 마지막 조회 캐시).
6. **기체 자동입력** — aircraft 테이블 (등록번호→기종). 임포트가 자동으로 채움.
7. **조종사 로그북 표준** — 시간은 전부 '분(정수)' 컬럼, 표시는 "H:MM" (lib/time.ts).

## 개발 규칙 (BJJ-log에서 검증된 것 그대로)
- **이 Mac엔 Node 없음** — 로컬 빌드 불가. 검증은 Vercel 프리뷰. 빌드 성공/실패는 라이언님이 확인해 줌.
- **코드 수정 전 계획 설명 + 컨펌**, git push 전 컨펌 (커밋은 OK).
- **집계는 DB에서** — Supabase select 기본 1,000행 한도 함정. 통계는 RPC(my_totals, my_stats).
- Map/Set 이터레이터 spread 금지 → Array.from (빌드 실패 함정).
- 모바일 우선 UI, word-break: keep-all, iOS 입력 appearance-none.
- 마이그레이션: migrations/*.sql — 라이언님이 Supabase SQL Editor에 붙여넣어 실행 (채팅에 전문 코드블록으로 전달).

## 다국어 (lib/i18n) — 2026-07-26 도입

- **기본 언어는 영어.** `en`이 기준이고 전부 채운다. `ko`/`th`는 `Partial` — 빠진 문장은 자동으로 영어.
  덕분에 태국어를 100% 번역하기 전에도 켤 수 있다(`LANG_READY`에 넣으면 선택지에 뜬다).
- **사전 변수는 언제나 `L`** — `const L = useT(dict)`.
  `t`로 받지 말 것: 통계의 기종 항목, 설정의 테마, 문자열 다듬기의 `const t = v.trim()` 등
  이미 `t`가 다른 뜻으로 쓰이는 파일이 있어 부딪힌다.
- **한 파일에 컴포넌트가 여럿이면 각각 `useT`를 선언**한다. 밖에서 만든 `L`은 안 보인다.
- **문구를 상태(state)에 담지 말 것.** 키만 담고 그릴 때 번역한다 —
  담아두면 언어를 바꿔도 그 부분만 옛 언어로 남는다(화면을 열 때 한 번만 계산되므로).
- **값이 끼어드는 문장은 `fmt()`**. 언어마다 어순이 달라 문자열을 이어붙이면 안 된다.
  날짜·상대시각(`relTime`)·달 이름은 `Intl`에 맡긴다.
- **필터·비교에 쓰이는 값은 번역하지 않는다** (`OTHER_TYPE`). 화면에 보일 때만 언어에 맞게 바꾼다.
- **push 전 반드시** `python3 scripts/check_i18n.py` — 이 Mac엔 Node가 없어 타입 검사를
  미리 못 돌린다. 실제 배포 실패 3건(스코프 밖 참조·역할/기종 착각·`t[key]` 잔재)을 이 검사로 잡았다.

## 파서(가져오기) 추가 절차 — 새 항공사 지원할 때마다 이대로

1. **파서 작성** (`lib/company-log-*.ts` 또는 `lib/roster-*.ts`) + 라우트에 감지 분기.
   - ⚠️ **PDF 버퍼는 파서마다 복사본** — pdf.js가 받은 버퍼를 파싱하며 소비(detach)한다.
     한 라우트에서 판별을 이어 하면(예: KAL 시도 → AC 시도) 두 번째가 죽어 **500**이 된다
     (2026-08-10 에어캐나다 실측). company-log 라우트의 `pdfCopy()` 패턴을 쓸 것.
   - ⚠️ Build/변환 단계는 try/catch로 감싸 **원인이 실린 422**를 보낸다 — 500은 진단 불가.
2. **명단 갱신**: `lib/import-formats.ts` 한 줄 (웹 문구·iOS 앱 화면이 여기서 파생).
3. **종단 검증까지가 완료다** — 파서 단위(텍스트 → 편수 확인)로 끝내지 말 것.
   배포 후 **앱/웹에서 실파일 업로드 1회**가 통과해야 "지원"이라 말한다
   (에어캐나다: 파서는 8/8 검증됐지만 업로드 경로 버그가 8/10에야 드러났다).

## LogTen 임포트 파서 함정 (lib/logten.ts)
- 내보내기 파일이 **UTF-16 LE** (BOM FF FE) — File.text() 금지, decodeLogbookFile 사용.
- remarks/aircraft_notes 안 줄바꿈이 레코드를 쪼갬 → "YYYY-MM-DD\t" 시작 줄만 새 레코드.
- 빈 remarks가 '""' 문자열로 나옴.
- 라이언님 실데이터: 933편(2013-06~2015-07, 한국 항공사 시절, HL기체 B738). Thai Lion 시절은 다른 로그북에 있음 — 앱 완성 후 업로드 예정.

## 환경 변수
- NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY (공항 시딩)
- SEED_SECRET (시딩 라우트 보호)

## 백로그 (합의된 순서)
1. ✅ 스캐폴드·스키마·임포트·핵심화면·통계·공항시딩
2. 오프라인 동기화 (IndexedDB + SW)
3. 파일럿 맵(방문 공항 지도)·공유 카드
4. METAR/TAF, 공항 상세(활주로 표시)
5. Currency(90일 이착륙 등)·자격 만료 리마인더
6. 표준 양식 PDF 내보내기, 연말 리캡
