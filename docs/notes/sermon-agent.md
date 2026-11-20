# 💬 「내게 주시는 말씀」 AI 에이전트(2026-11 · **모두에게 열림** — 문 `scAgent` = `"on"` · NEW `FEAT_SINCE.scAgent`)

> **언제 읽나:** `supabase/functions/api/sermon-agent.ts` · 액션 `sermonAgent` · `js/sc-agent.js` · `app.js` 의 `scAsk` 갈래 · `scAgentCached`/`refreshScAgent` ·
> `supabase/sermon_agent.sql`(`verse_embed` · `sermon_agent_run` · `match_verse_embed`) · `sermon_ai_cache` 의 `kind:"agent"` · 문 `scAgent` 를 손댈 때. 그리고 **문을 여는 날 · AI 를 부르는 시험을 돌리기 전**.
> 설계 `docs/superpowers/specs/2026-11-20-sermon-agent-design.md`(친구 2026-11-20) · 계획은 같은 날짜의 `docs/superpowers/plans/` 파일.

## 무엇
고민이나 궁금한 것을 적으면 AI 가 **스스로 찾을 말을 정해** 설교와 앱의 암송 구절을 찾아 보고, 답과 함께 「이렇게 해 보세요」를 내민다 —
📖 외워 볼 말씀 1~2장(**바로 외워 보기**) · 🎧 들어 볼 설교 1장(**3분 요약 듣기** · 영상) · 되묻기 단추 최대 3개 · 두 번째 되묻기 답에는 없음(한 질문에 2번까지).
AI 가 하는 일을 **실제로 하는 그때** 단계 줄로 보여 준다(「」 안은 AI 가 도구에 실제로 넘긴 찾을 말 — 정해 둔 문구를 시간 맞춰 띄우지 않는다). 답이 오면 「AI가 한 일 N가지 ▾」로 접힌다.
하지 않는 것: 카드 · 기도문 쓰기 · 알림 예약 · 글로 이어 묻기 · 성도님 기록 · 이름 · 소속을 AI 에 보내기(다음 단계 「암송 코치」의 몫).

## 어디에 무엇이
| 자리 | 파일 · 이름 |
|---|---|
| 서버 | `supabase/functions/api/sermon-agent.ts` — `sermonAgentStream(body, AGENT_DEPS)` · 순수 `AGENT_LIMITS` · `ndjsonLine` · `agentTracksFor` · `sanitizeAgentAnswer` · `scAgentGate` · `agentFinalChoice` · `agentUserText` · index.ts 를 들여오지 않는다(필요한 것은 `AgentDeps` 로 받는다 — 형의 `"db"` 칸은 따옴표로 · `tests/api-split.test.cjs` ⑤) |
| 들머리 | `index.ts` `switch (body.action)` 의 **첫 갈래** — `case "sermonAgent": return await sermonAgentStream(body, AGENT_DEPS);`(user_merges 바꿈 · 기계 키 갈래 **뒤** · `json()` 이 아니라 흘려보내는 `Response` 를 그대로 · `case` 라 배포 가드 `tools/deploy-fn.py` 가 센다) |
| 옛 길 | `sermonChat` — **손대지 않는다**(문이 닫힌 분 · 되돌림 길) |
| 화면 | `js/sc-agent.js`(지연 · `LAZY_JS.scAgent` · `docs/notes/lazy-load.md`) — `scAgentAsk` · `scAgentRender` · `scAgentState` · `scAgentOpenVerse` · 순수 `scAgentParseChunk` 등 · CSS 머리 `.scg-`(어두운 모드 짝 `.dark` 함께) · ⚠️ 맨 위 이름은 `scAgent`/`SCG_` 머리(app.js 와 겹치면 받는 순간 SyntaxError) · `boardEsc` 는 따옴표를 안 바꾸니 AI · 서버 글은 속성(`data-…="…"`)에 넣지 않는다(속성에는 번호만 — 시험이 본다) |
| 갈래 | `app.js` `scAsk` — 문(`scAgentVisible`)이 열렸으면 `loadLazyJs("scAgent")` 뒤 `scAgentAsk(message)` · 받기 실패 · 첫 질문에 답이 없으면(fallback · 통신 실패 · 빈 답) 지금 길 `scAskClassic`(sermonChat) · 출처 줄은 `scSourcesHtml`(둘이 같이 씀) · 받는 줄은 `js/api.js` `supaStream`(60초 끊기) · 「바로 외워 보기」로 연 구절의 뒤로는 `scAgentBackTo`(주간 `renderTestScreen` · `js/navi.js` · `js/psalm.js` 두 곳 — 첫 화면 · 말씀 목록에 가면 잊는다) · 미리보기 `?scagent=1`(이 기기 화면만) |
| 표 | `supabase/sermon_agent.sql` — `verse_embed` · `sermon_agent_run` · RPC `match_verse_embed` |
| 시험 | `tests/sermon-agent.test.cjs`(꾸러미 없음 · preflight `PURE_TESTS`) · `tests/sermon-agent-smoke.py`(개발만 · AI 를 부른다 — 아래 「시험」) |

