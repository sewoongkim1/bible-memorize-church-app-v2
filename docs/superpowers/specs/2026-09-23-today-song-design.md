# 오늘의 찬양 — 매일 묵상 창·첫 화면에서 우리 교회 찬양 한 곡 (설계)

**날짜**: 2026-09-23
**배경**: 친구 요청 — 「첫 팝업의 **쉴만한 물가 아래**에 단추를 두고 유튜브와 연결해 매일 새로운 찬양을 잇고 싶다」.
「첫 팝업」은 매일 묵상 창(`showMeditationModal`)이고, 그 카드 맨 아래 `🐑 쉴만한 물가 · 시 23:1`(`.med-psalm-cta`)
바로 아래 자리다.

**한 줄 요약**: 서버가 **오늘 한 곡**을 정해 주고, 앱은 그 곡명을 단추에 보여 주며, 누르면
**찬양 아카이브(worship.onlybible.kr)의 그 곡**이 열린다.

---

## 친구가 정한 것 (2026-09-23 대화)

- 곡은 **교회 아카이브에서 자동으로** 고른다(담당자가 매일 채워 넣지 않는다).
- **찬양대·중창단·특송(특별찬양)** 만. **찬양팀은 뺀다.**
- 하루 한 곡을 **골고루 섞어** 돌린다(모두가 같은 날 같은 곡).
- 단추 이름은 **「🎵 찬양 · 곡명」**(「오늘의 찬양」은 길어 보인다).
- 진입점은 **묵상 창 + 첫 화면 둘 다**.
- 재생은 **찬양 아카이브 앱에서** 한다.
- 게이트를 끈 채 만들고 **9/27 플레이스토어 승인 뒤에 켠다.**

### ⚠️ 재생 자리를 한 번 바꿨다 — 그 이유를 남긴다

처음에는 **「암송 앱 안에서 유튜브를 직접 재생」**으로 정했다가 **「찬양 앱으로 보내기」**로 바꿨다.
바꾼 근거가 넷이고, 넷 다 처음 정할 때는 몰랐던 것이다. **다시 앱 안 재생으로 돌리기 전에 이 넷을 먼저 볼 것.**

1. **찬양 앱에 이미 완성된 플레이어가 있다** — `praise-songs/app.js:416~581`:
   유튜브 IFrame API(429) · **화면 깨우기**(`reqWake`, 434) · **잠금화면 재생 컨트롤**(MediaSession
   메타데이터 + play/pause/next/prev, 461~471) · 자동 다음곡(`onEnded`) · 셔플 · 반복.
   암송 앱 안에 만들면 **그것을 두 번째로 짓는 것**이고, 이 저장소에는 iframe 전례가 **0건**이다.
   반면 찬양 앱은 `URLSearchParams` 를 한 번도 안 쓴다 — 딥링크는 **10여 줄**이다.
2. **앱 안 임베드는 개인정보 방침과 스토어 신고 정정을 강제한다.** 지금까지 이 앱의 유튜브는 **전부**
   `window.open("_blank")` 였다(app.js:3149 설교 보기, app.js:2165 찬양 아카이브) — 성도님이 **스스로**
   앱 밖으로 나가신 것이라 방침에 적을 일이 없었다. 임베드는 화면이 뜨는 순간 IP·기기 정보가 구글로 간다.
   `privacy/index.html` 표에는 구글이 없고 `store/README.md` 는 애플에 「추적 아니오」로 신고해 두었다.
3. **보호자 재동의를 할 방법이 없다.** 이 앱은 교회학교 부서·학년으로 로그인한다(app.js:47).
   방침 6항은 「만 14세 미만은 보호자 동의를 받고 사용해 주세요」인데, **문구를 고쳐도 이미 로그인해
   계신 아이들의 보호자는 새 문구를 다시 읽지도 동의하지도 않는다.** 문구 수정은 소급되지 않는다.
4. **「앱을 잃어버리지 않는다」가 절반만 남는다.** `rel=0`(2018년부터 「같은 채널로 한정」일 뿐이다)·
   `fs=0`·「끝나면 우리 화면으로 덮기」를 다 해도, **일시정지하면 추천 격자가 뜨고 영상 제목이나
   유튜브 로고를 누르면 유튜브로 나간다** — 우리가 색을 줄 수 없는 유튜브 자체 UI라 막을 방법이 없다.

**대신 잃는 것**(정직하게 적어 둔다): **아이폰 앱에서는 사파리로 나간다.** Capacitor 가 앱 주소가 아닌
최상위 이동을 가로채 `UIApplication.shared.open` 으로 넘긴다(`WebViewDelegationHandler.swift:113-121, 314-319`).
안드로이드 TWA 는 주소창 달린 탭으로 열려 뒤로가기로 돌아오고, 사파리·크롬은 새 탭이다.
웹뷰 안에서 열게 하려면 `allowNavigation` 을 넣은 **아이폰 새 빌드**가 필요한데 지금 Mac 이 막혀 있다.

---

## ① 성도님이 보시는 것

### 진입점 둘

**(1) 매일 묵상 창 맨 아래** — 기존 시편 CTA 바로 아래 한 줄(`.med-song-cta`).

