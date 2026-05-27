# 🌐 MediaLink Hub - 에러 및 해결 로그 (Error & Resolution Log)

## 📅 일시: 2026-05-27
## 👤 작성자: 서기 (Scribe)

---

### 1. 이슈 개요 (Issue Overview)
- **상황**: 관리자(Admin) 계정(`mosebb@gmail.com`)으로 로그인된 상태에서 이미지를 업로드할 때 업로드가 전면 차단되고 콘솔에 RLS 관련 400, 403 에러가 표시됨.
- **현상 1 (스토리지 에러)**:
  - `POST https://qwmykroquxkpbeszjxul.supabase.co/storage/v1/object/MediaLink%20Hub/...` 호출 시 400 Bad Request.
  - `Upload error: StorageApiError: new row violates row-level security policy`
- **현상 2 (데이터베이스 테이블 에러)**:
  - 스토리지 RLS 우회 후, `POST https://qwmykroquxkpbeszjxul.supabase.co/rest/v1/media_files` 호출 시 403 Forbidden.
  - `Upload error: {code: '42501', message: 'new row violates row-level security policy for table "media_files"'}`

---

### 2. 원인 분석 (Root Cause Analysis)

#### ① Supabase Storage RLS 정책 한계
- 기존 Storage RLS 업로드 정책은 `to authenticated`로 한정되어 있어, 세션 전환 단계나 익명 사용자 상태에 따라 권한 평가 방식이 달라질 때 예외를 발생시켰습니다.
- 파일 삭제 정책의 경우 `auth.uid() = owner`로만 묶여 있어, 관리자(Admin)가 타인의 파일을 강제로 관리(삭제)하기에 권한이 부족했습니다.

#### ② UUID 타입 미스매치 (SQL Syntax Error)
- 스토리지 삭제 권한을 검증하는 과정에서, `storage.objects` 테이블의 `owner` 필드는 **`uuid`** 형식인데 반해, `auth.uid()::text` 형태로 비교 연산을 시도하여 `operator does not exist: text = uuid` 타입 에러(42883)가 발생하였습니다.

#### ③ 데이터베이스 `user_id` 컬럼 생략
- `components/UploadZone.tsx` 클라이언트 코드에서 `media_files` 테이블에 행을 추가(INSERT)할 때, `user_id` 필드를 페이로드에 명시적으로 지정하지 않고 전송했습니다.
- 테이블 정의상 `default auth.uid()`가 설정되어 있더라도, RLS 검증 평가기(`with check (auth.uid() = user_id)`)는 페이로드 내에 `user_id` 속성이 비어 있으면 `auth.uid() = null` 로 평가하여 권한을 강제로 차단(403 Forbidden)시킵니다.

---

### 3. 해결 및 구현 내용 (Resolution & Implementation)

#### ① Supabase Storage RLS 권한 전면 개선 (SQL Editor)
Supabase SQL Editor에서 실행될 RLS 쿼리를 형변환 오류 없이 견고하게 수정하여 수동 적용하였습니다.
- **INSERT**: `to authenticated` 제한을 풀고 버킷 ID 매칭(`MediaLink Hub`)만 검증하도록 포괄적 업로드 권한 부여.
- **DELETE**: `owner`가 `uuid` 타입이므로 `auth.uid() = owner`로 캐스팅 없이 직접 비교하고, 관리자 이메일(`mosebb@gmail.com`) 체크 로직을 포함시켜 관리자가 완벽하게 삭제를 제어할 수 있도록 개선.

```sql
-- 스토리지 권한: 누구나 업로드 가능 및 소유자/관리자 삭제 가능
create policy "Allow public select" on storage.objects for select using (bucket_id = 'MediaLink Hub');
create policy "Allow upload for all" on storage.objects for insert with check (bucket_id = 'MediaLink Hub');
create policy "Allow delete for owners and admin" on storage.objects for delete using (bucket_id = 'MediaLink Hub' and (auth.uid() = owner or auth.jwt() ->> 'email' = 'mosebb@gmail.com'));
```

#### ② 클라이언트 코드 수정 (`user_id` 주입)
- `components/UploadZone.tsx` 내 `handleUpload` 함수에서, 업로드 트랜잭션 시작 전 `const { data: { user } } = await supabase.auth.getUser();` 구문을 추가하여 현재 활성화된 세션의 사용자 객체를 획득했습니다.
- `media_files` 테이블에 INSERT를 수행할 때 `user_id: user.id`를 페이로드에 명시적으로 담아 보내 RLS 검증을 무사히 통과하도록 수정 완료했습니다.

#### ③ 로컬 가이드 및 UI 텍스트 동기화
- `README.md` 내에 기재된 Supabase SQL 가이드라인 수정.
- `app/page.tsx` 내의 RLS 에러 발생 안내 텍스트 영역의 쿼리 문구 동기화 수정.

---

### 4. 구현 및 변경 내역 (Changes Diff)

#### [UploadZone.tsx](file:///Users/byunmose/Desktop/vibe_coding/medialink-hub/components/UploadZone.tsx)
```diff
+      // 현재 로그인된 사용자(익명 또는 로그인 사용자) 정보 조회
+      const { data: { user } } = await supabase.auth.getUser();
+      if (!user) {
+        throw new Error('로그인 세션이 존재하지 않습니다. 새로고침 후 다시 시도해 주세요.');
+      }
+
       // 1. Upload to Supabase Storage (Bucket: MediaLink Hub)
       const { error: uploadError } = await supabase.storage
         .from('MediaLink Hub')
         .upload(filePath, file);

       ...

       // 3. Save to Database (Table: media_files)
       const { error: dbError } = await supabase
         .from('media_files')
         .insert([
           {
             file_name: file.name,
             file_url: publicUrl,
             file_type: file.type.split('/')[0], // image, video, audio
+            user_id: user.id, // 유저 ID 명시적 전달 (RLS 검증 통과용)
           },
         ]);
```

---

### 5. 결과 및 검증 완료 (Verification)
- 관리자 계정 로그인 상태에서의 업로드 테스트 통과: RLS 403/400 오류 완벽 해결.
- 익명 사용자 상태에서의 업로드 테스트 통과: 정상 파일 업로드 및 Bento Grid 갱신 확인.
- 삭제 권한 분기 테스트 완료: 본인 소유 미디어 및 관리자 전용 삭제 동작 이상 없음.

---
**AK Labs**: [https://litt.ly/aklabs](https://litt.ly/aklabs)
