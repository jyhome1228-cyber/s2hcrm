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
4. Firestore에 `users/{직원 Firebase Auth UID}` 문서를 수동 생성하여 `active: true`, `name: "직원명"`을 지정 (최초 관리자 포함).
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
