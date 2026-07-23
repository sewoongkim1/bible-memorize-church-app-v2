# 설교 아카이브 챗봇 (관리자 베타) — 설계 문서

**날짜**: 2026-07-23
**대상 앱**: 고척교회 말씀암송앱 v2 (`bible-memorize-church-app-v2`, gocheok.onlybible.kr)
**배경**: 몇 년치(현재 DB엔 올해 39개) 설교가 `sermons` 테이블에 잘 구조화돼 있으나, 여러 설교를 가로질러 "목사님이 이 주제로 뭐라고 하셨더라?"를 검색·질의하는 방법이 없다. 이미 있는 자기계발 RAG 앱(myfavorite)의 아키텍처를 이 앱에 이식해, 설교 아카이브를 대화형으로 검색하는 관리자 베타 기능을 만든다.

## 승인된 결정 (브레인스토밍, 2026-07-23)

1. **A안 — gocheok 자체 완결**: 챗봇 백엔드를 gocheok의 기존 `api` Edge Function(Deno)에 새로 구현한다. myfavorite를 API로 호출하지 않는다(인증 체계가 다르고 두 앱이 얽히는 것을 피함).
2. **근거 기반 요약 + 출처 명시**: Claude는 검색된 설교 내용만 근거로 답변하고, "차동혁 목사님은 [날짜] '[제목]' 설교에서…" 형태로 출처를 밝힌다. 검색 범위를 벗어난 창작 금지. 자료가 없으면 "그 주제로 하신 설교를 찾지 못했습니다"라고 솔직히 답한다. AI가 목사 행세를 하는 게 아니라 "설교 검색 도우미"임을 분명히 한다.
3. **유튜브 링크 포함**: 답변에 원 설교 유튜브 링크(`sermons.id`가 유튜브 영상 ID)를 함께 제공한다.
4. **관리자 메뉴에 추가(베타)**: `admin.html` 허브의 `TOOLS` 배열에 한 줄 추가해 새 관리자 페이지로 노출. 백엔드 액션은 `adminError(ADMIN_SECRET)`로 게이트. 교인용(비관리자) 노출은 반응을 본 뒤 별도로 결정.
5. **올해 설교 39개 전체 임베딩**: `summary` + `points` + `daily_meditations`를 청킹·임베딩한다.

## 아키텍처

기존 코드/인프라 재사용:
- pgvector는 통합 Supabase 프로젝트(`xnomlgydifiqiybervtf`)에 이미 설치돼 있다(myfavorite `content_chunks`가 사용 중).
- 임베딩 모델은 myfavorite과 동일하게 **Voyage `voyage-3-large`, 1024차원**으로 통일한다. 참조 구현: myfavorite `lib/voyage.ts`, `supabase/migrations/0003_match_chunks.sql`.
- Claude 호출 패턴은 gocheok `api/index.ts`의 기존 `generateNiv()`가 참고 예시(같은 `ANTHROPIC_API_KEY`, 같은 fetch 패턴).

### 신규 준비물
- gocheok Supabase 프로젝트에 **`VOYAGE_API_KEY`** 시크릿 추가(현재 없음). 값은 myfavorite `.env.local`의 것을 사용.

## 데이터 모델

### 신규 테이블 `sermon_chunks`
- `id` (uuid, pk)
- `sermon_id` (text, → sermons.id)
- `chunk_index` (int)
- `content` (text) — 임베딩 원문
- `embedding` (extensions.vector(1024))
- 메타(검색 결과 표시·인용용, 조인 없이 바로 쓰도록 비정규화): `title`, `svc_date`, `scripture`, `youtube_id`
- HNSW 인덱스 (myfavorite `content_chunks` 패턴)
- **RLS deny-all** — service_role(Edge Function)만 접근. 교인 identity 로그인은 anon 키를 쓰므로 절대 노출 금지.

### 신규 RPC `match_sermon_chunks`
- myfavorite `match_content_chunks` 복제: `query_embedding vector(1024)`, `match_count int` → 유사도순 반환.
- `set search_path = public, extensions` 고정, SECURITY DEFINER 미사용(service_role 전용), execute를 service_role로 제한.

