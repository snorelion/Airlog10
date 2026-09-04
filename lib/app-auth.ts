// ── 파싱 API 인증 — 두 열쇠 (3.0 준비 0단계, 2026-09-04 라이언님 결정) ──
//
// ① Bearer 토큰(Supabase 세션) — 2.5.x까지의 앱·웹. 3.0 출시 후 Supabase 은퇴와 함께 사라진다.
// ② **StoreKit 거래 서명(JWS)** — 3.0 앱. 로그인 없이 "이 앱의 진짜 구독자"만 통과시킨다:
//    가져오기는 유료 기능이라 구독 거래가 반드시 있고(무료 체험 중에도 거래는 있다), 그 거래는
//    애플이 서명해 준다. 서버는 애플 루트 인증서로 서명·번들 ID·상품 ID·만료를 확인한다.
//    위조 불가, 계정 불필요. 헤더: X-AirLog10-Transaction: <Transaction.jwsRepresentation>
//
// 남용 방지: 구독(originalTransactionId)별 하루 DAILY_LIMIT회 — parse_quota 테이블 + bump_parse_quota RPC
// (migrations/009_parse_quota.sql). RPC가 아직 없으면(SQL 미실행) 막지 않고 경고만 남긴다 — 가용성 우선.
//
// 공항 조회(lookupIcao)는 ②에선 사용자 클라이언트가 없으니 service role 클라이언트를 준다
// (airports는 공개 데이터 — RLS는 "로그인한 사람"만 허용이라 admin 키가 필요).

import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SignedDataVerifier, Environment } from '@apple/app-store-server-library'
import { createApiSupabase } from './supabase-server'
import { createAdminClient } from './supabase-admin'

export const RECEIPT_HEADER = 'x-airlog10-transaction'
const BUNDLE_ID = 'com.airlog10.app'
const APP_APPLE_ID = 6797071320
const PRODUCT_IDS = new Set(['com.airlog10.app.monthly', 'com.airlog10.app.yearly'])
const DAILY_LIMIT = 40

// Apple Root CA - G3 (DER, 2014-04-30 ~ 2039-04-30) — apple.com/certificateauthority 공개 인증서.
// 파일이 아니라 상수로 두는 이유: Vercel 번들러가 fs로 읽는 파일을 빠뜨릴 수 있어서.
const APPLE_ROOT_CA_G3_B64 = 'MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA=='

export type ParseAuth =
  | { kind: 'user'; supabase: SupabaseClient; userId: string }
  | { kind: 'receipt'; supabase: SupabaseClient; subscriptionId: string }
export type ParseAuthError = { error: string; status: number }

let verifiers: { prod: SignedDataVerifier; sandbox: SignedDataVerifier } | null = null
function getVerifiers() {
  if (!verifiers) {
    const roots = [Buffer.from(APPLE_ROOT_CA_G3_B64, 'base64')]
    verifiers = {
      prod: new SignedDataVerifier(roots, false, Environment.PRODUCTION, BUNDLE_ID, APP_APPLE_ID),
      // TestFlight·Xcode 빌드의 거래는 Sandbox 서명 — 같은 앱이므로 둘 다 받는다
      sandbox: new SignedDataVerifier(roots, false, Environment.SANDBOX, BUNDLE_ID),
    }
  }
  return verifiers
}

/// 두 열쇠 중 하나로 인증. 실패하면 { error, status }.
export async function authenticateParse(req: NextRequest): Promise<ParseAuth | ParseAuthError> {
  // ① Bearer / 쿠키 세션 (기존)
  const authz = req.headers.get('authorization') ?? ''
  const jws = req.headers.get(RECEIPT_HEADER)
  if (/^bearer /i.test(authz) || !jws) {
    const { supabase, getUser } = createApiSupabase(req)
    const user = await getUser()
    if (user) return { kind: 'user', supabase: supabase as unknown as SupabaseClient, userId: user.id }
    if (!jws) return { error: 'Please sign in.', status: 401 }
  }

  // ② StoreKit 거래 서명
  const v = getVerifiers()
  let tx
  try {
    tx = await v.prod.verifyAndDecodeTransaction(jws!)
  } catch {
    try {
      tx = await v.sandbox.verifyAndDecodeTransaction(jws!)
    } catch (err) {
      console.warn('[app-auth] transaction JWS rejected:', String(err))
      return { error: 'This request needs an active AirLog10 subscription.', status: 401 }
    }
  }
  const now = Date.now()
  if (tx.bundleId !== BUNDLE_ID || !tx.productId || !PRODUCT_IDS.has(tx.productId)) {
    return { error: 'This request needs an active AirLog10 subscription.', status: 401 }
  }
  if (tx.revocationDate || (tx.expiresDate !== undefined && tx.expiresDate < now)) {
    return { error: 'Your AirLog10 subscription has expired — renew it to import files.', status: 402 }
  }
  const subscriptionId = String(tx.originalTransactionId ?? tx.transactionId ?? 'unknown')

  const admin = createAdminClient()
  // 하루 한도 — RPC가 없으면(SQL 미실행) 열어 둔다
  try {
    const { data, error } = await admin.rpc('bump_parse_quota', { p_key: subscriptionId, p_limit: DAILY_LIMIT })
    if (error) console.warn('[app-auth] quota rpc missing/failed — allowing:', error.message)
    else if (data === false) {
      return { error: `Daily import limit reached (${DAILY_LIMIT}). Please try again tomorrow.`, status: 429 }
    }
  } catch (err) {
    console.warn('[app-auth] quota check failed — allowing:', String(err))
  }
  return { kind: 'receipt', supabase: admin as unknown as SupabaseClient, subscriptionId }
}
