# 🌐 MediaLink Hub - 에러 및 해결 로그 (Error & Resolution Log)

## 📅 일시: 2026-06-03
## 👤 작성자: 서기님 (Scribe)

---

### 1. 이슈 개요 (Issue Overview)
- **상황**: 관리자(Admin) 계정(`mosebb@gmail.com`)으로 로그인된 상태에서 이미지를 업로드할 때 업로드가 차단되고 에러가 발생함.
- **현상 1**: 비관리자(익명 로그인) 상태에서는 이미지 업로드가 매우 원활하게 작동함.
- **현상 2**: 관리자로 로그인하면 올려져 있는 목록들의 삭제는 정상 동작하나, 업로드만 유독 안 됨.
- **현상 3**: 문제 해결을 위해 이전 스펙의 RLS 쿼리를 Supabase SQL Editor에 실행하려고 할 때 `ERROR: 42703: column "user_id" does not exist` 에러가 발생함.

---

### 2. 원인 분석 (Root Cause Analysis)

#### ① `media_files` 테이블 내 `user_id` 컬럼의 부재 (핵심 원인)
- API 메타데이터 및 디버깅을 확인한 결과, 실제 Supabase DB 상의 `media_files` 테이블에 `user_id` 컬럼이 생성되어 있지 않았습니다.
- 이로 인해 테이블에는 `[ 'id', 'file_name', 'file_url', 'file_type', 'created_at' ]` 컬럼만 존재했고, RLS 정책에서 `auth.uid() = user_id` 조건으로 권한을 검사하려다 SQL 에러(`column "user_id" does not exist`)가 발생하였습니다.

#### ② 세션 전환에 따른 역할(Role) 불일치
- 익명 로그인 상태에서는 Supabase Auth가 기본적으로 `anon` 혹은 `authenticated` 역할을 부여하는데, 스토리지 및 DB에 RLS 업로드 정책이 유효하지 않아도 일부 권한이 우회되거나 이전에 적용해 둔 정책들이 오작동을 유발할 수 있습니다.
- 관리자로 로그인하면 세션의 주체가 완전히 `authenticated` 역할로 변경되는데, DB 스키마가 비정상적이고 `user_id` 관련 RLS 정책이 유효하지 않아 업로드가 즉각 차단되었습니다.

#### ③ 관리자 삭제가 작동했던 이유
- `storage.objects` 스토리지 테이블에는 관리자 이메일(`mosebb@gmail.com`)에 대한 예외적인 삭제 규칙이 명시되어 있어 스토리지 파일 삭제는 잘 작동했습니다.
- 반면 `media_files` DB 테이블의 삭제 권한 정책(`auth.uid() = user_id`)은 테이블의 `user_id` 컬럼 자체가 없었기 때문에 작동하지 않았거나, 정책 생성 자체가 에러로 누락되어 누구나 삭제가 가능하게 열려있었습니다.

---

### 3. 해결 및 구현 내용 (Resolution & Implementation)

#### ① Supabase DB 스키마 개선 및 RLS 가이드 배포
- Supabase SQL Editor에서 실행될 쿼리 가이드를 재작성하여 배포 및 수동 적용을 완료했습니다.
  - **ALTER TABLE**: `media_files` 테이블에 `user_id` 컬럼이 없는 경우 자동으로 생성하는 `ALTER TABLE media_files ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users DEFAULT auth.uid();` 구문을 최선두에 배치하여 스키마 문제를 안전하게 복구했습니다.
  - **INSERT/DELETE/SELECT RLS**: `to anon, authenticated` 대상을 명시적으로 확대하여, 익명 사용자 및 로그인된 관리자 모두 RLS 차단 없이 자신의 레코드 제어가 가능하게 하였습니다.
  - **DELETE RLS 추가**: `media_files` 레코드 삭제 시에도 스토리지와 동일하게 `auth.jwt() ->> 'email' = 'mosebb@gmail.com'` 조건을 활용해 관리자 마스터 삭제 권한을 명시적으로 추가했습니다.

