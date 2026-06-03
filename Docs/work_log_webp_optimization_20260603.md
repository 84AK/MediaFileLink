# 🌐 MediaLink Hub - 이미지 WebP 변환 최적화 로그 (WebP Optimization Log)

## 📅 일시: 2026-06-03
## 👤 작성자: 서기님 (Scribe)

---

### 1. 최적화 배경 (Optimization Background)
- **상황**: 원본 JPG, PNG 등의 이미지를 그대로 업로드할 경우 개당 수 MB(최대 10MB)에 달하여 업로드 속도가 느려지고 사용자 경험이 저하됨.
- **비용 문제**: Supabase 무료 스토리지 플랜은 **1GB**의 용량 제한이 있어 원본 업로드 시 약 200여 장이면 가득 차게 됨.
- **성능 문제**: 메인 화면인 Bento Grid 레이아웃 내에서 수많은 이미지를 한 번에 렌더링할 때 고용량 원본 파일로 인해 브라우저 로딩 과부하 발생.
- **해결책**: 브라우저(클라이언트) 단에서 HTML5 Canvas API를 사용하여 업로드 전에 고효율의 `image/webp` 포맷(품질 80%)으로 자동 압축 및 최대 가로/세로 1920px 리사이징을 거쳐 업로드하도록 로직 개선.

---

### 2. 구현 내용 (Implementation Details)

#### ① HTML5 Canvas 기반 WebP 변환 유틸 개발 (`lib/utils.ts`)
- 외부 라이브러리 설치 없이 브라우저 내장 Canvas API를 활용해 성능 부담을 없앴습니다.
- 이미지 파일(SVG 제외)에 한하여 `FileReader`로 읽은 뒤 `window.Image` 객체로 드로잉합니다.
- 가로/세로 중 더 긴 축이 **1920px**을 넘는 대형 이미지는 고유의 비율을 유지한 채 1920px로 리사이징 처리를 수행합니다.
- `canvas.toBlob`을 호출하여 `image/webp` 포맷으로 0.8 품질 압축된 바이너리를 추출하고, 기존 파일명 꼬리를 `.webp`로 교체한 새 `File` 객체를 반환합니다.
- 이미지 이외의 포맷(비디오, 오디오) 및 SVG 벡터 파일은 변환을 거치지 않고 원본 파일 객체 그대로 `resolve`하여 호환성을 확보했습니다.

#### ② 업로드 컴포넌트 연동 (`components/UploadZone.tsx`)
- 업로드 로직(`handleUpload`) 시작 시, 원본 크기 검증(10MB 초과 여부)을 먼저 마친 뒤 `convertToWebP(file)` 유틸을 호출합니다.
- 처리된 `processedFile`의 메타데이터(파일명 `.webp`, MIME타입 `image/webp`)를 기반으로 Supabase Storage 업로드 및 `media_files` 테이블 INSERT가 유기적으로 연결되도록 변경했습니다.

---

### 3. 주요 소스 코드 변경 사항 (Changes Diff)

#### [utils.ts](file:///Users/byunmose/Desktop/vibe_coding/medialink-hub/lib/utils.ts)
```typescript
/**
 * 브라우저 Canvas API를 활용하여 이미지 파일을 WebP 포맷으로 변환하고 압축합니다.
 * 이미지 가로/세로 중 더 긴 축이 1920px을 초과할 경우 비율을 유지한 채 1920px로 리사이징합니다.
 * 이미지 이외의 포맷(비디오, 오디오, SVG)은 변환하지 않고 그대로 반환합니다.
 */
export function convertToWebP(file: File, quality: number = 0.8): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      return resolve(file);
    }
    // ... Canvas API 및 toBlob을 이용한 webp 변환 및 리사이징 로직 ...
  });
}
```

#### [UploadZone.tsx](file:///Users/byunmose/Desktop/vibe_coding/medialink-hub/components/UploadZone.tsx)
```diff
     try {
-      const fileExt = file.name.split('.').pop();
+      // 업로드 전 이미지 파일인 경우 WebP로 자동 변환 및 최적화 진행
+      const processedFile = await convertToWebP(file);
+
+      const fileExt = processedFile.name.split('.').pop();
       const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
       const filePath = `${fileName}`;
 
       // ... 생략 ...
 
       // 1. Upload to Supabase Storage (Bucket: MediaLink Hub)
       const { error: uploadError } = await supabase.storage
         .from('MediaLink Hub')
-        .upload(filePath, file);
+        .upload(filePath, processedFile);
 
       if (uploadError) throw uploadError;
 
       // ... 생략 ...
 
       // 3. Save to Database (Table: media_files)
       const { error: dbError } = await supabase
         .from('media_files')
         .insert([
           {
-            file_name: file.name,
+            file_name: processedFile.name,
             file_url: publicUrl,
-            file_type: file.type.split('/')[0], // image, video, audio
+            file_type: processedFile.type.split('/')[0], // image, video, audio
             user_id: user.id,
           },
         ]);
```

---

### 4. 기대 효과 (Expected Benefits)
1. **전송 크기 감소**: 고해상도 모바일 사진(평균 5MB)이 약 400KB 수준으로 **90% 이상** 압축 전송됩니다.
2. **속도 향상**: 업로드 및 공유 이미지 조회 대기 속도가 극적으로 빨라집니다.
3. **용량 보존**: Supabase 무료 공간(1GB)에 이전 스펙 기준 약 200장에서 **최대 2,500장 이상**의 이미지를 보관할 수 있습니다.
4. **연산 무료**: 모든 처리가 사용자 브라우저에서 수행되므로 별도의 서버 비용이 일절 발생하지 않습니다.

---
**AK Labs**: [https://litt.ly/aklabs](https://litt.ly/aklabs)
