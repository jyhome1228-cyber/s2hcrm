# S2H CRM — Seller Operations

S2H 내부 셀러·공동구매·영업 활동 관리 시스템의 첫 버전입니다.

## 구성
- GitHub Pages 정적 웹앱 (HTML/CSS/JavaScript)
- Firebase Authentication: 직원 이메일/비밀번호 로그인
- Cloud Firestore: 셀러, 공구 일정, 활동기록, 팀원 권한
- 공구 종료일 30일 후 재연락 알림(접속 시 계산). 확인 버튼만으로 해제되지 않으며 연락 활동을 저장해야 완료됩니다.

## Firebase 연결
1. Firebase Console에서 프로젝트 생성 → 웹 앱 등록 → **웹 앱 설정(firebaseConfig)** 복사
2. Authentication > Sign-in method > Email/Password 활성화. 직원 계정은 Firebase Console에서 직접 생성 (공개 회원가입 없음).
3. Firestore Database 생성. `firestore.rules` 내용을 Firestore > Rules에 게시.
4. Firestore에 `users/{직원 Firebase Auth UID}` 문서를 수동 생성하여 `active: true`, `name: "직원명"`, 최초 검수 관리자에게는 **`role: "admin"`**을 지정합니다. 관리자 계정 확인이 끝나기 전에 관리자 전용 Rules를 게시하지 마세요.
5. `firebase-config.js`의 PLACEHOLDER 값을 웹 앱 설정값으로 교체. Firebase 웹 설정은 비밀키가 아니라 프로젝트 식별정보이며 Firestore Rules로 실제 접근을 통제합니다. 서비스 계정 키는 절대 저장소에 올리지 마세요.
6. Firebase Authentication > Settings > Authorized domains에 GitHub Pages 도메인 `jyhome1228-cyber.github.io` 추가.
7. GitHub 저장소 Settings > Pages > Deploy from a branch > main / root 선택.

배포 URL: https://jyhome1228-cyber.github.io/s2hcrm/

## 데이터
- `users/{uid}`: name, active
- `sellers/{autoId}`: name, channel, contact, note, cycleDays, createdAt, updatedAt
- `groupbuys/{autoId}`: sellerId, sellerName, product, startDate, endDate, status, memo, createdAt
- `activities/{autoId}`: sellerId, sellerName, type, memo, actorUid, actorName, createdAt

## 현재 범위/제한
- 접속 중 알림판에서 공구 종료 후 경과기간을 계산하며, 이메일·푸시를 예약 발송하지 않습니다.
- 알림은 셀러별 마지막 공구 종료일과 이후 연락 활동을 기준으로 판단합니다. 공구별 별도 리마인드/반복 스케줄은 후속 단계입니다.
- 날짜는 한국 날짜(YYYY-MM-DD)로 입력·비교합니다. 기본 리마인드 기준은 종료일 + 30일입니다.
- 셀러 정보는 회사 내부 개인정보일 수 있으므로 실제 운영에서는 직원 접근권한과 데이터 보존 정책을 관리하세요.


## 2026-11-25 1차 안정화 — 운영 전 검수 안내

- **점검 모드 유지:** 웹앱의 MAINTENANCE_MODE는 true. 프런트엔드 접근 제한만으로 서버 데이터 권한이 제한되지는 않습니다.
- **Firestore Rules:** 이 저장소의 `firestore.rules`는 관리자 전용 점검 규칙으로 준비했습니다. **GitHub Pages 배포는 Firebase Rules를 게시하지 않습니다.** Firebase Console → Firestore → Rules에서 계정의 `role:"admin"`을 확인한 후 별도 게시해야 실제로 적용됩니다. 기존 직원 접근 규칙은 `firestore.operational.rules`에 보존되어 있으며, 운영 재개 전에 보안 검수 후 수동 적용하세요.
- **리마인드:** 미처리 업무는 30일이나 연도 변경으로 자동 소멸되지 않음. 실제 연락 유형 및 명시적 완료 이력만 연락 처리로 판정. 동일 인스타 계정 중복 셀러는 하나의 후속 연락 대상으로 묶음.
- **공구 캘린더:** 오늘 오픈 공구는 겹치는 기간형 막대 중 우선 표시. 저장된 진행 상태가 명시적이면 해당 상태를 표시하고, 과거 원본 `기록`은 날짜 기준으로 해석.
- **백업:** `복원용 JSON · CSV ZIP`에 `backup-manifest.json`과 원본 날짜 형식을 보존. 옛날 `activities.json` 포함 4컬렉션 ZIP도 검증할 수 있음.
- **복원:** 모든 대상 컬렉션이 비어 있을 때에만 문서 생성. Firestore 트랜잭션으로 각 ID의 존재 여부 확인 후 생성하여 덮어쓰기 방지. 대량 복원은 여러 트랜잭션이므로 중간 중단 시 부분 복원이 발생할 수 있습니다. 자동 재시도하지 마세요.
- **조회 오류:** 데이터 소스별 오류 안내와 '다시 시도' 제공. `createdAt`이 없는 과거 문서도 컬렉션에 포함되도록 목록 로딩 개선.
- **실운영 검수 미완료:** Firebase 실제 규칙 게시, 관리자 계정 저장·재조회, 원본 백업 복원 리허설, 모바일 화면 테스트는 별도 확인 필요.


## 2026-11-26 디자인 개편 12차 — QA 결과

- 1~12차 디자인 개편 코드 반영. S2H 원본 로고 및 #0089B3 유지.
- JS 문법 검사: app.js, normalization.js, preflight-utils.js 통과.
- HTML 정적 ID 중복 없음. 원본 CSS와 배포 번들 끝부분 일치 확인.
- 샘플 함수 테스트: 빈/잘못된 월, 주간 이동 범위, 연속 공구 막대, 역전된 날짜 제외, 명시적 공구 상태, 준비 체크 항목 수, 빈 테이블 통과.
- 마지막 보완: 로그인 중복 요청, 인증 전환 시 이전 콜백 차단 및 팝업/로딩 상태 초기화, 없는 셀러/상품 수정 방지, 메뉴 현재 위치 접근성.
- 미검증: 실제 배포 페이지 브라우저 렌더링, 로그인 및 Firestore 읽기/쓰기, 복사·CSV·XLSX 실제 다운로드, 기기별 스크롤/팝업, 실제 Rules 게시 여부, 백업·복원 리허설.
- 관리자 점검 모드 유지. 운영 재개는 실제 관리자 검수 및 Firebase Console 규칙 확인 후 별도 진행. GitHub Pages는 Firestore Rules를 배포하지 않음.