## 문(세 값) — app_config `scAgent`
- 빈 값 · `null` · 그 밖 = **닫힘** · `"test"` = 🧪 시험 참여자(`ministryTesters` — 화면 `ministryTesterCached` · 서버 `ministryIsTester`) · `"on"` = 모두.
- 화면과 서버가 같은 규칙으로 문을 본다(서버 `scAgentGate(value, isTester)` · 화면 `scAgentVisible`). 서버는 문을 **맨 먼저** 본다 — 닫혔으면 사람 · 기록 · 캐시를 보기 전에 `{"t":"fallback"}` 한 줄 → 화면이 `sermonChat` 으로 다시 묻는다.
- 공개 설정 키(`PUBLIC_CONFIG_KEYS`)에 `scAgent` 가 있다. 화면은 받아 둔 값(`localStorage` `"scAgent:v1"`)을 본다 — 문을 바꾼 날 성도님은 앱을 한 번 닫았다 열어야 바뀐다.
- 여닫기는 운영 `app_config` 한 줄(코드 배포 없음 · 친구 확인 뒤 · 스킬 `gated-feature` ⑤4 의 link 폴더 SQL):
  `insert into app_config(key, value) values ('scAgent', '"test"'::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now();` (닫기 `'null'` · 모두 `'"on"'`)
- 어린 부서도 같다(지금 「내게 주시는 말씀」이 모두에게 열려 있고, 새로 모으거나 AI 에 보내는 개인 정보가 없다).
- NEW 배지는 아직 없다 — `"on"` 으로 열 때 새 키 `FEAT_SINCE.scAgent` 를 더하고 `newestNewFeat` 에서 문이 열린 분께만 보이게 거른다(계획 Task 11 Step 19). ⚠️ 옛 키 `sermon` 은 다시 쓰지 않는다 — 2026-07 부터 「💬」 를 눌러 본 분께는 영영 안 뜬다.

## 흘려보내는 줄(NDJSON · `application/x-ndjson`)
| 줄 | 꼴 |
|---|---|
| 단계 | `{t:"step", id, kind:"sermon"\|"verse"\|"write"\|"cache", q?, state:"start"\|"done"\|"fail", n?}` — 도구를 부르기 **직전**(start) · 결과 **직후**(done · n) · 「답을 쓰는 중」(write)은 두 찾기를 다 했거나 마지막 차례일 때 그 AI 부름 직전 · 그보다 일찍 답이 오면 답 직전 · 저장된 답이면 cache 한 줄 |
| 답 | `{t:"answer", answer, sources, verses:[{no,track,ref,text,why}], sermon\|null, chips, turn, cached?, limited?}` — 늘 마지막 줄 · `sources` 는 `sermonChat` 꼴 그대로 · `sermon` 은 그 한 칸 꼴(title · svc_date · scripture · youtube_id · preacher · summary) + `sermon_id` + `why` |
| 되돌림 | `{t:"fallback", reason}` — 문 닫힘 · 답이 비었음 · 상한을 넘고도 답이 없음 · 그 밖에 입력 · 인증 문제(`message-required` · `unauthorized` · `bad-follow` · `no-key` · `error`) |
| 요청 | `{action:"sermonAgent", user_id, message, follow?:{chip, prev_verses, prev_sermon, turn:1\|2}}` |