```
┌─ 🌿 오늘의 묵상 ────────────────┐
│  …묵상 본문…                    │
│  [설교] [요약]        [확인]     │
│  🐑 쉴만한 물가 · 시 23:1        │
│  🎵 찬양 · 나 드리리  ↗          │  ← 새로 생기는 줄
└────────────────────────────────┘
```

**(2) 첫 화면 「함께」 묶음** — `🐑 쉴만한 물가` 아래, `🙏 가정 축복 기도문` 위
(`.summary-help#open-song`, 글자는 `🎵 찬양 · 나 드리리 <span class="ext-mark">↗</span>`).

> ⚠️ **왜 첫 화면에도 두는가.** 묵상 카드는 `max-height:85vh; overflow-y:auto`(style.css:335)로
> **카드 안쪽이 따로 스크롤**된다. 요일 탭 7개 + 제목 + 본문 + 💬 적용 질문 + 단추 셋 + 시편 CTA 뒤에
> 붙으므로 짧은 폰·큰 글씨에서는 접힌 아래로 내려간다. 어르신은 팝업 **안쪽**이 따로 스크롤된다는 것을
> 모르신다(화면 전체를 쓸어내리면 카드는 그대로다).

> ⚠️ **첫 화면은 프리페치를 안 한다 — 곡명은 나중에 채운다.** `renderSummary` 는 한 번에 그리는데
> `getTodaySong` 은 왕복이 필요하다. 이미 있는 본보기를 그대로 따른다 — `renderEventButton()`(캐시가 있으면
> 즉시) + `loadEventState()`(받아서 다시 그림)(app.js:2151-2152), `fillBoardBadge()`.
> - 오늘치를 `localStorage` 에 **한국 날짜 열쇠**로 캐시한다(`song-YYYY-MM-DD`). 하루 한 곡이고 모두가
>   같은 곡이라 어긋날 일이 없다.
> - 캐시가 오늘 것이면 `🎵 찬양 · 나 드리리 ↗` 로 **즉시** 그린다.
> - 없으면 `🎵 찬양 ↗` 만 그렸다가 받아서 곡명을 채운다. ⚠️ **단추를 나중에 생기게 하지 않는다** —
>   묶음 안에서 줄이 하나 늘면 성도님이 누르려던 자리가 밀린다.
> - **부르는 쪽은 첫 화면 하나뿐이다.** ⚠️ 첫 화면(`renderSummary`)이 **먼저** 그려지고 묵상 팝업은
>   그 뒤에 뜬다(app.js:6289). 묵상 창 프리페치는 **캐시가 오늘 것이면 안 부른다** — 안 그러면 성도님
>   한 분당 왕복이 매일 둘이 되어, 이 저장소가 한 번 크게 데인 첫 실행 속도를 스스로 깎는다(글꼴 765KB).

### 누르면

`window.open("https://worship.onlybible.kr/?song=" + id, "_blank", "noopener")` 한 줄.
(app.js:2165 의 찬양 아카이브 단추와 **같은 꼴**이다.)

### 색 · 문구

**색은 네 단계 밖으로 나가지 않는다.** 이 단추는 **「더 보기」의 아카이브 둘과 똑같은 옷**이다 —
`.summary-help` 기본(청색 선·청색 글) + `<span class="ext-mark">↗</span>`.

> ⚠️ **`.ext-cta`(흰 바탕 회색선)를 쓰지 않는다.** 2026-09-10 에 **성도님이 「모두 동일하게」로 정하셔서**
> 아카이브 둘에서 그 클래스를 뗐고, 「앱 밖으로 나감」은 **↗ 혼자** 말한다(app.js:2119-2128 ·
> style.css:4161-4164 주석이 「지금은 아무도 안 쓴다 · 되돌릴 때 쓰라고 규칙만 남긴다」고 못 박고 있다).
> ⚠️ 그리고 `.ext-cta` 의 실제 선택자는 **`.summary-help.ext-cta`** 라, 묵상 창 단추에 `class="ext-cta"` 만
> 달면 아무 스타일도 안 붙는다.
> ⚠️ `docs/notes/home-screen.md` ④⑤ 는 그 결정 **이전** 상태로 남아 있다(노트가 낡았다). **코드가 맞다.**

- 첫 화면에 `🎵` 가 둘이 된다(`#open-praise` 고척교회 찬양 아카이브). ⚠️ **색으로는 안 갈린다 — 둘 다
  같은 옷이다.** 다만 아카이브 단추는 접힌 `<div id="more-box" hidden>` 안이라 **나란히 보이지는 않는다.**
- 곡명 **말줄임은 안 한다(두 줄 허용)**. ⚠️ 바로 위 `.med-psalm-cta` 가 **일부러** `white-space:nowrap` 을
  안 쓴다 — 「잘리게 두느니 두 줄이 낫다」가 CSS 주석에 못 박힌 결정이다. 나란히 선 두 줄이 서로 다른
  규칙을 따르면 안 된다.
  (스냅샷 `praise.json` 기준 가장 긴 곡명이 31자 — `주의 친절한 팔에 안기세 / 곤한 내 영혼 편히 쉴 곳과`.
  ⚠️ **운영 실측이 아니다.** 320px · 아주 큰 글씨 · 요일 탭 켠 상태에서 눈으로 잰다.)
