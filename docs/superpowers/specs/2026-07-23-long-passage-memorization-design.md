# 긴 본문 암송 ("핵심 암송") 설계

> 상태: 설계 확정(사용자 승인) · 다음 단계: 구현 계획(writing-plans)
> 대상 저장소: bible-memorize-church-app-v2 (gocheok.onlybible.kr)

## 배경 / 목적

현재 앱은 **짧은 단일 구절**(주간 암송구절)만 다룬다. `verses` 테이블은 한 절 텍스트를 전제로 하고, 암송 화면(`renderTestScreen`)은 본문을 공백 단위로 토큰화해 빈칸을 만든다.

이번 2차 과제는 **주기도문·사도신경·시편 1편·성령의 열매**처럼 **여러 절/문장으로 이뤄진 긴 본문**을 성도가 외울 수 있게 하는 것이다. 긴 본문은 한 화면에 통째로 빈칸을 두면 압도적이라, 기존과 다른 접근이 필요하다.

전개: **어드민에서 먼저 등록·검수 → 준비되면 사용자에게 공개**.

## 확정된 핵심 결정 (사용자 답변)

1. **암송 방식** — 절 단위 순차 + 마지막 전체 이어서. 본문을 절/문장 단위로 나눠 한 절씩 익히고, 다 익히면 전체를 이어서 암송한다.
2. **시스템 관계** — 별도 섹션 + 별도 기록. 기존 주간 구절 목록·랭킹·통계와 분리하되, **나중에 통합할 수 있는 형태**로 완료 기록을 남긴다.
3. **완료·복습** — 완료 배지 + 언제든 다시. 강제 간격반복 복습은 없음. 다 외우면 "외운 말씀" 배지, 사용자가 원할 때 다시 암송.

## 메뉴 구조

- **어드민**: 허브(`admin.html`)의 `TOOLS` 배열에 `admin-passages.html` 한 줄 추가 → 긴 본문 등록·수정 전용 화면. 기존 허브 비번(sessionStorage `admin-pw`) 공유.
- **사용자**: 홈 화면(`renderSummary`)에 새 진입 버튼 "📜 핵심 암송" → 본문 목록(카드) → 본문 선택 → 암송 흐름. 기존 주간 구절 목록과 완전히 별개 화면.

## 데이터 모델

신규 테이블 **`passages`** 하나 (기존 `sermons`의 jsonb 배열 패턴 계승 — 항상 본문 전체를 함께 로드하고 편수가 적어 join 불필요):

| 컬럼 | 타입 | 내용 |
|---|---|---|
| `id` | serial int | 본문 번호(기존 `verses.no`와 같은 정수 키 방식) |
| `title` | text | 예: 주기도문 |
| `ref` | text (nullable) | 예: 마 6:9-13 |
| `category` | text | 기도문 / 신앙고백 / 시편 / 주제 (목록 그룹핑) |
| `lines` | jsonb | 절 배열: `["하늘에 계신 우리 아버지여", "이름이 거룩히...", ...]` — 한 원소 = 한 절 |
| `sort_order` | int | 목록 정렬 |
| `is_active` | boolean | 본문 단위 노출 |
| `created_at` | timestamptz | 메타 |

신규 테이블 **`passage_progress`** (완료 기록 — 별도 트랙이지만 향후 통계·랭킹 통합의 씨앗):

| 컬럼 | 내용 |
|---|---|
| `user_id` | 사용자 |
| `passage_id` | 본문 |
| `done_seq` | int[] — 완료한 절 인덱스 |
| `completed_at` | timestamptz (nullable) — 전체 이어서까지 통과한 시각 |

PK `(user_id, passage_id)`. 지금은 랭킹에 노출하지 않지만 데이터는 남겨 나중에 집계 가능.

## 암송 흐름 (핵심)

본문을 열면 **절 목록**이 세로로 보이고, 위에서부터 하나씩 잠금 해제되며 진행한다.

