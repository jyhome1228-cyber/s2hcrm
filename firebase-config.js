// Firebase Console > Project settings > Your apps > Web app configuration
// 이 파일에는 Firebase 웹 앱 설정값만 넣으세요. 서비스 계정의 개인키를 넣지 마세요.
export const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_WEB_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
export const firebaseConfigured = !firebaseConfig.apiKey.startsWith("YOUR_");