- 이 창의 escape 헬퍼는 **`psalmEsc`**(`& < > "` 만 치환). ⚠️ `boardEsc` 는 `\n → <br>` 을 하므로 단추에는 안 쓴다.

---

## ② 찬양 앱 쪽 — `?song=<id>` 딥링크 (형제 저장소 `c:\Projects\praise-songs`)

`init()`(app.js:704)에서 곡을 다 받은 뒤 한 번 본다.

```js
const wanted = new URLSearchParams(location.search).get("song");
if (wanted) {
  const i = ALL.findIndex((s) => s.id === wanted);          // 필터된 VIEW 가 아니라 전체에서 찾는다
  if (i >= 0) openPlayer(i, [ALL[i]]);                      // 큐는 그 한 곡만
}
```

- **큐에 그 한 곡만 넣는다.** `openPlayer(i, queueArr)` 는 `activeQueue` 를 그대로 쓰고, 곡이 하나면
  `updateNav()` 가 이전·다음을 잠그고 `onEnded` 도 아무것도 안 한다 — **끝나면 조용히 멈춘다.**
  더 듣고 싶으신 분은 플레이어를 닫으면 그 앱의 목록이 바로 있다.
- **못 찾으면 아무것도 안 한다**(그냥 홈이 보인다). 담당자가 그 곡을 숨겼거나 지웠을 때다.
- ⚠️ `VIEW` 는 화면 필터가 걸린 목록이라 **거기서 찾으면 안 된다.**
- ⚠️ **자동재생.** `openPlayer` 는 `autoplay: 1` 로 연다(app.js:526). 카드를 눌러 여는 기존 경로는 탭이
  바로 앞에 있지만, **딥링크는 새 탭이 갓 뜬 상태**라 브라우저가 소리 있는 자동재생을 막을 수 있다.
  그때는 플레이어 안의 ▶ 를 한 번 누르시면 된다 — **확인 항목에 넣는다**(→ ⑤).
- ⚠️ 찬양 앱은 `logPlay` 를 이미 부른다(app.js:511) — **쓰임은 그쪽에 저절로 쌓인다.**
- ⚠️ 이 저장소가 아니라 **형제 저장소를 고치는 것**이다. 그쪽 CLAUDE.md 의 규칙(NFC 통일·
  `praise.json` 과 `public/praise.json` 동기화·캐시 태그)을 따른다. 배포도 그쪽에서 따로 한다.

---

## ③ 오늘 곡 고르기 (서버)

### 표 — `daily_song` · `song_click_log`

```sql
create table if not exists public.daily_song (
  day        date primary key,                 -- 한국 날짜 (기본값을 두지 않는다 — UTC 로 박힌다)
  song_id    text not null,                    -- 유튜브 영상 id (= songs.id)
  created_at timestamptz not null default now()
);
alter table public.daily_song enable row level security;      -- ⚠️ 만드는 그 자리에서
revoke all on table public.daily_song from anon, authenticated;

create table if not exists public.song_click_log (
  user_id uuid not null references users(id) on delete cascade,
  day     date not null,
  song_id text not null,
  primary key (user_id, day, song_id)
);
alter table public.song_click_log enable row level security;   -- ⚠️ 여기도 그 자리에서
revoke all on table public.song_click_log from anon, authenticated;
```

> ⚠️ **`song_id` 에 `references songs(id)` 를 걸지 않는다.** 걸면 찬양 담당자의 곡 삭제가 막혀
> **남의 앱 관리 화면이 고장난다.** 「songs 는 읽기만 한다」는 약속이 FK 로 깨진다.
> ⚠️ **표를 만들면 그 자리에서 RLS 를 켠다.** `event_entries` 가 이 한 줄을 빠뜨려 `user_id` 47건이
> 공개 키로 읽혔다(CLAUDE.md 보안 절).
> ⚠️ **`song_click_log` 를 지금 함께 만든다.** 쓰임은 2주 뒤에 재지만(`docs/notes/metrics.md` 관행),
> **그때 붙이면 그때부터 0부터 쌓인다.** 표를 만드는 지금이 가장 싸고, 나중에 급히 붙이는 것이
> 바로 `event_entries` 사고가 난 방식이다.

### 후보 풀 — 뷰 하나에 **한 곳**만

```sql
create or replace view public.v2_song_pool
with (security_invoker = on) as
  select s.id, s.song, s.choir, s.svc_date, s.duration, s.thumbnail
    from songs s
   where s.hidden = false
     and s.is_full = false
     and s.duration_sec between 1 and 720
     and normalize(btrim(s.song, '''" '), NFC) not in ('찬양', '찬양과 경배', '특송', '')
     and normalize(btrim(s.song), NFC)
         is distinct from normalize(btrim(coalesce(s.choir, '')), NFC)
     and normalize(btrim(s.category), NFC) in ('찬양대', '중창단', '특별찬양');

revoke all on public.v2_song_pool from anon, authenticated;
```