### 청킹 전략
- 설교 1건당: `summary`(1청크), 각 `point`(heading+body, point당 1청크), 각 `daily_meditation`(heading+message, 항목당 1청크)로 분리.
- 각 청크 `content` 앞에 `[제목 — 소제목]` 헤더를 붙여 검색·인용 시 맥락이 남게 한다(myfavorite ingest 패턴). 임베딩 전 Claude에 넘기는 게 아니라 그대로 저장.

## 백엔드 액션 (gocheok `api/index.ts`에 추가)

두 액션 모두 `adminError(b)`로 보호(첫 줄에서 검사, 실패 시 즉시 반환).

### `embedSermons` (관리자, 재색인용)
- body: `{ pw }` (+ 선택 `{ sermonId }`로 단건 재색인)
- 대상 설교를 조회 → 위 청킹 전략으로 청크 생성 → Voyage 임베딩(`input_type: "document"`) → `sermon_chunks`에 upsert.
- 멱등: 재실행 시 해당 sermon_id의 기존 청크를 지우고 다시 넣는다(설교 내용이 수정될 수 있으므로).
- 반환: `{ ok, sermons: n, chunks: m }`.
- 배치: Voyage 호출은 청크 배열을 적당한 크기로 나눠 호출(호출부 책임).

### `sermonChat` (관리자)
- body: `{ pw, message }`
- 질문 임베딩(`input_type: "query"`) → `match_sermon_chunks(embedding, k)` 검색(k=5 기본).
- 검색 결과가 임계값 미만이거나 비면 → "그 주제로 하신 설교를 찾지 못했습니다" 반환(Claude 호출 없이).
- 검색된 청크 + 메타를 시스템 프롬프트에 넣어 Claude 호출. 시스템 프롬프트 핵심 지침:
  - 너는 설교 검색 도우미다. 아래 제공된 설교 발췌 내용만 근거로 답하라.
  - 발췌에 없는 내용을 지어내지 말라. 목사의 새로운 주장을 창작하지 말라.
  - 출처를 "차동혁 목사님은 [날짜] '[제목]' 설교에서…" 형태로 밝혀라.
- 반환: `{ ok, answer, sources: [{ title, svc_date, scripture, youtube_id }] }`.

## 프론트엔드 (관리자 UI)

- `admin.html`의 `TOOLS` 배열에 한 줄 추가(예: "🔎 설교 물어보기(베타)") → 신규 페이지 `admin-sermon-chat.html`.
- 페이지 구성: 허브에서 넘어온 `admin-pw`(sessionStorage) 사용, 질문 입력창 + 답변 영역 + 출처(유튜브 링크) 표시. "🔄 색인 다시 만들기" 버튼(=`embedSermons` 호출)도 이 페이지에 둔다.
- 답변 하단 고정 안내문: "이 답변은 설교 아카이브를 검색한 AI 요약입니다. 정확한 내용은 원 설교를 확인하세요."

## 답변 형식(예)

```
차동혁 목사님은 2026-07-19 '주 안에서, 주께 하듯' 설교(골로새서 3:18-25)에서
이렇게 말씀하셨습니다: "무슨 일을 하든지 마음을 다하여 주께 하듯 하라 …"

📺 이 설교 듣기: https://youtube.com/watch?v=SqMbhfxvLDc

※ 이 답변은 설교 아카이브를 검색한 AI 요약입니다. 정확한 내용은 원 설교를 확인하세요.
```

## 배포

- 백엔드: `supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf`
- 마이그레이션(신규 테이블+RPC): SQL 파일로 관리, 공유 DB에 적용.
- 프론트: gocheok 배포 규칙 따름(app.js/새 html 변경 시 index.html `?v=` 캐시태그 갱신, 스플래시 `.splash-ver` +0.001) — 단, 이번 변경은 admin 페이지 위주라 해당되는 파일만.
- `VOYAGE_API_KEY` 시크릿 등록 후 `embedSermons` 1회 실행해 초기 색인 생성.

## 오늘 범위에서 제외 (YAGNI)
- 교인용(비관리자) 노출 — 반응 본 뒤 결정.
- 작년 이전 설교 — 우선 올해 39개.
- 대화 이력 저장 — 관리자 테스트용 단발 Q&A로 시작.

## 승인
사용자 승인 완료 (2026-07-23). 다음 단계: 구현 계획(writing-plans) 작성.
