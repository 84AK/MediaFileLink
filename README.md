# 🌐 MediaLink Hub

![MediaLink Hub Banner](https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6)

**MediaLink Hub**는 누구나 쉽고 빠르게 이미지를 업로드하고 공유할 수 있는 **인스턴트 미디어 호스팅 플랫폼**입니다. 2026년 최신 웹 트렌드인 Bento Grid 레이아웃과 강력한 보안 체계를 갖추고 있습니다.

---

## ✨ 주요 기능

- **Bento Grid UI**: 정보를 직관적인 박스 형태로 배치하여 시각적으로 아름답고 정돈된 경험 제공.
- **익명 인증 (Anonymous Auth)**: 별도의 가입 없이도 개인화된 업로드 기록 관리 가능.
- **소유권 보호**: 본인이 업로드한 미디어만 관리(삭제)할 수 있는 보안 시스템.
- **드래그 앤 드롭 업로드**: 직관적인 파일 업로드 인터페이스 및 10MB 크기 제한.
- **반응형 디자인**: 모바일과 데스크탑 어디서나 완벽하게 동작하는 레이아웃.

## 🛠 Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS v4
- **Animation**: Framer Motion
- **Database & Auth**: Supabase
- **Deployment**: Vercel

---

## 🚀 시작하기

### 1. 필수 조건
- [Node.js](https://nodejs.org/) (최신 LTS 권장)
- [Supabase](https://supabase.com/) 계정 및 프로젝트

### 2. 설치
```bash
npm install
```

### 3. 환경 변수 설정
`.env.local` 파일을 생성하고 아래 정보를 입력하세요:
```env
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_ADMIN_EMAIL=mosebb@gmail.com
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key # 백엔드 크론 만료 삭제용 마스터키
CRON_SECRET=your_cron_secret_token             # 만료 삭제 API 보안인증용 토큰
```

### 4. 데이터베이스 설정 (SQL Editor)
Supabase SQL Editor에서 아래 명령어를 순차적으로 실행하세요:

#### 테이블 생성
```sql
create table media_files (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_url text not null,
  file_type text not null,
  user_id uuid references auth.users not null default auth.uid(),
  expires_at timestamp with time zone,
  created_at timestamp with time zone default now()
);
```

#### 보안 정책 (RLS) 및 스키마 업데이트
```sql
-- 1. media_files 테이블에 컬럼 추가 (기존에 없는 경우에만 추가)
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users DEFAULT auth.uid();
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- 2. media_files 테이블 RLS 활성화
ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;

-- 3. media_files 테이블 RLS 정책 생성
-- 3-1. INSERT 정책 (익명 및 로그인 사용자 모두 본인 파일 추가 가능)
create policy "Users can insert their own media" on media_files for insert to anon, authenticated with check (auth.uid() = user_id);

-- 3-2. SELECT 정책 (누구나 파일 목록 조회 가능)
create policy "Users can select all media" on media_files for select using (true);

-- 3-3. DELETE 정책 (파일 업로더 및 관리자 mosebb@gmail.com 만 삭제 가능)
create policy "Users can delete their own media" on media_files for delete to anon, authenticated using (auth.uid() = user_id or auth.jwt() ->> 'email' = 'mosebb@gmail.com');

-- 4. 스토리지 권한: 누구나 업로드 가능 및 소유자/관리자 삭제 가능
create policy "Allow public select" on storage.objects for select using (bucket_id = 'MediaLink Hub');
create policy "Allow upload for all" on storage.objects for insert to anon, authenticated with check (bucket_id = 'MediaLink Hub');
create policy "Allow delete for owners and admin" on storage.objects for delete using (bucket_id = 'MediaLink Hub' and (auth.uid() = owner or auth.jwt() ->> 'email' = 'mosebb@gmail.com'));
```

---

### 🔑 5. 구글 소셜 로그인 (Google OAuth) 설정
일반 사용자의 보존 기간(7일) 적용을 위해 구글 로그인을 활성화합니다.
1. **Google Cloud Console**에서 Web OAuth Client ID와 Client Secret을 발급받습니다.
   - Authorized redirect URIs에 `https://<your-supabase-project-id>.supabase.co/auth/v1/callback`을 등록합니다.
2. **Supabase Dashboard** -> Authentication -> Providers -> **Google** 로 이동하여 아래 설정을 채웁니다.
   - Client ID 및 Client Secret 입력 후 저장.
   - `Redirect URL`이 올바르게 매칭되어 있는지 검증합니다.

---

## 🔗 Links

- **프로젝트 상세 정보**: [AK Labs](https://litt.ly/aklabs)
- **제작**: AK Labs 팀

---
© 2026 MediaLink Hub. All rights reserved.
