# 🏃 탕비실 간식런

링크만 있으면 누구나 **익명으로** 탕비실 간식을 건의하고, 댓글과 이모지 반응으로 와글와글 떠드는 실시간 버블 대시보드.

- 🫧 댓글·반응이 많을수록 버블이 커지는 물리 시뮬레이션 홈
- 🦝 랜덤 익명 닉네임 + 동물 아바타 (로그인 없음)
- 🤤🙏🙅 이모지 반응 & 익명 댓글
- 👑 이번 주 간식왕
- 🎉 건의 제출 시 콘페티 + 효과음
- 📱 모바일 퍼스트

## 개발

```bash
npm install
npm run dev
```

Firebase 연동 전에는 **데모 모드**(브라우저 로컬 저장)로 동작합니다.

## 연동 & 배포

[SETUP.md](./SETUP.md) 참고 — Firebase 콘솔 5분 + GitHub Pages 3분.

## 스택

Vite + Vanilla JS + d3-force (버블 물리) + Firebase Firestore (실시간 공유 DB) + GitHub Pages
