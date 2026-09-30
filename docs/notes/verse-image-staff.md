# 연상 그림 — 담당자가 관리자 화면(③)에서 만든다 (2026-09-30 운영)

> 설계 `docs/superpowers/specs/2026-09-21-verse-image-staff-design.md` · 계획 `docs/superpowers/plans/2026-09-21-verse-image-staff.md`.
> 설교 올리기와 같은 화면(설교·찬양 관리)의 ③ 이다 — 로그인·암호는 `docs/notes/sermon-staff-upload.md`.

## 구조

담당자가 우리말로 장면을 고르면 서버가 **영어 한 문장**(Claude)으로 바꾸고, 그 뒤에 **칸별 꼬리말 + 고정 화풍 문구**를 붙여
Gemini(`gemini-3-pro-image` · 4:3)로 그린다 → 담당자가 확인표로 검수하고 설명을 달아 저장 → 저장소 칸 `verse-img`(공개 읽기) +
표 `verse_images` → `getVerses` 가 구절마다 `images` 로 내려보내고 앱(`app.js` `dbImgs`)이 🖼️ 탭에 보인다.
**담당자는 영어를 보지 않는다.** 칸은 `a`(대표) · `b`·`c`(짝).

## ⚠️ 함정

- **화풍 문구는 두 곳** — 서버 상수 `VIMG_STYLE_A`·`VIMG_STYLE_BC`(`supabase/functions/api/index.ts`)와 안내서
  `img/verse/암송말씀_그림_만들기.md` 2장. 한 글자도 바꾸지 않는다는 원칙이라, 바꾸게 되면 두 곳을 함께.
- **비용 안전장치** — 한 구절 하루(24시간) **15장**(`VIMG_DAILY`) + 모든 구절 합쳐 하루 **60장**(`VIMG_DAILY_ALL`, 최종 검토 뒤 더함).
  성공한 생성만 `verse_image_gens` 에 적어 센다. ⚠️ 시간 초과된 호출은 우리가 안 세도 구글이 청구할 수 있다 —
  그래서 **Google Cloud 쪽 예산 알림·하루 요청 한도**가 따로 필요하다(친구 몫).
- **그림 크기 1K** — `VERSE_IMG_SIZE` 는 두지 않는다(기본 `1K`, 계획 Task 3 에서 실제 크기를 재 충분하다고 정했다). 한 장 500KB 한도.
- **DB 그림이 옛 그림 파일보다 앞선다** — 같은 번호에 둘 다 있으면 DB 것. **내리기**(숨김 · 되돌리기 가능)하면 옛 파일로 돌아가고,
  옛 파일도 없으면 🖼️ 탭이 사라진다. 1~38번 옛 그림(`app.js` `VERSE_IMG`)은 ③ 에서 **보이기만** 하고 고치지 않는다 —
  바꾸려면 DB 그림을 새로 만들면 그것이 앞선다.
- **짝만 있고 대표(`a`)가 없으면 보이지 않는다** — 대표가 있어야 탭이 뜬다(옛 규칙과 같다).
- **주간 구절(`no < 1000`)만** 대상이다. 시편 번호는 `bad-no` 로 막는다.
- 표 `verse_images`·`verse_image_gens` 는 RLS 켬 + `anon`·`authenticated` 둘 다 revoke(카카오 로그인 규칙) ·
  저장소 칸에는 `storage.objects` 정책을 두지 않는다(쓰기는 서버 service role 만, 읽기는 공개 칸이라 주소로만).

## 운영 반영 기록 (2026-09-30)

운영 `verse_images.sql` → 운영 `api`(설교 올리기와 한 판) → 화면 v3.499. 확인: 새 표 셋 RLS·공개 키 42501 · `storage.objects` 정책 없음 ·
관리자로 `verseImgList` → ok · 요약 39구절 · 그림 0 · 틀린 암호 `unauthorized`. 운영 `GEMINI_API_KEY` 는 개발과 같은 키(지문 대조).

## 남은 것

- 첫 실전: 그 주 구절의 대표 그림을 담당자가 만들고 친구가 앱에서 본다 — 돌려받은 저장소 주소를 로그인 없이 열어 200·`image/webp`.
  1~38번이면 옛 짝 그림이 사라지는 것이 맞다.
- Google Cloud 예산 알림·하루 요청 한도(친구).