> ⚠️ **뷰는 RLS 대상이 아니다.** 만든 사람 권한으로 돌아 밑 표의 RLS 를 지나가고, `anon` 에게 SELECT 가
> 남아 있으면 PostgREST 가 그대로 내보낸다. **`revoke` + `security_invoker = on` 둘 다** 필요하다
> (CLAUDE.md 보안 절 · `supabase/security_close_public_views.sql`).
> **돌린 뒤 공개 키로 `GET /rest/v1/v2_song_pool?select=*&limit=1` 을 실제로 쏴서 행이 안 오는지 본다.**
> ⚠️ **거르는 조건은 이 뷰 한 곳에만 둔다.** 두 곳에 베끼면 「허용 목록은 세 곳」 함정에 걸린다.

| 조건 | 왜 |
|---|---|
| `hidden = false` | 담당자가 내리기로 한 영상(잘못 올린 것·내려 달라는 요청·저작권) |
| `is_full = false` | 전체예배 통영상 |
| `duration_sec between 1 and 720` | ⚠️ `is_full` 은 **30분 이상일 때만 기본 '예'** 라(`admin-praise.html`) 12~29분 칸타타·통짜 영상이 `is_full=false` 로 남아 있다. **두 겹으로 거르는 이유가 이것이다.** `0` 도 함께 막는다 |
| 곡명이 `찬양`·`찬양과 경배`·`특송`·빈칸이 아님 | 따옴표를 벗긴 뒤 비교(운영에 `'찬양'` 처럼 따옴표가 붙은 자료가 있다) |
| 곡명 ≠ 찬양대 이름 | `시온찬양대` 처럼 곡명 자리에 단체 이름만 들어간 것 |
| `category in ('찬양대','중창단','특별찬양')` | 친구 결정(**찬양팀 제외**) |

> ⚠️⚠️ **`'기타'` 는 운영에 한 곡도 없다.** 초안이 참고한 `praise.json` 은 낡은 스냅샷이고,
> **2026-07-06 에 「기타」가 「특별찬양」으로 이름이 바뀌었다.** 그대로 넣었다면 친구가 넣기로 하신
> 특송이 통째로 빠지고 아무도 몰랐을 것이다.
> ⚠️ **이 목록의 주인은 이 저장소가 아니다.** 찬양 앱 담당자가 관리 화면에서 바꾼다. 또 바뀌면 오류 없이
> **곡 수만 줄어** 배포로도 테스트로도 성도님 제보로도 안 잡힌다. → **모든 문자열 비교에 `normalize(…, NFC)`**
> (2026-09-20 에 자모분리로 48곡이 조용히 빠졌다 · `docs/analysis/2026-09-20-praise-choir-nfc-nfd-duplicate.md`),
> 그리고 **`monitor` 가 후보 수를 매일 본다**(→ ⑤).
> ⚠️ **곡 수는 구현 직전에 `select count(*) from v2_song_pool` 로 센다.** 스냅샷 기준 숫자를 설계에 박지 않는다 —
> 초안의 「1,550곡」은 이미 틀렸다.

### 고르는 함수 — **LRU**

```sql
create or replace function public.v2_today_song(p_day date)
returns table (id text, song text, choir text, svc_date date, duration text, thumbnail text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  -- ① 오늘 행이 있으면 그것. 단 후보 조건을 다시 건다(담당자가 그 사이 숨겼을 수 있다)
  select d.song_id into v_id
    from daily_song d
   where d.day = p_day
     and exists (select 1 from v2_song_pool p where p.id = d.song_id);

  -- ② 없으면 뽑아서 적는다 — 한 번도 안 나온 곡 먼저(무작위), 없으면 가장 오래전에 나온 곡
  if v_id is null then
    insert into daily_song (day, song_id)
    select p_day, p.id
      from v2_song_pool p
      left join (select song_id, max(day) as last_day from daily_song group by 1) l
             on l.song_id = p.id
     order by l.last_day asc nulls first, random()
     limit 1
    on conflict (day) do nothing
    returning song_id into v_id;

    -- ③ 경쟁에서 졌으면(do nothing) 새 문장으로 다시 읽는다
    if v_id is null then
      select d.song_id into v_id from daily_song d where d.day = p_day;
    end if;
  end if;

  if v_id is null then return; end if;     -- 후보가 하나도 없다(개발 DB 등) → 0행

  return query
    select p.id, p.song, p.choir, p.svc_date, p.duration, p.thumbnail
      from v2_song_pool p where p.id = v_id;
end;
$$;

revoke all on function public.v2_today_song(date) from public, anon, authenticated;
grant execute on function public.v2_today_song(date) to service_role;
```

> ⚠️ **`revoke`/`grant` 두 줄을 같은 파일에 함께 적는다.** PostgreSQL 은 새 함수의 EXECUTE 를 **기본적으로
> PUBLIC 에 준다.** Supabase 에서 그 함수는 PostgREST 에 그대로 노출되어 **공개 키만 있으면 누구나**
> `POST /rest/v1/rpc/v2_today_song` 을 부른다. `security definer` 라 RLS 를 통째로 지나간다
> (`supabase/stats-rpc.sql:107` · `blessing_log.sql` 이 같은 규약을 쓴다).
> **표·뷰와 달리 함수는 Supabase 표 목록에 안 보인다** — 돌린 뒤 공개 키로 직접 쏴 거부되는지 확인한다.

