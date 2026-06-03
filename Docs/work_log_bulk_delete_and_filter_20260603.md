# 🌐 MediaLink Hub - 소유권 필터 및 다중 선택 삭제 로그 (Ownership Filter & Bulk Delete Log)

## 📅 일시: 2026-06-03
## 👤 작성자: 서기님 (Scribe)

---

### 1. 개발 배경 (Background)
- **사용자 요구사항 1**: 로그인한 일반 유저(소셜 로그인 등)가 자신이 올린 파일만 한곳에 따로 모아 볼 수 있는 전용 필터링 기능이 필요하게 되었습니다.
- **사용자 요구사항 2**: 수십 장의 미디어가 존재할 때 개별 삭제하는 불편함을 해소하기 위해, 다중 체크박스 선택 및 "전체 선택" 단추를 이용해 클릭 한 번으로 모든 타겟 미디어를 일괄 삭제할 수 있는 벌크 삭제 시스템 구축이 요청되었습니다.

---

### 2. 구현 및 해결 내용 (Details)

#### ① 로그인 유저 대상 소유권 필터링 탭 추가
- **[page.tsx](file:///Users/byunmose/Desktop/vibe_coding/medialink-hub/app/page.tsx)**: 그리드 상단 영역에 "모든 미디어" / "내가 올린 미디어" 토글 탭을 렌더링했습니다.
- 로그인한 유저(`user && !user.is_anonymous`) 상태일 때만 "내가 올린 미디어" 탭이 보이며, 클릭 시 `items.filter(item => item.user_id === user.id)`로 연동된 `displayedItems` 파생 리스트만 렌더링되도록 처리했습니다.

#### ② 다중 선택 체크박스 오버레이 UI 구현
- **[MediaCard.tsx](file:///Users/byunmose/Desktop/vibe_coding/medialink-hub/components/MediaCard.tsx)**: 카드 상단 좌측에 투명도 높은 체크 마크(`✓`) 원형 버튼을 오버레이로 탑재했습니다.
- 카드가 선택(`isSelected`)되었을 때 테두리가 뚜렷한 블랙 테두리(`border-zinc-900`)와 소프트한 링 그림자(`ring-2 ring-zinc-900/10`)로 감싸이도록 개편하여 다중 선택 가독성을 대폭 향상했습니다.

#### ③ 벌크 일괄 삭제 핸들러 개발 (`handleBulkDelete`)
- **트래픽 최적화**: 미디어를 하나씩 개별 삭제하기 위해 루프를 돌며 API를 다중 전송하는 대신, 선택된 파일의 전체 파일명 배열과 ID 배열을 취합하여 **단 2회의 API 트래픽 (Storage 1회, DB 1회)** 만으로 고속 일괄 삭제되도록 최적화했습니다.
- **권한 제어**: 일괄 삭제 시에도 RLS 정책 및 권한 보호를 위해 일반 로그인 유저는 **자신이 소유한 파일만** 선별 삭제가 적용되며, 관리자는 제한 없이 **선택한 모든 파일**을 강제 삭제할 수 있도록 비즈니스 로직을 구축했습니다.

#### ④ 전체 선택 및 동적 모션 제어 바 탑재
- 그리드 상단에 **"전체 선택"** 버튼을 두어 필터링된 모든 미디어를 1초 만에 토글할 수 있게 구성했습니다.
- 선택된 미디어가 1개 이상일 경우에만 빨간색 **"선택 삭제 (N)"** 버튼이 부드럽게 페이드인(`AnimatePresence` 및 `motion.button` 탑재) 되도록 UX 디테일을 올렸습니다.

---

### 3. 주요 소스 코드 변경 사항

#### [page.tsx](file:///Users/byunmose/Desktop/vibe_coding/medialink-hub/app/page.tsx)
```typescript
  // 벌크 일괄 삭제 트랜잭션 최적화
  const handleBulkDelete = async () => {
    // 1. 권한에 따른 파일 필터링
    const deletableItems = isAdmin ? targetItems : targetItems.filter(item => item.user_id === user.id);
    
    // 2. Storage 일괄 삭제 호출 (MIME 확장자 제거)
    await supabase.storage.from('MediaLink Hub').remove(fileNames);
    
    // 3. DB 일괄 삭제 호출 (IN 조건 사용)
    await supabase.from('media_files').delete().in('id', deletableIds);
    
    // ... UI 로컬 동기화 및 선택 해제 ...
  };
```

---

### 4. 결과 및 검증 완료
- **프로덕션 빌드 완료**: 탭 필터링 및 벌크 액션 파이프라인 통합 후 Next.js production build 성공.
- **최적화 검증**: 벌크 트랜잭션이 다중 API 호출 없이 고속 처리됨을 확인.

---
**AK Labs**: [https://litt.ly/aklabs](https://litt.ly/aklabs)