#### ② 프로젝트 소스 코드 및 문서 동기화
- `app/page.tsx` 내의 RLS 경고 안내 문구를 최신 쿼리로 수정 완료했습니다.
- `README.md` 내에 기재된 Supabase SQL 가이드라인을 동기화하여 신규 셋업 및 문제 상황 시 올바른 쿼리를 복사할 수 있도록 업데이트했습니다. (아크랩스 홈페이지 링크 유지: https://litt.ly/aklabs)

---

### 4. 구현 및 변경 내역 (Changes Diff)

#### [page.tsx](file:///Users/byunmose/Desktop/vibe_coding/medialink-hub/app/page.tsx)
```diff
-      {/* RLS Error Warning */}
-      {rlsError && (
-        ...
-            <pre className="bg-zinc-900 text-zinc-400 p-4 rounded-xl text-xs overflow-x-auto font-mono">
-{`-- 테이블 권한: 소유자만 관리 가능
-create policy "Users can insert their own media" on media_files for insert with check (auth.uid() = user_id);
-create policy "Users can select all media" on media_files for select using (true);
-create policy "Users can delete their own media" on media_files for delete using (auth.uid() = user_id);
-
--- 스토리지 권한: 누구나 업로드 가능 및 소유자/관리자 삭제 가능
-create policy "Allow public select" on storage.objects for select using (bucket_id = 'MediaLink Hub');
-create policy "Allow upload for all" on storage.objects for insert with check (bucket_id = 'MediaLink Hub');
-create policy "Allow delete for owners and admin" on storage.objects for delete using (bucket_id = 'MediaLink Hub' and (auth.uid() = owner or auth.jwt() ->> 'email' = 'mosebb@gmail.com'));`}
+      {/* RLS Error Warning */}
+      {rlsError && (
+        ...
+            <pre className="bg-zinc-900 text-zinc-400 p-4 rounded-xl text-xs overflow-x-auto font-mono">
+{`-- 1. media_files 테이블에 user_id 컬럼 추가 (기존에 없는 경우에만 추가)
+ALTER TABLE media_files ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users DEFAULT auth.uid();
+
+-- 2. media_files 테이블 RLS 활성화
+ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;
+
+-- 3. media_files 테이블 RLS 정책 생성
+-- 3-1. INSERT 정책 (익명 및 로그인 사용자 모두 본인 파일 추가 가능)
+create policy "Users can insert their own media" on media_files for insert to anon, authenticated with check (auth.uid() = user_id);
+
+-- 3-2. SELECT 정책 (누구나 파일 목록 조회 가능)
+create policy "Users can select all media" on media_files for select using (true);
+
+-- 3-3. DELETE 정책 (파일 업로더 및 관리자 mosebb@gmail.com 만 삭제 가능)
+create policy "Users can delete their own media" on media_files for delete to anon, authenticated using (auth.uid() = user_id or auth.jwt() ->> 'email' = 'mosebb@gmail.com');
+
+-- 4. 스토리지 권한: 누구나 업로드 가능 및 소유자/관리자 삭제 가능
+create policy "Allow public select" on storage.objects for select using (bucket_id = 'MediaLink Hub');
+create policy "Allow upload for all" on storage.objects for insert to anon, authenticated with check (bucket_id = 'MediaLink Hub');
+create policy "Allow delete for owners and admin" on storage.objects for delete using (bucket_id = 'MediaLink Hub' and (auth.uid() = owner or auth.jwt() ->> 'email' = 'mosebb@gmail.com'));`}
```

---

### 5. 결과 및 검증 완료 (Verification)
- **Supabase SQL Editor 실행 성공**: 사용자가 수정된 SQL을 실행하여 `user_id` 컬럼 추가 및 신규 RLS 정책(insert, select, delete) 적용을 오류 없이 정상 수행함을 확인했습니다.
- **프로젝트 리소스 검증**: `app/page.tsx` 및 `README.md` 파일 수정이 성공적으로 끝났고, Next.js 빌드가 안정적으로 통과됨을 확인했습니다.

---
**AK Labs**: [https://litt.ly/aklabs](https://litt.ly/aklabs)
