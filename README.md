# AirLog10 ✈️

파일럿 로그북 — 비행 기록, 통계, 어디서나.

- Next.js 14 + Supabase + Vercel
- LogTen Pro 임포트, 전세계 공항/활주로 자동입력(OurAirports), 오프라인 우선(예정)

## 셋업
1. Supabase 프로젝트 생성 → `migrations/001_init.sql` 실행
2. Vercel에 배포, 환경변수 설정 (CLAUDE.md 참고)
3. `/api/airports/seed?secret=…&what=airports` → `&what=runways` 1회 실행
