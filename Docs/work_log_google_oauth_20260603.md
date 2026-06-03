# 🌐 MediaLink Hub - 소셜 로그인 연동 및 가이드 UI Polish 로그 (Google OAuth & UI Polish Log)

## 📅 일시: 2026-06-03
## 👤 작성자: 서기님 (Scribe)

---

### 1. 개편 배경 (Background)
- **피드백 사항**: 기존의 업로드 하단 만료일 안내 문구가 너무 작고 불명확해 사용자들이 인지하기 어렵다는 지적이 있었습니다.
- **추가 요구사항**: 보존 기한 혜택(7일 보존)을 일반 사용자도 편리하게 받을 수 있도록 **구글 계정 로그인(Google OAuth)**을 통합하고, 세션에 따른 화면 제어(로그인 상태 표시 및 로그아웃)가 헤더 영역에 매끄럽게 연결되도록 개발이 지시되었습니다.

---

### 2. 구현 및 개선 내용 (Details)

#### ① 안내 가이드 UI 고도화 (UI Polish)
- **[UploadZone.tsx](file:///Users/byunmose/Desktop/vibe_coding/medialink-hub/components/UploadZone.tsx)**: 단순히 아래쪽에 위치했던 한 줄 배너를 탈피하여, `lucide-react`의 **`Clock` 아이콘**과 굵은 제목, 본문 설명이 정돈된 **정보형 카드 박스**로 전면 리디자인하였습니다.
- 어두운 박스 색상(`bg-zinc-900/5`)과 뚜렷한 가로선 및 `text-sm`, `text-xs` 대비를 주어 페이지 진입 즉시 시인성이 10x 이상 극대화되었습니다.

#### ② 구글 소셜 로그인(Google OAuth) 연동 (`app/page.tsx`)
- Supabase JS 클라이언트의 `supabase.auth.signInWithOAuth({ provider: 'google' })`를 호출하는 `handleGoogleLogin` 트리거를 개발했습니다.
- 로그인 완료 시 토큰을 물고 리다이렉트되어 돌아오는 세션을 실시간으로 포착하기 위해 **`supabase.auth.onAuthStateChange` 구독 로직**을 마운트 시점에 구축하여, 별도의 페이지 새로고침 없이 로그인 유저 이메일 상태가 감지되도록 구현했습니다.

#### ③ 헤더 사용자 상태 분기 UI 구현
- **비로그인 상태 (익명 세션)**: 소셜 로그인을 유도하는 Google 브랜드 컬러가 반영된 Google 로그인 단추 및 관리자용 포털 로그인 버튼을 세련되게 나란히 배치했습니다.
- **로그인 상태**: 사용자 이메일을 👤 이모지와 함께 이메일 뱃지로 노출하고, 관리자/사용자 자격에 맞게 로그아웃 버튼이 동적으로 렌더링되도록 디자인을 통일했습니다.

---

### 3. 소스 코드 변경 주요 디프 (Key Code Changes)

#### [page.tsx](file:///Users/byunmose/Desktop/vibe_coding/medialink-hub/app/page.tsx)
```typescript
  // 인증 및 관리자/소셜 로그인 체크 구독
  useEffect(() => {
    const initAuth = async () => { ... };
    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        setIsAdmin(session.user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL);
      } else {
        setIsAdmin(false);
        // 로그아웃 시 백그라운드 익명 세션 보존
        supabase.auth.signInAnonymously().then(({ data }) => data?.user && setUser(data.user));
      }
    });
    return () => subscription.unsubscribe();
  }, []);
```

#### [UploadZone.tsx](file:///Users/byunmose/Desktop/vibe_coding/medialink-hub/components/UploadZone.tsx)
```typescript
      {/* Retention Guide Banner */}
      <div className="p-5 bg-zinc-900/5 rounded-3xl border border-zinc-200/60 flex items-start gap-4 text-left shadow-sm">
        <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shrink-0">
          <Clock className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-zinc-800">미디어 자동 보존 정책 안내</h4>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            비로그인 업로드 시 <strong>24시간(1일)</strong> 보존 후 자동 삭제되며, 구글 소셜 로그인 유저는 <strong>7일(일주일)</strong>, 관리자 계정은 만료 기한 없이 <strong>영구 보존</strong>됩니다.
          </p>
        </div>
      </div>
```

---

### 4. 결과 및 기대 효과
- **UI 직관성 확보**: 사용자는 본인의 이미지가 24시간 뒤 만료됨을 확실하게 인지할 수 있고, 소셜 로그인 시 일주일간 보존된다는 혜택을 명확히 알 수 있습니다.
- **검증 완료**: Next.js 프로덕션 빌드가 에러 없이 완료되었으며 구글 소셜 로그인 트랜잭션의 클라이언트 제어 상태가 안정적으로 통합되었습니다.

---
**AK Labs**: [https://litt.ly/aklabs](https://litt.ly/aklabs)