> ⚠️⚠️ **초안의 「후보가 비면 `daily_song` 을 비우고 새 바퀴」를 없앴다. 다시 넣지 말 것.**
> - **무한 루프** — 비운 뒤에도 후보가 0이면 조건이 그대로다.
> - **전멸 삭제** — 후보가 0이 되는 길은 이론이 아니다(개발 DB 에 `songs` 없음 · 구분 이름 변경 · 대량 숨김).
> - **「0건」과 「실패」를 뭉갠다** — 이 저장소의 관행은 `if (!error) rows = data ?? []`(index.ts:766)라
>   **조회 한 번 실패 = 표 전체 삭제**가 된다. CLAUDE.md 에 「0건은 「없다」가 아닐 수 있다」가 이미 적혀 있다.
> - **하루에 곡이 둘이 된다** — 두 요청이 겹치면 A 가 넣은 오늘 행을 B 의 `delete` 가 날린다.
> - 그리고 그 분기는 **4년 반 뒤에야** 정상적으로 도는 사실상 죽은 코드인데 **오류 상황에서만 살아난다.**

> ⚠️ **LRU 를 「가장 이른 `day` 행」으로 쓰면 안 된다.** `daily_song` 은 행을 안 지우므로 가장 이른 행은
> **언제까지나 맨 처음 나간 곡의 행**이다 — 그러면 한 바퀴 돈 뒤부터 **같은 곡이 매일** 나온다
> (막으려던 「이틀 연속」보다 나쁘다). 위 SQL 처럼 **곡별 `max(day)`** 로 묶어야 한다.
> `nulls first` 가 「한 번도 안 나온 곡」을 앞에 놓고, `random()` 이 그들 사이 순서를 섞는다 —
> 「골고루 섞어 돌린다」와 「안 겹친다」가 한 문장에 함께 들어간다.

> ⚠️ **`language plpgsql` 인 이유.** 단일 SQL 문장으로 쓰면 데이터 변경 CTE 와 바깥 `select` 가
> **같은 스냅샷**을 써서, `on conflict do nothing` 으로 진 요청이 방금 남이 커밋한 오늘 행을 **못 보고
> NULL 을 받는다.** 하필 그 경로를 밟는 것이 아침에 거의 동시에 들어오는 첫 몇 분이다. plpgsql 은 ③ 을
> **새 문장**으로 돌려 그 행을 본다.

> ⚠️ **`btrim(both … from …)` 은 문법 오류다.** `BOTH … FROM` 은 `trim()` 전용이고 `btrim` 은 평범한 두 인자
> 함수다(`btrim(문자열, 문자들)`). 초안이 그렇게 적혀 있었고, 그대로였다면 **친구가 대시보드에 붙이는 순간
> 함수 생성이 파싱 오류로 실패**했을 것이다.

### 액션 — `getTodaySong`

- 입력 **없음**. ⚠️ **`date` 를 열지 않는다.** 위젯 셋은 `widgetYmd(b)` 로 date 를 받지만 그건 **읽기 전용**이라
  안전했다(index.ts:644 주석에 「공개 정보뿐이라 열어 둔다」고 근거가 적혀 있다). 이건 **쓰는** 액션이라, 같은 입력을 베끼면 인증 없는 호출
  한 줄로 365일치를 미리 박아 성도님이 볼 곡을 태울 수 있다. 시험은 개발 DB 에 SQL 로 행을 넣어 한다.
- 날짜는 **`kstDay(...)`**(index.ts:121 — `function` 이 아니라 `const` 화살표라 `grep "function kstDay"` 로는 안 잡힌다). ⚠️ `weeklyVerseKst`(index.ts:662)는 **이번 주 구절을 찾는** 함수이지
  날짜 헬퍼가 아니다. ⚠️ UTC 로 세면 자정~아침 9시에 어제 곡이 나온다.
- 응답: `{ ok: true, song: { id, song, choir, svc_date, duration, thumbnail } | null }`
  ⚠️ **필드를 고정한다** — 뷰가 이미 여섯 칸만 내보내므로 `songs` 의 관리용 칸(`views`·`hidden`·`is_full`)이
  샐 길이 없다. ⚠️ 응답 `duration` 은 표의 **text 칸**(`"3:42"`)이다. 거르는 데 쓰는 `duration_sec` 는 **다른 값**이다.
- ⚠️ **`user_id` 를 받지도 싣지도 않는다.** 로그인 없이 부를 수 있어야 한다.
- ⚠️ **`songs`·`daily_song`·뷰가 없거나 비면 오류 없이 `{ ok:true, song:null }`**(index.ts:766·1298 선례).
  이게 있어야 개발 DB 에서도 묵상 창이 정상으로 뜬다.

### 액션 — `logSongClick`

`{ user_id, song_id }` 를 받아 `song_click_log` 에 `on conflict do nothing` 으로 한 줄.
단추를 누른 순간 **응답을 안 기다리고**(`fire-and-forget`) 부른다. ⚠️ 응답에 `user_id` 를 **싣지 않는다.**
집계는 `ADMIN_SECRET` 뒤에 둔다. 화면은 2차.

---

## ④ 앱 쪽 구현

### 프리페치 — 첫 화면이 부르고, 묵상 창은 캐시를 쓴다