## 도구 셋 · 상한
- `search_sermons({query})` — 설교 검색 그대로(Voyage 임베딩 → `match_sermon_chunks` 5개 → 유사도 0.4 이상).
- `find_verses({topic})` — `verse_embed` 와 견줌(`match_verse_embed` · 상위 6) · **그 성도님께 보이는 구절만**(`agentTracksFor` · `agentVisibleVerses` — 앱이 보낸 값은 믿지 않는다): 주간은 날짜가 비었거나 오늘(한국) 이전 · 주제별은 `naviPublic === true` 또는 🧪 시험 참여자 · 쉴만한 물가는 `psalm.ts` `getPsalmVerses()` 가 돌려준 열린 편만 ·
  임베딩이 없거나 본문 해시가 다른 구절은 **찾기 직전에 그것만** Voyage 로 채운다(새 주간 구절이 들어온 첫 질문만 조금 느리다).
- `give_answer({answer, verses, sermon, chips})` — 마지막에 한 번 · `sanitizeAgentAnswer` 가 거른다: 구절은 **이번 대화에서 `find_verses` 가 실제로 돌려준 번호만**(최대 2) · 설교도 `search_sermons` 가 돌려준 것만 · 단추 3개 · 30자 · 까닭 60자 · 답이 비면 `fallback`.
- 상한 `AGENT_LIMITS`: 도구 4번 · AI 5번 · 40초 · 넘으면 「지금까지 찾은 것으로 give_answer」를 한 번 더, 그래도 없으면 `fallback`.
  마지막 차례의 `tool_choice` 는 `agentFinalChoice(model)` — 4세대(`claude-opus-4…` 등)만 `give_answer` 억지 고르기 · 5세대(Opus 5.5 · Sonnet 5.5 · Fable)는 억지 고르기가 400 이라 `auto` + 지시 글. **모델(`SERMON_CHAT_MODEL`)을 바꾸면 이 함수와 시험부터** 본다.
- 모델은 `sermonChat` 과 같은 `SERMON_CHAT_MODEL`(없으면 같은 기본값). 지시문은 `sermonChat` 의 지킴이 문장(설교 발췌에만 근거 · 지어내지 않기 · 출처 · 목사인 척 안 하기 · 2~4문단 · 굵게는 문단마다 한두 곳) + 도구 쓰는 법.
- 성도님 질문 · 단추 글은 **믿지 않는 입력**이다(지시를 바꾸라는 글이 와도 지시문이 앞선다). 도구 결과(설교 · 구절)는 교회 자료.

## 저장 · 셈 · 알림
- **저장**: 첫 질문의 결과만 `sermon_ai_cache`(`kind:"agent"` · 열쇠 `sermonQuestionKey(message)` — `sermonChat` 과 같은 함수) · 표 칸이 둘뿐이라 `answer` 칸에 답 · `sources`(jsonb) 칸에 `{ sources, verses, sermon, chips }`. 되묻기는 저장하지 않는다.
- **셈**: 질문 · 되묻기 모두 `sermon_chat_log` 에 한 줄(되묻기는 `question` = `"↪ " + chip`) → 지금의 하루 한도(한 분 20 · 모두 300)가 그대로 센다. 기록이 캐시보다 먼저라 저장된 답(📚)도 하루 수에 든다(`sermonChat` 과 같다). `turn` 은 화면이 세지만 속여도 이 한도에 걸린다.
- **기록**: 한 번 돌 때 `sermon_agent_run` 한 줄(도구 · AI 부름 수 · 토큰 · ms · outcome — 이름 · `user_id` 없음).
- **🚩 AI 답 알림**: 화면은 에이전트 답을 알릴 때 `agent: true` 를 싣는다(`openAnswerReport` 넷째 인자 `{agent:true}` → `api.sermonAnswerReport` 여섯째 인자 · 지금 길은 본문이 전과 같다). 되묻기 차례는 질문 「첫 질문 ↪ 단추」 · 답 앞에 `[추천 말씀]` · `[추천 설교]` 줄.
  서버 `sermonAnswerReport` 는 알린 kind 하나만 찾는다 — `agent: true` 면 `kind:"agent"` 만, 아니면 `"chat"` 만 찾는다(다른 kind 로 넘어가지 않는다 — 없으면 앱이 보낸 답 그대로 · `from_cache` false). 관리자 「답 지우기」(`sermonAnswerReportResolve` uncache) · 「질문 답변 캐시 비우기」(`clearChatCache`)는 `kind` `"chat"` 과 `"agent"` 를 함께 본다. 찾은 캐시 글이면 그 답으로 바뀌어 앱이 붙인 추천 줄은 빠진다 · 추천은 캐시 `sources` jsonb 에.