- **각 절 = 한 번의 채우기**. 기존 암송 화면을 재사용하되, 주간구절의 25→65→100% 3단계 상승은 절마다 반복하면 스텝이 과도해지므로 **절당 1회**로 둔다(긴 본문은 절 수가 곧 난이도). 보기/듣기(TTS)/빈칸채우기 버튼은 그대로.
- **한 절 완료 → 다음 절 열림**. 목록에 `✓` 채워짐 (예: 시편1편 3/6절).
- **모든 절 완료 후 "전체 이어서 암송"**: 도움 버튼 없이 절1 → 절2 → … 끝까지 이어서 빈칸 채우기(절 단위로 넘어가며 한 흐름). 통과 시 **"외운 말씀" 배지**.
- 배지 획득 후에도 사용자가 원하면 언제든 다시 암송(라이브러리형 재진입).

## 재사용 / 신규 API

- **재사용(클라이언트)**: `renderTestScreen`의 토큰화·`pickBlankIndices`·`setupAutoCheck`·TTS(`speakText`)·음성(`setupVoice`). 한 절 = 짧은 텍스트라 기존 로직에 그대로 들어맞는다. 화면 셸은 긴 본문 전용으로 새로 그리되 채점/빈칸/TTS 유틸을 공유.
- **신규 API 액션**(Edge Function `api`, 기존 `supaCall` 래퍼·`adminError` 재사용):
  - `getPassages` — 공개 목록(is_active). 비인증.
  - `savePassage` — 등록·수정 (ADMIN_SECRET). `saveVerse`와 같은 upsert 패턴.
  - `deletePassage` — 삭제 (ADMIN_SECRET).
  - `savePassageProgress` — 완료 이벤트 저장 (user_id 기반).

## 어드민 입력

`admin-passages.html`: 제목·출처·분류 입력 + **본문은 "한 줄에 한 절"로 붙여넣기**(줄바꿈이 곧 절 경계 — 어드민이 분할을 직접 통제, 자동분할 오작동 없음). 저장 시 줄 배열로 변환해 `savePassage` 호출. 목록에서 기존 본문 선택→수정, 관리자 비번 재확인은 기존 `saveVerse` 흐름과 동일.

## 기록 & 공개 전환

- **진행 기록**: 절별 완료·전체 완료를 localStorage에 저장(기존 `progress` 패턴, 사용자별 키). 추가로 완료 이벤트를 `passage_progress`에 서버 저장 → 향후 랭킹·통계 통합의 씨앗.
- **공개 전환**: 기존 `getConfig/saveConfig`에 플래그 `passagesPublic` 하나 추가. 꺼두면 홈 버튼 미노출(사용자에게 숨김), 어드민은 딥링크 `?passages=1`로 섹션을 강제 노출해 미리보기(주간구절 `?preview=` 처리와 같은 방식). 켜면 홈에 "📜 핵심 암송" 버튼 상시 노출. 어드민-우선 준비 → 준비되면 스위치 ON.

## 범위에서 빼는 것 (YAGNI)

- 영어(NIV) 병행, 간격반복 복습 큐, 랭킹 노출, 절별 서버 실시간 동기화 → **이번엔 안 함**. 완료 로그만 남겨 통합의 문을 열어둔다.

## 배포 체크리스트 (기존 규칙 준수)

1. DB: `passages`·`passage_progress` 마이그레이션 SQL (`supabase/` 아래 신규 파일) → SQL Editor 또는 `supabase db query --linked -f`.
2. 백엔드: 새 액션 추가 후 `supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf`.
3. 프런트: `app.js`/`style.css` 수정 시 `index.html`의 `?v=` 캐시태그 갱신 + `.splash-ver` +0.001(소수점 3자리).
4. 커밋·푸시(Actions 자동 배포).

## 검증 방법

- 어드민에서 주기도문 1건 등록(줄바꿈으로 7절) → `getPassages` 응답에 `lines` 배열 확인.
- `passagesPublic` OFF 상태에서 홈에 버튼 미노출, 딥링크 미리보기로 흐름 확인.
- 절 순차 진행: 1절 통과 시 2절 열림, 목록 `✓` 증가, 마지막 "전체 이어서" 통과 시 배지.
- `passagesPublic` ON → 홈 버튼 노출, 실기기(iOS Safari·Android Chrome)에서 빈칸·TTS·음성 동작.
- 기존 주간 구절 흐름·랭킹·통계에 영향 없음(별도 트랙) 확인.
