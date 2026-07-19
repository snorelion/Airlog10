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