## 표(`supabase/sermon_agent.sql` · 개발 → 운영 · `tools/sql-applied.py` 기록)
- `verse_embed(track, no, text_hash, embedding vector(1024), updated_at)` — 기본 열쇠 `(track, no)` · `voyage-3-large` 1024 차원(설교와 같다).
- `sermon_agent_run(id, created_at, turn, tool_calls, ai_calls, in_tokens, out_tokens, ms, outcome)` — 이름 · `user_id` 없음 · 90일 보관(설계 §2-6).
- RPC `match_verse_embed(query_embedding, tracks, match_count)` — `verses` 와 잇고 `is_active` 만 · **definer 아님**(`match_sermon_chunks` 와 같은 꼴 · `set search_path = public, extensions` · 형 `extensions.vector(1024)`) · 실행은 service_role 만.
- 셋 다 RLS 켬 · `anon` · `authenticated` 권한 0 — 공개 키로 `GET /rest/v1/verse_embed` 를 하면 200 이 아니어야 한다.

## 개인정보
- AI(Anthropic)에 가는 것: 질문 글 · 누른 단추 글 · 설교 발췌 · 구절 본문. **이름 · 소속 · 암송 기록은 안 간다.** Voyage 에는 찾을 말과 구절 본문이 간다.
- 방침 `privacy/` 2항: Anthropic 줄(「입력한 질문 글」)은 그대로 · Voyage 줄은 「설교 · 구절 검색용」(계획 Task 10 · `tests/store-review.test.cjs` 가 지킨다 · 스토어 심사 중이면 심사 뒤에 고친다 — 모두에게 여는 것은 그 뒤).
- 앱 안 두 곳(`renderPrivacyInfo` 「답을 찾는 AI에 전달」 · `renderHelp` 「답을 만드는 AI로 전달」)은 Voyage 를 따로 적지 않아 그대로 사실이다 — 방침을 다시 고칠 때도 세 자리를 같은 커밋에(스킬 `copy-truth`).

## 시험
- 순수: `node --test tests/sermon-agent.test.cjs`(preflight 가 늘 돌린다) — 서버 구역 + 「화면 ·」 구역(줄 풀기 · `supaStream` 가짜 fetch · 단계 글 · 되묻기 · 🚩 글 · 이름 머리 · 속성 · 문 세 값 · 돌아갈 곳 · 배선 · `agent` 본문 · `.dark` 짝). 이름 겹침은 `tests/lazy-load.test.cjs` 도 본다.
- 개발 스모크: `set -a; . ./.env.dev; set +a; python tests/sermon-agent-smoke.py [--n 3] [--limit]` — 질문 10 · 되묻기 1 · 저장된 답 · 문 test(시험 참여자 아님)/닫힘 → fallback · 끝에 개발 문을 처음 값으로 되돌린다.
  ⚠️ **AI 를 실제로 부른다** — 에이전트 한 번 = Anthropic 2~5번 · 기본 22~55번 · `--n 3` 8~20번. **돌리기 전에 친구에게 수를 말하고 OK 를 받는다**(2026-10-16 사용 한도 일). 운영(`--prod`)은 거절한다.
- 운영은 AI 를 부르지 않는 확인만: `getConfig scAgent` 와 문 닫힌 `sermonAgent` 한 번(fallback 한 줄) — 계획 Task 11 Step 7.
- 스모크로 못 보는 것(도구 하나 실패 · 통째 실패 → `sermonChat` 되돌림 · 흘려받기 못 하는 기기)은 순수 시험과 실기기(아이폰 앱 · 플레이 앱 · 크롬)로 본다.