```js
// 첫 화면 — renderSummary 안, renderEventButton/loadEventState 와 같은 자리
function loadTodaySong() {
  if (!songVisible()) return;
  const cached = songCacheToday();            // localStorage 'song-YYYY-MM-DD'
  if (cached) { fillSongButton(cached); return; }
  withTimeout(api.getTodaySong(), 1500)
    .then((r) => { if (r && r.song) { songCachePut(r.song); fillSongButton(r.song); } })
    .catch(() => {});                          // 조용히 — 단추는 '🎵 찬양 ↗' 로 남는다
}

// 묵상 창 — 캐시가 오늘 것이면 안 부른다
const fetchSong = (songVisible())
  ? Promise.resolve(songCacheToday()).then((c) => c || withTimeout(api.getTodaySong(), 1500).then((r) => (r && r.song) || null))
      .catch(() => null)                       // ⚠️ 반드시 catch
  : Promise.resolve(null);
Promise.all([fetchPsalm, fetchSong]).then(([todayPsalm, todaySong]) => {
  showMeditationModal(items, pick, verse, sermon, !!withTabs, usingPrev, { psalm: todayPsalm, song: todaySong });
});
```

> ⚠️ **`withTimeout` 은 이 저장소에 없다 — 새로 만든다.** `app.js`·`js/*.js` 전수 검색 결과 0건이다.
> `js/api.js` 에는 타임아웃도 재시도도 없다.
> ⚠️ **`.catch(() => null)` 이 없으면 묵상 창 자체가 안 뜬다.** 이 자리는 통째로
> `loadSermons().then(…).catch(() => {})` 안이라 리젝션이 바깥 catch 로 삼켜진다. 그런데 「오늘 봤다」 도장은
> **fetch 보다 먼저** 찍혀 있어(app.js:6397) **그날 매일 묵상이 다시 뜨지도 않는다.**
> ⚠️ **체인으로 잇지 말고 `Promise.all`.** `fetchPsalm.then(→ 찬양 요청)` 으로 이으면 시편이 끝난 뒤에야
> 찬양을 부른다 — 깜빡임을 피하려다 더 나쁜 지연을 만든다.
> ⚠️ **창을 그리기 전에 받아 둔다.** 그린 뒤 끼워 넣으면 창이 뜬 다음 단추만 늦게 나타나 깜빡인다
> (시편 배너가 겪은 그대로 · app.js:6401 주석).
> ⚠️ `showMeditationModal` 인자가 이미 7개다. **여덟 번째를 늘리지 말고 `{ psalm, song }` 한 객체로 묶는다** —
> `showTabs`·`usingPrev` 가 뒤에 있어 자리 하나를 빠뜨리면 조용히 `undefined` 가 된다.

### 노출 게이트 — `songVisible()`

`psalmVisible()`(app.js:299~307) 꼴 그대로 한 벌만 둔다: `_songPreview(?song=1) || songPublicCached()`.
서버는 `PUBLIC_CONFIG_KEYS`(index.ts:2011)에 `songPublic` 을 더한다.
값은 **세 값**(아직 모름 / 없음 / 있음)이고 기본은 언제나 **안 보임**.

> ⚠️ **「자료 자체가 게이트」가 성립하지 않는다.** `songs` 는 운영에 이미 1,700곡이 있어 **자료가 비는
> 순간이 없다.** push = 배포인 저장소라 게이트 없이 푸시하면 그 순간 전 성도에게 열린다 —
> 2026-09-10 에 시편 액자가 남의 커밋에 딸려 나가 첫 화면에 뜬 전례가 있고, **하필 같은 묵상 창**이다.
> ⚠️ **`tools/screen-sweep.py` 의 리셋 스크립트(81줄)에 `_songPreview = true` 를 더한다.**
> 지금은 `_psalmPreview`·`_passagesPreview` 만 켠다 — 안 더하면 새 단추가 게이트가 꺼진 동안
> `01-summary` 스윕에 **아예 안 그려져** 320px·아주 큰 글씨·어두운 모드 점검을 못 받는다.

### 묵상 창에서 누를 때

```js
const gBtn = wrap.querySelector("#med-song");
if (gBtn) gBtn.addEventListener("click", () => {
  done();                                    // ⚠️ close() 가 아니다
  logSongClick(todaySong.id);                // 응답을 안 기다린다
  window.open("https://worship.onlybible.kr/?song=" + encodeURIComponent(todaySong.id), "_blank", "noopener");
});
```

> ⚠️ **`done()` 을 부른다.** `wireModalConfirm`(app.js:934)이 문서 **캡처 단계**에 keydown 리스너를 걸어 두고
> `done()` 만 그걸 뗀다 — `close()` 를 부르면 그 뒤로 Enter·Space·Escape 가 통째로 먹히고 리스너가 영영 남는다.
> ⚠️ 새 탭을 여는 것이라 **`setTimeout(…, 260)` 이 필요 없다**(화면을 갈아끼우지 않는다).

---

## ⑤ 만드는 순서 · 개시 순서

### 왜 「게이트를 끈 채 만들고 나중에 켜는가」

- 안드로이드 앱은 **TWA 껍데기**라 `gocheok.onlybible.kr` 을 그대로 띄우고(`twa-manifest.json` host),
  아이폰 앱도 Capacitor 가 `server.url = https://gocheok.onlybible.kr` 로 라이브 사이트를 띄운다.
  **웹에 푸시하면 두 앱에 바로 반영되고 스토어 제출은 없다.**
