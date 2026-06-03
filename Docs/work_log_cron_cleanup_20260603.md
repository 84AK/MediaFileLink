# 🌐 MediaLink Hub - 이미지 자동 만료 및 크론 청소 시스템 로그 (Auto-Cleanup System Log)

## 📅 일시: 2026-06-03
## 👤 작성자: 서기님 (Scribe)

---

### 1. 구현 배경 (Background)
- **목적**: 불필요하게 스토리지 공간을 지속 차지하는 임시 호스팅용 이미지들을 소유자 등급별 보존 기간에 따라 자동 관리하여 무료 플랜(스토리지 1GB)의 보존 효율을 극대화합니다.
- **정책 분기**:
  1. **익명(로그인 없음)**: 업로드 후 **24시간(1일)** 보존 후 자동 삭제.
  2. **일반 로그인 유저**: 업로드 후 **7일(일주일)** 보존 후 자동 삭제.
  3. **관리자 (`mosebb@gmail.com`)**: **영구 보존** (만료일 없음).
- **자동 삭제 기획**: 사용자가 만료 상태를 인지할 수 있는 가이드 UI를 표시하고, 백엔드 크론(Cron) 스케줄러가 매일 또는 주기적으로 만료가 도래한 실제 미디어를 스토리지와 DB에서 물리적으로 삭제하도록 배치 파이프라인을 구축합니다.

---

### 2. 구현 및 구성 사항 (Implementation Details)

#### ① 데이터베이스 스키마 확장
- `media_files` 테이블에 만료 일시를 저장할 `expires_at` (TIMESTAMP WITH TIME ZONE, nullable) 컬럼을 추가하도록 RLS 셋업 쿼리를 보완 및 안내하였습니다.

#### ② 동적 만료 시점 판별 및 저장 (`components/UploadZone.tsx`)
- 업로드 핸들러 내에서, 현재 로그인된 유저 세션의 이메일 정보를 확인하여 만료일을 동적으로 세팅합니다.
  - 이메일이 없는 경우 (익명 사용자) -> 1일 뒤
  - 이메일이 있으며 관리자가 아닌 경우 -> 7일 뒤
  - 관리자 이메일인 경우 -> `null` (영구)
- DB insert 시에 계산된 `expires_at` 값을 포함하여 페이로드로 전송합니다.

#### ③ 만료 상태 안내 및 시각 가이드 UI 적용
- **업로드 존 하단 ([UploadZone.tsx](file:///Users/byunmose/Desktop/vibe_coding/medialink-hub/components/UploadZone.tsx))**: 업로드박스 밑에 은은한 텍스트 배너를 삽입하여 사용자가 보존 정책을 업로드 전에 상시 인지할 수 있도록 가이드를 제공했습니다.
- **미디어 카드 ([MediaCard.tsx](file:///Users/byunmose/Desktop/vibe_coding/medialink-hub/components/MediaCard.tsx))**: 카드 하단 정보 영역에 만료 정보를 렌더링합니다.
  - `expires_at`이 존재할 때: `만료: YYYY-MM-DD` 뱃지 노출 (노란색/경고색 톤)
  - `expires_at`이 `null`일 때: `영구 보존` 뱃지 노출 (초록색/안정색 톤)

#### ④ 만료 청소 크론 API 개발 ([api/cron/cleanup/route.ts](file:///Users/byunmose/Desktop/vibe_coding/medialink-hub/app/api/cron/cleanup/route.ts))
- 주기적으로 트리거될 `GET /api/cron/cleanup` 엔드포인트를 신규 개설했습니다.
- **보안 설정**: `secret` 쿼리 스트링 값을 `process.env.CRON_SECRET`과 대조하여 비인가 호출을 401 Unauthorized로 전면 방어합니다.
- **RLS 우회 삭제**: 일반 키(Anon Key)로는 타인의 리소스를 삭제할 수 없으므로, 서버사이드에 부여된 `SUPABASE_SERVICE_ROLE_KEY`를 바탕으로 마스터 어드민 클라이언트를 생성하여 RLS에 관계없이 만료된 전체 Storage 오브젝트 및 DB 레코드를 안정적으로 일괄 삭제(Cascade Clean)합니다.

---

### 3. 소스 코드 변경 주요 디프 (Key Code Changes)

#### [UploadZone.tsx](file:///Users/byunmose/Desktop/vibe_coding/medialink-hub/components/UploadZone.tsx)
```typescript
      // 만료 일시 산출 (익명 1일, 일반 로그인 7일, 관리자 영구)
      let expiresAt: string | null = null;
      if (user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
        expiresAt = null;
      } else if (user.email) {
        expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      } else {
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }

      // DB insert 시 페이로드 전송
      expires_at: expiresAt,
```

#### [MediaCard.tsx](file:///Users/byunmose/Desktop/vibe_coding/medialink-hub/components/MediaCard.tsx)
```typescript
          <div className="flex items-center gap-1.5">
            {mounted && (
              item.expires_at ? (
                <span className="text-[8px] bg-amber-50 text-amber-600 border border-amber-100/50 px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">
                  만료: {new Date(item.expires_at).toLocaleDateString()}
                </span>
              ) : (
                <span className="text-[8px] bg-green-50 text-green-600 border border-green-100/50 px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">
                  영구 보존
                </span>
              )
            )}
          </div>
```

---

### 4. 결과 및 검증 완료
- 로컬 컴파일 성공 및 프로덕션 빌드 완료.
- API 보안 검증 및 만료 수거 로직의 정적 안정성 확보.

---
**AK Labs**: [https://litt.ly/aklabs](https://litt.ly/aklabs)