## 지켜보기(문 `"test"` 동안 · 1~2주)
운영 link 폴더에서 읽기만(계획 Task 11 Step 16 · 17 — 질의 파일은 저장소 밖):
```sql
select (created_at at time zone 'Asia/Seoul')::date as day, count(*) as runs,
       round(avg(tool_calls), 1) as avg_tools, round(avg(ai_calls), 1) as avg_ai, max(ai_calls) as max_ai,
       sum(in_tokens) as in_tok, sum(out_tokens) as out_tok, round(avg(ms) / 1000.0, 1) as avg_s
from public.sermon_agent_run where created_at >= now() - interval '14 days' group by 1 order by 1;
```
outcome 별 수 · 🚩 `sermon_answer_reports` 까닭별 처리 안 된 수 · `sermon_chat_log` 의 「↪ 」 되묻기 수도 함께 본다. `"on"` 은 친구가 정한다.

## ⚠️ 함정
1. **저장된 답(`kind:"agent"`)은 돌려줄 때 구절을 지금 보이는 묶음으로 다시 거른다.** 답을 저장한 뒤에 `naviPublic` · `psalmPublic` 이 바뀌었을 수 있다 —
   거르기를 빼면 닫힌 묶음의 구절이 「바로 외워 보기」로 나가 화면이 그 구절을 못 찾는다.
2. **앱이 보낸 앞 답 글은 믿지 않는다.** 되묻기에는 번호만(`prev_verses` · `prev_sermon`) 오고, 서버가 그 번호로 구절 본문 · 설교 제목을 다시 꺼내 「앞에서 이것을 권했다」로 넣는다.
   `follow` 에 앞 답 글 칸을 더하면 화면이 보낸 글을 「AI 가 했던 말」로 믿게 된다(지시 끼워 넣기 길).
3. **흘려받기가 안 되면 빈 화면이 아니라 옛 길.** 통째 실패(서버 오류 · `fallback` 줄 · 네트워크)는 `sermonChat` 으로 한 번 더 · 흘려받기를 못 하는 기기는 `supaStream` 이 `res.text()` 로 받아 한꺼번에 푼다(단계 줄만 늦고 답은 같다).
4. **`sermonAgent` 는 `switch` 의 첫 `case` 다**(`json()` 이 아니라 흘려보내는 `Response` 를 그대로 돌려준다). `switch` 앞 `if` 로 옮기지 말 것 — `tools/deploy-fn.py` 가 `case "…"` 이름을 세어 origin/main 과 견주므로, `if` 이면 낡은 나무로 올릴 때 이 액션이 **경고 없이 사라진다.** 운영에 올린 뒤에는 `getConfig scAgent` 와 문 닫힌 부름으로도 본다.
5. **시험 참여자에게만 열려 있어도 AI 비용은 진짜다.** 실기기 · 스모크 모두 부르기 전에 친구에게 수를 말한다.
6. 캐시 열쇠는 `sermonQuestionKey` 하나 — 바꾸면 🚩 알림이 알린 답을 캐시에서 못 찾고, 「답 지우기」가 엉뚱한 줄을 지운다.
7. 관리자 「질문 답변 캐시 비우기」(`clearChatCache`)는 `"chat"` 과 `"agent"` 를 함께 지운다.
8. **설교 발췌가 하나도 없으면(유사도 0.4 이상 0건) 답을 바꿔 친다**(순수 `agentGroundAnswer`) — 답은 `sermonChat` 과 같은 문장 「그 주제로 하신 설교를 찾지 못했습니다.」, `sermon` 은 null, 📖 구절 카드와 되묻기 단추는 그대로(친구 2026-11-20) · **저장하지 않는다.** 도구가 하나라도 실패한 돌림의 답도 저장하지 않는다. 되묻기 차례가 스스로 설교를 못 찾아도 같은 문장이 뜬다.
9. `sermon_agent_run.outcome` 에 `"cancelled"` 가 있다(화면이 끊음 → `ReadableStream` cancel → 돌림이 차례 맨 앞에서 멈춤). 「새로 물어보기」는 흐르는 줄을 끊는다(바깥 `AbortSignal` → `supaStream`) · 스크린리더 칸은 고정 요소 `#scg-live`.
10. ⚠️ `sermon_agent_run.outcome` 값은 아홉이다: `answer` · `cache` · `limited` · `ai-error` · `refusal` · `max-tokens` · `no-answer` · `empty-answer` · `cancelled`. SQL 칸 주석은 `cancelled` 를 빠뜨렸는데, 주석 때문에 SQL 파일을 고치면 `sql-applied` 가 다르다고 찍으니 그대로 둔다.
11. ⚠️ 개발 스모크 `tests/sermon-agent-smoke.py` 는 `ADMIN_SECRET` 과 `SMOKE_SUPER` 가 필요하다 — 주 체크아웃에서 `set -a; . ./.env.dev; set +a` 로 불러온 뒤 돌린다(문을 saveConfig 로 여닫기 때문).
12. ⚠️ `AGENT_SYSTEM` 의 규칙 줄은 `sermonChat` 의 것과 글자 하나 다르지 않아야 한다 — 시험 ⑨ 가 두 쪽을 견준다.
13. ⚠️ 기본 모델은 `sermonChat` 기본값(`claude-opus-4-8`, 4세대)이다(`SERMON_CHAT_MODEL` 이 없을 때) — 그래서 운영에서는 `agentFinalChoice` 의 억지 `give_answer` 길이 돈다. 비밀값을 5세대 모델로 바꾸면 그 길이 바뀐다.
14. ⚠️ 캐시된 답은 하루 한도 검사 전에 돌려준다(`sermonChat` 과 같다) — 한도에 걸린 성도도 캐시된 답은 받는다.
15. ⚠️ 끊김 검사는 AI 차례 맨 위(`deps.cancelled`)에서만 한다 — 도는 차례가 이미 받은 도구 부름(첫 구절 임베딩 채우기 포함)은 화면을 떠난 뒤에도 끝까지 간다.


