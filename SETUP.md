# 🛠 탕비실 간식런 — 연동 & 배포 가이드

딱 두 가지만 하면 됩니다: **① Firebase 연동 (약 5분)** → **② GitHub Pages 배포 (약 3분)**

Firebase 연동 전에도 사이트는 "데모 모드"로 동작해요 (데이터가 각자 브라우저에만 저장됨).

---

## ① Firebase 연동 — 콘솔 화면 기준 순서

### 1. 프로젝트 만들기

1. https://console.firebase.google.com 접속 → 구글 계정으로 로그인
2. **"프로젝트 만들기"** (또는 "+ 프로젝트 추가") 카드 클릭
3. 프로젝트 이름에 `tangbisil` 입력 → **계속**
4. "Google 애널리틱스 사용 설정" 토글이 나오면 → **꺼도 됩니다** (필요 없음) → **프로젝트 만들기**
5. 30초쯤 기다리면 "새 프로젝트가 준비되었습니다" → **계속**

### 2. Firestore 데이터베이스 만들기

1. 왼쪽 사이드바에서 **빌드(Build) → Firestore Database** 클릭
2. 가운데 큰 버튼 **"데이터베이스 만들기"** 클릭
3. 위치(리전) 선택 화면: **asia-northeast3 (Seoul)** 선택 → **다음**
4. 보안 규칙 선택 화면: **"프로덕션 모드에서 시작"** 선택 → **만들기**
   (잠금 상태로 시작하고, 바로 다음 단계에서 규칙을 붙여넣을 거예요)

### 3. 보안 규칙 붙여넣기

1. Firestore 화면 상단 탭에서 **"규칙(Rules)"** 클릭
2. 편집기에 있는 내용을 전부 지우고 아래를 붙여넣기:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /snacks/{snackId} {
      allow read: if true;
      allow create: if request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() <= 40
        && request.resource.data.url is string
        && request.resource.data.url.size() <= 500
        && request.resource.data.reason is string
        && request.resource.data.reason.size() <= 200;
      // 반응 카운트/댓글 수만 수정 가능 (이름·링크 변조 불가)
      allow update: if request.resource.data.diff(resource.data).affectedKeys()
        .hasOnly(['reactions', 'commentCount']);
      // 관리자 버블 터뜨리기용 (관리자 UI는 IP로 제한, 규칙 차원에선 열림)
      allow delete: if true;

      match /comments/{commentId} {
        allow read: if true;
        allow create: if request.resource.data.text is string
          && request.resource.data.text.size() > 0
          && request.resource.data.text.size() <= 300;
        allow update: if false;
        allow delete: if true;
      }
    }

    // 완판 히스토리 (관리자가 버블을 터뜨리면 여기 기록)
    match /history/{historyId} {
      allow read: if true;
      allow create: if request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() <= 40;
      allow update: if false;
      allow delete: if true;
    }
  }
}
```

3. 상단 **"게시(Publish)"** 버튼 클릭

> 링크를 아는 사람 누구나 읽고 쓸 수 있는 규칙이에요 (익명 서비스니까 의도된 것).
> 대신 글 삭제/변조는 막혀 있고, 글자 수 제한이 걸려 있어요.

### 4. 웹 앱 등록하고 config 복사하기

1. 왼쪽 사이드바 맨 위 **⚙️(톱니바퀴) → 프로젝트 설정** 클릭
2. "일반" 탭을 아래로 스크롤 → **"내 앱"** 섹션에서 **`</>`** (웹) 아이콘 클릭
3. 앱 닉네임에 `tangbisil` 입력 → "Firebase 호스팅 설정" 체크는 **하지 않음** → **앱 등록**
4. 화면에 `const firebaseConfig = { apiKey: "...", ... }` 코드가 나타남
5. 그 **중괄호 안의 값들을 복사**해서 이 프로젝트의 `src/firebase-config.js` 파일에 붙여넣기
   (PASTE_로 시작하는 자리들을 실제 값으로 교체)
6. **콘솔로 이동** 클릭해서 마무리

이제 `npm run dev`로 열어보면 데모 모드 배너가 사라지고 진짜 공유 DB로 동작합니다. 🎉

---

## ② GitHub Pages 배포

1. GitHub에서 새 저장소 생성: 이름 **`tangbisil`** (Public)
2. 터미널에서:

```bash
cd ~/tangbisil
git add -A
git commit -m "탕비실 간식런 초기 버전"
git remote add origin https://github.com/<내계정>/tangbisil.git
git push -u origin main
```

3. GitHub 저장소 페이지 → **Settings → Pages** (왼쪽 메뉴)
4. "Build and deployment" 섹션의 **Source**를 **"GitHub Actions"** 로 변경
5. 저장소의 **Actions 탭**에서 "Deploy to GitHub Pages" 워크플로우가 초록불 될 때까지 대기 (1~2분)
6. 완료되면 접속 주소: **`https://<내계정>.github.io/tangbisil/`** — 이 링크를 회사에 공유!

이후에는 `main`에 push할 때마다 자동으로 재배포됩니다.

---

## ③ 관리자 기능 (버블 터뜨리기 & 히스토리)

- **관리자 판별**: `src/admin.js`의 `ADMIN_IPS`에 등록된 공인 IP로 접속하면 관리자 모드가 켜져요 (닉네임 칩에 🛡️ 표시).
- **버블 터뜨리기**: 관리자가 간식 상세를 열면 "🧨 구매 완료 — 버블 터뜨리기" 버튼이 보여요. 누르면 버블이 터지고 **완판 히스토리**(우상단 🏆 아이콘)에 이름/사진만 남아요.
- **히스토리 말소**: 관리자는 히스토리 항목의 ✕ 버튼으로 기록도 지울 수 있어요.
- **IP가 바뀌면**: `src/admin.js`에서 IP를 수정/추가하고 다시 배포하면 됩니다. 현재 IP는 https://api.ipify.org 에서 확인.

> ⚠️ 솔직한 참고: Firestore 규칙은 접속자 IP를 검사할 수 없어서, 삭제 권한은 규칙 차원에서는 열려 있고 **화면(UI)에서만 관리자에게 노출**돼요. 개발자 도구를 쓸 줄 아는 사람이 마음먹으면 지울 수 있는 구조라, 사내용 익명 서비스라는 전제에서의 가벼운 잠금장치입니다.

---

## 자주 묻는 것

**Q. firebase-config.js를 GitHub에 올려도 되나요?**
네. Firebase 웹 API 키는 비밀키가 아니라 "주소" 같은 개념이라 공개돼도 됩니다. 실제 보안은 위에서 붙여넣은 Firestore 규칙이 담당해요.

**Q. 쿠팡 상품 이미지가 자동으로 안 나와요**
쿠팡이 외부 크롤링을 차단해서 자동 수집은 불가능해요. 건의할 때 상품 사진을 **길게 눌러(우클릭) → "이미지 주소 복사"** 한 뒤 선택 입력란에 붙여넣으면 버블에 실제 사진이 표시됩니다.

**Q. 무료인가요?**
네. Firestore 무료 한도(일 읽기 5만 / 쓰기 2만)는 회사 규모에서 넉넉하고, GitHub Pages도 무료입니다.

**Q. 데이터를 초기화하고 싶어요**
Firebase 콘솔 → Firestore Database → 데이터 탭에서 `snacks` 컬렉션에 마우스를 올리면 나오는 ⋮ 메뉴로 삭제하면 됩니다.