- 플레이스토어 프로덕션 액세스 요건은 **「테스터 12명 × 14일 유지」와 신청서**뿐이다(`store/closed-test.md`).
  **이 작업은 시계를 안 건드린다.**
- **찬양 앱으로 보내는 방식이라 개인정보 방침·스토어 신고서는 고칠 것이 없다** — 지금도 설교 보기·찬양
  아카이브가 `window.open` 이다. 그래도 **성도님께 처음 열리는 것은 9/27 승인 뒤**로 둔다(한 번 반려된
  심사에 변수를 더 얹지 않는다).

### 순서

| | 무엇을 | 어디에 |
|---|---|---|
| 1 | `supabase/praise_songs_dev_seed.sql` 로 **개발** 에 `songs` 표 + 시드 | 친구가 대시보드에서 |
| 2 | `supabase/daily_song.sql`(표 둘 + RLS + 뷰 + 함수 + revoke/grant) 를 **개발** 에서 | 친구가 |
| 3 | `api` 를 **개발** 에 배포 → localhost 확인 | `--project-ref ktpwthwqzgcqcrmsafdo` |
| 4 | `daily_song.sql` 을 **운영** 에서 | 친구가 |
| 5 | `api` 를 **운영** 에 배포 | `--project-ref xnomlgydifiqiybervtf` |
| 6 | 찬양 앱(`praise-songs`)에 `?song=` 딥링크 → 그쪽 저장소에서 배포 | |
| 7 | 암송 앱 프런트 커밋 → **`python tools/bump.py` 한 번** → 푸시 (게이트 **꺼진 채**) | |
| 8 | 확인(→ ⑥) | |
| 9 | **9/27 이후** 프로덕션 승인 확인 → `app_config.songPublic = true` → `FEAT_SINCE` 에 그날 날짜 → 설명서 항목 켜기 | |

> ⚠️ **1번이 2번보다 먼저다.** `v2_song_pool` 뷰와 `v2_today_song` 함수는 만들 때 본문이 검증된다
> (`check_function_bodies` 기본 on) — 개발에 `songs` 가 없는 상태에서 2번을 먼저 돌리면
> **`relation "songs" does not exist`** 로 실패한다. **운영에는 `songs` 가 이미 있어 4번은 그냥 된다.**
> ⚠️ **시드 SQL 은 내가 만들어 드린다** — `praise.json` 에서 뽑아 `INSERT` 문을 생성한다. 친구는 붙여 넣기만
> 하시면 된다. **걸러져야 할 것을 일부러 섞는다**(칸타타 · `is_full` · 곡명이 「찬양」 · 찬양팀 · `hidden` 각 한 곡).
> 그래야 거르개가 도는지 개발에서 볼 수 있다.
> ⚠️ **`bump.py` 를 아예 안 돌리면 `preflight` 가 못 잡는다** — preflight 는 `?v=` 들끼리와 `APP_BUILD` 의
> **내부 일치**만 본다. 안 올려도 셋이 여전히 일치하므로 **통과하고 배포도 성공한다.** 그러면 `.med-song-cta`
> CSS 는 style.css 에만 있고 CSS 에는 `APP_BUILD` 같은 자가복구 장치가 없어서, 캐시가 옛것이면 묵상 창에
> **테두리도 색도 없는 맨 브라우저 단추**가 뜬다.
> ⚠️ **새 js 파일을 만들지 않는다 — 코드는 `app.js` 안(묵상 절 옆)에 둔다.** `js/song.js` 를 만들면
> `index.html` script 태그와 `tools/bump.py` 의 `TAGGED` 배열 **둘 다** 고쳐야 하고, 하나만 빠뜨리면 다음
> bump 부터 preflight 가 실패해 **배포 단계가 아예 안 돈다** — 그 시점 이후 **다른 세션의 긴급 수정까지 함께
> 막힌다**(`concurrency: cancel-in-progress` 라 큐에 쌓이지도 않는다).
> 대신 공용 파일이므로 **`git apply --cached` 로 내 헝크만 담고 커밋 직전 `git diff --cached` 를 본다.**
> ⚠️ **Edge Function 배포는 git 이 아니라 작업 트리를 올린다.** 배포 전에 `git status` 와
> `git diff supabase/functions/api/index.ts` 로 남의 헝크가 없는지 눈으로 본다. preflight 는 `index.ts` 를
> **한 글자도 검사하지 않는다.** 배포 직후 내 액션뿐 아니라 `getVerses`·`ranking` 도 한 번 찔러 본다.
> ⚠️ **새 표 + 새 액션이라 표가 먼저다.** 빈 표는 아무도 안 읽으니까. **반대 경우(이미 쓰는 표에 칸·행을
> 더할 때)는 코드가 먼저다** — 옛 코드가 그 행을 주워 간다. 「SQL 먼저」를 규칙으로 외우면 두 번째 경우에
> 화면이 **오류가 아니라 숫자가 달라지는 식으로 조용히** 틀어진다.
> ⚠️ **`songPublic` 만은 예외다.** `PUBLIC_CONFIG_KEYS` 는 이미 쓰이는 경로라, 설정 행을 서버·프런트보다
> 먼저 `true` 로 넣으면 **그 순간 전 성도에게 열린다.** 그래서 9번이 맨 마지막이다.