## 시험의 한계(개발)
개발 DB 에는 설교가 없어 개발 스모크의 답은 모두 위 「설교를 찾지 못했습니다」 문장이고 저장되지 않는다 — **저장된 답 길과 하루 한도는 개발 스모크로 못 본다.** 저장된 답은 운영 문 `"test"` 에서 확인한다.

## 운영 사실(2026-11-20)
SQL 운영 적용(`vector` 는 `extensions` 스키마) · `api` 배포(v3.735) · 문 `"test"`. 첫 운영 질문이 구절 임베딩을 채운다(몇 초).

## ⚠️ 문을 `"on"`(모두)으로 열기 전에 할 것
- 끊은 뒤 도구 부름 멈추기 — 지금은 돌던 AI 한 차례가 이미 돌려준 도구 부름은 끝까지 간다(한 줄 고치기 · 알려진 틈).
- 화면에서 흐르는 중에 나갔다가 다시 물으면 최대 약 55초 동안 무시된다.
- `sermon_agent_run` 으로 질문 한 번당 비용을 잰다.
- 고정 시스템 지시문 + 도구 정의에 프롬프트 캐시를 걸지 검토.
- 🚩 첫 차례 알림은 추천 말씀 · 설교 줄이 빠진다(친구 결정).
- 이미 있던 `supabase/sermon_ai_cache.sql` 에 `anon`/`authenticated` revoke 가 없다(이 기능 밖 · RLS 가 행을 막는다) — 따로 닫는다.

## 여는 날 기록
| 날 | 무엇 |
|---|---|
| 2026-11-20 | 문 `"test"` — 🧪 시험 참여자만(운영 app_config · v3.735) |
| 2026-11-20 | **모두에게 열림** — 문 `"on"`(v3.736 · 운영 api 배포). 프롬프트 캐시를 더했다(개발 확인: AI 3번 · 캐시 읽기 5580 / 쓰기 3281 · 캐시 안 된 입력 6) · 받는 중 취소하면 도구 부름도 멈춤 · 화면을 떠나면 흐르는 줄을 끊음(`scAgentLeave`) · `sermon_agent_run` 에 캐시 토큰 두 칸(`cache_read_tokens` · `cache_write_tokens` · `supabase/sermon_agent_cache_cols.sql` 운영 적용) · 닫으려면 `"test"` 나 빈 값 |
