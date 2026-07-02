# v1 → v2 데이터 이관

v1(Google Sheets) 데이터를 Supabase로 옮긴다. **v1 운영에는 영향 없음(읽기만).**

## 순서
1. **v1 Apps Script 재배포** — `bible-memorize-church-app/Code.gs`에 `dump` 액션이 추가돼 있다.
   전체 코드를 Apps Script 편집기에 붙여넣고 **새 버전으로 배포**한다.
2. **덤프 내보내기** — 브라우저에서 아래 주소를 열고(=관리자 비밀번호 ADMIN_PW),
   응답 JSON 전체를 `migrate/v1dump.json` 으로 저장한다.
   ```
   <v1 /exec URL>?action=dump&pw=<ADMIN_PW>
   ```
3. **가져오기 실행** (Supabase의 ADMIN_SECRET 필요):
   ```powershell
   cd C:\Projects\bible-memorize-church-app-v2
   node migrate/import.mjs <ADMIN_SECRET>
   ```
   → `사용자 N · 진도 N · 활동로그 N` 출력되면 완료.

## 매핑
- `기록` 탭(학습 통과) → `progress`(구절별 최고 단계) + `challenge_log(mode=learn-*)`(일시 보존)
- `도전기록` 탭 → `challenge_log(mode=typing/voice)`(일시 보존)
- 신원(구분·소속·세부·성명)이 같으면 앱 로그인과 동일 사용자로 합쳐진다(identity_key).
- 재실행해도 진도는 UPSERT(안전)이나, **활동로그는 중복 삽입되므로 1회만 실행**한다.

> `v1dump.json` 은 개인정보이므로 커밋하지 않는다(.gitignore 처리됨).
