# S2H CRM 초기 데이터 / Firebase 전환 계획

## 현재 처리 상태 (2026-11-11)
- 업로드된 '공구 일정 대장(인플루언서팀)(1).xlsx'에서 **S2H 공구일정 32개 시트** 처리
- 셀러+상품 유효 행 **3,614건**
- 보수적 규칙으로 묶은 셀러 프로필 **871개** (최종 확정 수 아님)
- 정확한 텍스트 상품명 그룹 **338개** (표준 상품명 정리 전)
- 인스타그램 식별 계정 **845개**
- 자동 검토 대상으로 분류한 행 **110건**
- 벤더사 공구일정 3개 시트, 기준폼 1개 시트는 제외

## 보안
이 저장소는 **public**이므로 셀러명/인스타그램/연락처/공구이력을 포함한 데이터 파일을 커밋하지 않습니다.
GitHub에는 소스코드, Firestore 컬렉션 명세, 익명 집계, Importer만 저장합니다.
실제 JSON은 업무 담당자에게 비공개 전달 후 Firebase Firestore에 관리자 인증으로 이전합니다.

## 데이터 모델
- `sellers/{sellerId}`: name, nameAliases, instagramId, instagramUrl, followerCountLatestRecorded, legacyCategories, groupbuyCount, firstRecordedEnd, lastRecordedEnd, relationshipStatus, notes
- `products/{productId}`: standardName, aliases, groupbuyCount, sellerCount, reviewStatus
- `groupbuys/{groupbuyId}`: sellerId, productId, sellerName, productName, startDate, endDate, followers, settlementRequest, paymentWindow, legacyCategory, note, event, sourceSheet, sourceRow, originalStaff, issues
- `activities/{activityId}`: 기존 코드에서 직원 실제 연락 처리자와 타임스탬프 기록
- `proposals/{proposalId}`: 후속 버전에서 셀러-상품 제안 기록
- `users/{uid}`: 직원 접근 권한. 3~4명 공동 접근, **셀러 배정(ownerId) 없음**.

## 원본 데이터 정리 원칙
- 인스타그램 계정이 일치하면 동일 셀러로 1차 통합
- 계정 없는 기록은 해당 이름이 단 한 개 계정에만 대응할 경우에만 계정 그룹으로 연결
- 이름만 같아 다른 인스타그램 계정이 여러 개면 **자동 병합하지 않음**
- 원본 시트명과 행 번호를 보존하여 오류 복원 가능
- 기존 담당자(원본 항목)는 과거 기록 `originalStaff`에만 보존, 새 담당자 지정 기능은 사용하지 않음
- 알 수 없는 제안·거절·매출 내역을 임의로 생성하지 않음
- 결제창 / 정산 요청 / 마이크로·일반은 해석하지 않고 원문 보존

## Firebase 업로드 (비공개 컴퓨터에서만)
1. 소유자가 Firebase 프로젝트 생성 → Firestore와 Authentication 활성화
2. 관리자 머신에서 `npm install firebase-admin`
3. Firebase Admin SDK 서비스 계정을 **로컬 환경변수**로 지정: `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`
4. 받은 비공개 zip 압축을 로컬 `private-data/`에 풉니다. (gitignore 적용)
5. 먼저 `node scripts/import-seed.mjs --dir private-data`로 검증 (dry-run)
6. 이상 없을 때만 `node scripts/import-seed.mjs --dir private-data --commit`
7. Firestore에서 셀러/상품/공구 수와 원본 총 건수 대조 후 실제 운영

**절대 서비스 계정 JSON 또는 실제 데이터 ZIP을 GitHub 커밋하지 마세요.**

## 현재 웹 UI 제약
현재 앱은 `groupbuys`를 읽지만, `products`는 등록된 공구를 기반으로 임시 계산합니다.
Firebase 연결 후 필요한 다음 작업: sellerId / productId 연결된 상세화면, 검색 페이지네이션, 제안 데이터 저장, 공구 등록 시 상품 선택, 정산관리, 권한별 쓰기 제어.
