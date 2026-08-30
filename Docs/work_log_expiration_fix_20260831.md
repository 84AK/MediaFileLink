# 🌐 MediaLink Hub - 만료 미디어 자동 필터링 및 Vercel Cron 호환성 개선 로그

## 📅 일시: 2026-08-31
## 👤 작성자: 서기님 (Scribe)

---

### 1. 문제 분석 (Issue Analysis)
- **현상**: 로그인 유저(7일 보존) 및 비로그인 익명 유저(24시간 보존)가 업로드한 미디어가 만료 기한이 지났음에도 메인 화면에 계속 노출되고 링크가 유효하게 남아있는 문제.
- **원인 분석**:
  1. **클라이언트 미디어 목록 조회 무조건 노출**: `app/page.tsx`에서 미디어 목록을 fetch할 때 `expires_at` 만료 조건을 검증하지 않아, 백엔드에서 물리적 삭제가 일어나기 전까지 화면에 만료된 이미지가 그대로 렌더링됨.
  2. **Vercel Hobby(무료 플랜) Cron 주기 제약**: `vercel.json`의 `"schedule": "0 * * * *"`(매 시간) 설정은 Vercel 무료 플랜에서 지원되지 않아 크론이 자동 실행되지 않음 (무료 플랜은 하루 1회 `0 0 * * *` 지원).
  3. **Vercel Cron 인증 헤더 불일치**: Vercel Cron은 호출 시 `Authorization: Bearer <CRON_SECRET>` 헤더를 전달하는데, 기존 API는 쿼리스트링 `?secret=`만 대조하여 요청이 거부될 수 있었음.

---

### 2. 수정 및 개선 내용 (Implementation & Fixes)

#### ① 프론트엔드 실시간 만료 필터링 적용 (`app/page.tsx`)
- 일반 사용자가 미디어를 조회할 때, `expires_at`이 `null`(관리자 파일)이거나 `expires_at > nowIso`(유효 기간 내)인 미디어만 화면에 렌더링하도록 필터링 로직 개선.
- 기한이 지난 미디어는 서버 물리 삭제 이전이라도 브라우저 상에서 즉시 감춰져 사용자에게 만료된 링크가 노출되지 않도록 조치.

#### ② Vercel Cron 인증 방식 다중 지원 (`app/api/cron/cleanup/route.ts`)
- Vercel 표준인 `Authorization: Bearer <CRON_SECRET>` 헤더 인증과 기존 쿼리 파라미터 `?secret=` 방식을 모두 지원하도록 유연하게 개선.

#### ③ Vercel 크론 설정 최적화 (`vercel.json`)
- Vercel 무료 플랜 규격에 맞춰 스케줄을 `"0 0 * * *"` (매일 자정 1회)로 변경하고 경로를 정돈.

#### ④ 관리자 전용 만료 미디어 수동 정리 기능 추가 (`app/page.tsx`)
- 관리자 로그인 시 컨트롤 바에 만료된 파일 개수(`expiredCount`)와 함께 **"만료 정리"** 버튼을 배치.
- 관리자가 원할 때 즉시 원클릭으로 DB 및 Supabase Storage의 만료 물리 파일들을 일괄 정리할 수 있도록 기능 보강.

#### ⑤ Next.js 15 Webpack HMR 모듈 충돌 해결 (`components/MediaCard.tsx`)
- `next/image` 내부의 `link.js` 참조로 인한 `Cannot read properties of undefined (reading '$$typeof')` 및 `link.js call` 런타임 오류 해결.
- 외부 Supabase Storage 이미지에 최적화된 네이티브 `img` 태그(lazy loading + object-cover)로 전환하여 렌더링 안정성 확보 및 `.next` 캐시 초기화.

---

### 3. 검증 결과
- `next build` 프로덕션 빌드 컴파일 정상 완료 (`✓ Compiled successfully in 8.9s`).
- 클라이언트 및 백엔드 타입스크립트/라우팅 정합성 확보.

---
**AK Labs**: [https://litt.ly/aklabs](https://litt.ly/aklabs)
