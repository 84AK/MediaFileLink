# 🌐 MediaLink Hub - 다중 이미지 업로드 및 스키마 캐시 오류 로그 (Multi-Upload & Schema Cache Log)

## 📅 일시: 2026-06-03
## 👤 작성자: 서기님 (Scribe)

---

### 1. 이슈 및 최적화 개요 (Overview)

#### ① PostgREST 스키마 캐시(Schema Cache) 오류 상황
- **현상**: 관리자 계정 로그인 상태에서 업로드 시도 시 `Could not find the 'expires_at' column of 'media_files' in the schema cache` 에러와 함께 `400 Bad Request` 응답이 반환되었습니다.
- **진단 결과**: 이미지 자동 만료(expires_at) 계획서가 승인된 후, 데이터베이스에 실제 `expires_at` 컬럼이 추가되지 않은 상태에서 코드가 배포되어 발생한 컬럼 유실 에러였습니다. (1차 RLS 쿼리 실행 시에는 `user_id` 추가 문구만 있었고 `expires_at` 추가 문구가 포함되어 있지 않았기 때문입니다).
- **조치 사항**: 사용자에게 `ALTER TABLE media_files ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;` 쿼리를 실행하여 실제 테이블 스키마를 업데이트하도록 가이드했습니다.

#### ② 다중 파일 업로드(Multi-Upload) 기능 추가
- **배경**: 여러 장의 사진을 공유하기 위해 파일을 한 장씩 매번 드롭해야 하던 불편함을 극복하고자 다중 드래그 앤 드롭 및 다중 셀렉트 기능을 도입했습니다.

---

### 2. 다중 업로드 상세 구현 내용 (Implementation Details)

#### ① 다중 파일 선택 및 드롭 구조화 (`components/UploadZone.tsx`)
- 파일 탐색기 선택창에 `multiple` 속성을 활성화하여 여러 장의 이미지를 동시 선택할 수 있게 개선하였습니다.
- 드래그 앤 드롭 이벤트(`onDrop`) 시 `e.dataTransfer.files` 객체 전체를 인지하도록 처리했습니다.

#### ② 순차 비동기 업로드 파이프라인
- 모바일 및 저사양 브라우저의 과부하 및 Canvas 리사이징 시의 OOM(메모리 부족) 현상을 완벽히 방어하고자, 업로드 대상 리스트를 `Array.from`으로 배열화한 뒤 **순차 루프(Sequential Loop)**를 돌며 한 장씩 WebP 변환 및 Supabase 업로드를 수행하도록 구축했습니다.

#### ③ 진행 현황(Progress) 피드백 UI 탑재
- `uploadProgress` 상태(`{ current: number, total: number }`)를 신설하여, 업로드 로딩 메시지 상에 **"미디어를 처리 중입니다... (M / N)"** 형태로 몇 번째 파일이 처리되고 있는지 실시간 수치 피드백을 노출하여 사용자 대기 경험을 크게 강화했습니다.

---

### 3. 소스 코드 변경 디프 (Key Code Changes)

#### [UploadZone.tsx](file:///Users/byunmose/Desktop/vibe_coding/medialink-hub/components/UploadZone.tsx)
```typescript
  // handleUploads 다중 파일 순차 루프
  const handleUploads = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    setIsUploading(true);
    setUploadProgress({ current: 0, total: fileArray.length });
    
    // ... 모든 파일 크기 및 포맷 검사 ...
    
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setUploadProgress(prev => ({ ...prev, current: i + 1 }));

      const processedFile = await convertToWebP(file);
      // ... Storage 업로드 및 DB insert 순차 수행 ...
    }
  }, [onUploadComplete]);
```

---

### 4. 결과 및 기대 효과
- **로딩 투명성 확보**: 다중 업로드 중에도 사용자가 진행 상황을 시각적으로 인지할 수 있어 서비스 신뢰성이 대폭 향상되었습니다.
- **컴파일 성공**: 다중 업로드 통합 후 Next.js의 production build가 성공적으로 완료되었습니다.

---
**AK Labs**: [https://litt.ly/aklabs](https://litt.ly/aklabs)