### monitor

⚠️ **「오늘 행이 없다」를 경보로 넣지 말 것.** 오늘 행은 **첫 사용자가 만든다** — monitor 는 07:12 KST 에 도는데,
그때까지 아무도 앱을 안 연 날마다 **헛경보**가 난다(이 함수는 이미 `verses` 조회에서 헛경보를 한 번 겪어
폴백 주석을 달아 두었다).
→ 응답에 `songPool`(후보 수)·`songToday`(오늘 행 유무)를 **정보로만** 싣고, `problems` 에 넣는 것은
**후보 수가 바닥(100) 아래로 떨어졌을 때 하나뿐**. 구분 이름이 또 바뀌는 날 이것만이 알려 준다.

---

## ⑥ 확인 목록

**이 다섯을 못 하면 게이트를 안 켠다.** (못 할 확인을 적어 두면 「확인했다」로 넘어가거나 기능이 영영 안 켜진다.)

- [ ] **localhost(개발 DB)** — 단추에 곡명이 뜨고, 눌러서 찬양 앱이 열리고, 그 곡이 재생된다
- [ ] **날짜가 바뀌면 곡이 바뀐다** — 개발 DB 에 내일 행을 SQL 로 넣어 보거나 `daily_song` 을 직접 본다
- [ ] **거르개가 돈다** — 시드에 섞어 둔 칸타타·`is_full`·곡명이 「찬양」·찬양팀·`hidden` 이 안 뽑힌다
- [ ] **`tools/screen-sweep.py`** — 320px·아주 큰 글씨·어두운 모드에서 첫 화면 단추와 묵상 창 두 CTA 가
      다 보이고 곡명 두 줄이 안 넘친다(`_songPreview = true` 로 켠 상태)
- [ ] **안드로이드 크롬 · 아이폰 사파리** — 딥링크로 열린 찬양 앱에서 **자동재생이 되는지**.
      막히면 ▶ 를 한 번 누르면 된다는 것을 확인하고, 필요하면 찬양 앱에 안내 한 줄

**공개 키 점검 셋**(SQL 을 돌린 직후, 그 자리에서)
- [ ] `GET /rest/v1/daily_song?select=*&limit=1` → 행이 오면 안 된다
- [ ] `GET /rest/v1/v2_song_pool?select=*&limit=1` → 행이 오면 안 된다
- [ ] `POST /rest/v1/rpc/v2_today_song` → 거부돼야 한다 (⚠️ 함수는 표 목록에 안 보인다)

---

## ⑦ 이번엔 안 하는 것

- **앱 안 유튜브 재생** — 위 「재생 자리를 한 번 바꿨다」의 넷을 다시 읽고 정한다. 판정 기준은
  **「누르긴 누르는데 앱을 잃어버린다」는 제보가 실제로 오는지**다(특히 아이폰 앱 쓰시는 분).
- **임베드 가능 여부 사전 검사** — 찬양 앱이 이미 세 환경에서 돌고 있으므로 이 문제는 그쪽이 안고 있다.
- **쓰임 화면** — 표(`song_click_log`)와 쌓는 액션은 지금 만들고, 보는 화면은 **2주 뒤**
  「이 기능을 계속 둘까」를 정할 때 만든다(`docs/notes/metrics.md` 관행 — 카드 모드·도전 전환율을 그렇게 쟀다).
- **이어 듣기·다음 곡** — 큐에 한 곡만 넣는다. 더 듣고 싶으신 분께는 찬양 앱의 목록이 이미 있다.
- **어제 곡 다시 듣기 · 관리자 지정 화면**(표 한 줄만 고치면 된다) · **위젯·아침 알림 연동** ·
  **「같은 찬양대가 이틀 연속 안 나오게」**

---

## ⑧ 이 일을 하다 따로 발견한 것 (범위 밖)

- ⚠️ **`.home-fab` 에 `body:has(#update-banner)` 보정이 없다.** `#update-banner`(🔄 새 버전)는
  `bottom:0; z-index:9999`, `.home-fab` 은 `z-index:40` 이다. 저장소는 이 구멍을 알고
  `.pl-acts.sticky`(style.css:3506)·`.min-acts`(4892)·`.ps-wrap.ps-home`(5484) 셋에만 보정을 붙여 두었다.
  **배포 직후 앱을 여는 그 시간대에, 앨범·기도문·순위·이벤트 화면의 유일한 출구가 띠에 가린다.**
  CSS 한 줄이면 넷이 함께 고쳐진다 — 이번 작업과 무관하지만 친구가 아셔야 할 것이라 적어 둔다.
- ⚠️ **`docs/notes/home-screen.md` 의 ④⑤ 가 낡았다.** 2026-09-10 에 성도님이 「더 보기」 넷을
  「모두 동일하게」로 정하셔서 아카이브 둘에서 `.ext-cta` 를 뗐는데, 노트는 그 이전 상태(「아카이브 둘만
  흰 바탕 회색선」)로 남아 있다. 코드 주석(app.js:2119-2128 · style.css:4161-4164)이 맞다.
