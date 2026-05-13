# MediaLink Hub 작업 로그 (Work Log)

## 📅 일시: 2026-03-24
## 👤 작성자: 서기 (Scribe)

### 1. 구현 내용 (Implementation)
- **프레임워크**: Next.js 15 (App Router)
- **스타일링**: Tailwind CSS V4, Bento Grid 레이아웃, Glassmorphism 디자인 적용.
- **핵심 기능**:
  - Supabase Storage (`media-assets` 버킷) 연동을 통한 미디어 업로드.
  - Supabase Database (`media_files` 테이블) 연동을 통한 업로드 이력 관리.
  - `motion/react`를 활용한 부드러운 UI 애니메이션.
  - 클립보드 복사 및 새 창 열기 기능.

### 2. 발생 에러 및 해결 (Errors & Solutions)
- **에러 1: 빌드 중단 (Supabase URL 미설정)**
  - **원인**: 빌드 시점에 환경 변수가 없어 Supabase 클라이언트 초기화 실패.
  - **해결**: `lib/supabase.ts`에서 환경 변수 부재 시 placeholder 주소를 사용하도록 수정하여 프리렌더링 통과.
- **에러 2: JSX 구문 오류 (Unexpected token `>`)**
  - **원인**: JSX 텍스트 내에서 `>` 기호를 직접 사용.
  - **해결**: `&gt;` 엔티티로 변경.
- **에러 3: 테이블 부재 (Table 'public.media_files' not found)**
  - **원인**: Supabase 프로젝트 내에 필요한 테이블이 생성되지 않음.
  - **해결**: UI에 SQL 가이드를 직접 표시하여 사용자가 즉시 테이블을 생성할 수 있도록 안내 로직 추가.
- **에러 4: RLS 정책 위반 (Row-level security policy violation)**
  - **원인**: 테이블 및 스토리지에 대한 접근 권한(Policy)이 설정되지 않음.
  - **해결**: 익명 사용자(anon)의 Insert/Select 권한을 허용하는 SQL 가이드를 UI에 추가하여 해결 안내.
- **에러 5: 연결 실패 (Failed to fetch)**
  - **원인**: Supabase 환경 변수가 설정되지 않았거나 네트워크 통신이 불가능함.
  - **해결**: `UploadZone`에서 해당 에러 발생 시 환경 변수 설정을 확인하도록 안내 메시지 강화.
- **에러 6: 하이드레이션 오류 (Minified React error #418)**
  - **원인**: 서버와 클라이언트의 날짜 로케일이 달라 초기 UI 불일치 발생.
  - **해결**: `MediaCard`에서 날짜 렌더링을 `mounted` 상태 이후에 처리하도록 수정.
- **에러 7: 빌드 오류 (Failed to collect page data for /_not-found)**
  - **원인**: Next.js 빌드 시 기본 `not-found` 페이지 부재로 인한 오류.
  - **해결**: `app/not-found.tsx` 파일을 생성하여 빌드 시스템 안정화.

### 3. 향후 과제 (Next Steps)
- 파일 용량 제한 및 확장자 필터링 강화.
- 사용자별 인증(Auth) 연동을 통한 개인화된 히스토리 제공.
- 이미지 리사이징 및 썸네일 생성 로직 추가.

---
**AK Labs**: [https://litt.ly/aklabs](https://litt.ly/aklabs)
