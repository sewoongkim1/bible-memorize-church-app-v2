# 말씀 연상 그림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구절마다 그 말씀의 심상을 담은 그림 한 장을 두고, 암송 화면 도우미 줄에 **🖼️ 그림** 탭으로 편다.

**Architecture:** 그림은 저장소 안 정적 파일(`img/verse/<번호>.webp`)이고, 있는 구절 목록은 `app.js`의 상수 `VERSE_IMG` 하나다(값이 곧 `alt` 텍스트). 화면은 이미 있는 `fillVerseHelp` 탭 줄에 한 칸을 더하는 것뿐이라 DB·Edge Function·Storage를 건드리지 않는다.

**Tech Stack:** Vanilla JS PWA · GitHub Pages · Higgsfield MCP(`nano_banana_pro`) · Pillow(WebP 변환) · `python tools/bump.py`(캐시 태그)

**설계 문서:** [`docs/superpowers/specs/2026-08-28-verse-image-design.md`](../specs/2026-08-28-verse-image-design.md)

## Global Constraints

- **화풍 문구는 34장 전부 똑같이 붙인다.** 한 글자도 바꾸지 않는다:
  ```
  Soft watercolor painting with delicate ink linework, warm muted earth tones,
  cream paper background, generous white space, gentle and reverent mood.
  No people, no human figures, no buildings, no text, no lettering,
  no letters or writing of any kind.
  ```
- **사람은 어떤 구절에도 넣지 않는다.** 동물·사물은 구절이 직접 지목할 때만.
- ⚠️ **글자 금지 문구를 빼지 않는다.** AI는 한글을 못 쓴다 — 어설픈 글자가 들어가면 *성경 구절을 틀리게 적은 그림*이 된다.
- 파일 규격: `img/verse/<번호>.webp` · 4:3 가로 · 긴 변 **1080px** · WebP **품질 78**
- ⚠️ **원본 PNG는 저장소에 넣지 않는다** (장당 8MB). 스크래치패드에만 두고 커밋하지 않는다.
- ⚠️ **`challengeUsedHelp`를 건드리지 않는다.** `fillVerseHelp`는 도전·복습 화면도 함께 쓰는 공용 함수다.
- ⚠️ **탭을 눌러야 그림을 받는다.** 화면 진입 때 미리 받게 짜지 않는다.
- 모델 `nano_banana_pro`, `aspect_ratio: "4:3"`, 장당 2크레딧. 시작 잔액 213.5(시안 3장 쓴 뒤).
- 배포는 **`python tools/bump.py` 한 번** → 커밋·푸시. 캐시 태그를 손으로 고치지 않는다.

**스크래치패드:** `C:\Users\sewki\AppData\Local\Temp\claude\c--Projects-bible-memorize-church-app-v2\9e7eef63-5094-4e31-9c5b-5a8b23706726\scratchpad`
아래에서는 `$SP`로 줄여 쓴다.

## File Structure

| 파일 | 새로/고침 | 맡은 일 |
|---|---|---|
| `img/verse/30.webp` … `34.webp` | 새로 | 그림 다섯 장 |
| `img/verse/prompts.md` | 새로 | 화풍 문구 + 구절별 심상 문구. **반 년 뒤 화풍을 되찾는 유일한 길** |
| `app.js` (`VERSE_IMG` 상수) | 새로 | 구절 번호 → alt 텍스트. 키가 곧 「그림 있음」 표시 |
| `app.js` (`fillVerseHelp`) | 고침 | 탭 한 칸 추가 + 그림 그리는 갈래 |
| `style.css` (`.help-slot`) | 고침 | 그림 크기 + 탭 4칸이 좁은 폰에서 줄바꿈 |

---

### Task 1: 그림 다섯 장 만들기 (30~34)

그림 자체만 만든다. 앱은 아직 건드리지 않는다 — 그림이 구절에 안 맞으면 여기서 되돌리는 게 싸다.

**Files:**
- Create: `img/verse/30.webp`, `31.webp`, `32.webp`, `33.webp`, `34.webp`
- Create: `img/verse/prompts.md`

**Interfaces:**
- Produces: `img/verse/<no>.webp` 다섯 장(4:3, 긴 변 1080px) — Task 2의 `VERSE_IMG` 키가 이 파일 이름과 일대일로 맞아야 한다.

- [ ] **Step 1: 다섯 장을 한 번에 넣는다**

Higgsfield MCP `generate_image_batch`로 다섯 건을 보낸다. 각 `params`는
`model: "nano_banana_pro"`, `aspect_ratio: "4:3"`, `use_unlim: false`,
`prompt`는 **아래 심상 문구 + 줄바꿈 + Global Constraints의 화풍 문구**를 이어 붙인 것.

| index | no | 출처 | 심상 문구 (영문 프롬프트 앞부분) |
|---|---|---|---|
| 30 | 30 | 요이 1:12 | `A folded letter lying closed on a plain wooden table, beside two cups of tea placed side by side, warm afternoon light.` |
| 31 | 31 | 마 10:31 | `A single small sparrow perched on a slender bare branch, soft open sky behind it.` |
| 32 | 32 | 삼상 16:7 | `A single pomegranate resting on a plain surface, its rind split open to reveal the glowing seeds inside.` |
| 33 | 33 | 막 6:31 | `A single empty wooden chair on a still lakeshore at dawn, calm water and a few reeds.` |
| 34 | 34 | 사 48:15 | `A quiet dirt path winding through an open grassy field, leading over a low hill toward a warm sunrise on the horizon.` |

⚠️ 31번은 **참새가 주인공**이다. 화풍 문구의 금지어는 `no human figures`이지
`no faces`가 아니다 — `no faces`로 적으면 새가 뒷모습으로만 나온다.

- [ ] **Step 2: 다 될 때까지 기다린다**

`jobs_wait`에 다섯 job을 한 번에 넘긴다(`timeout_seconds: 15`).
`all_terminal: false`면 그대로 다시 부른다.
기대: `summary.completed == 5`, `failed == 0`.

- [ ] **Step 3: 내려받아 규격대로 줄인다**

```bash
SP="C:/Users/sewki/AppData/Local/Temp/claude/c--Projects-bible-memorize-church-app-v2/9e7eef63-5094-4e31-9c5b-5a8b23706726/scratchpad"
mkdir -p "$SP/verse_png" "c:/Projects/bible-memorize-church-app-v2/img/verse"
# jobs_wait이 준 result_url 을 번호에 맞춰 받는다 (ASCII 파일명만 쓸 것)
curl -sS --retry 3 -o "$SP/verse_png/30.png" "<30번 result_url>"
curl -sS --retry 3 -o "$SP/verse_png/31.png" "<31번 result_url>"
curl -sS --retry 3 -o "$SP/verse_png/32.png" "<32번 result_url>"
curl -sS --retry 3 -o "$SP/verse_png/33.png" "<33번 result_url>"
curl -sS --retry 3 -o "$SP/verse_png/34.png" "<34번 result_url>"
ls -l "$SP/verse_png"
```

⚠️ 다섯 개를 한 줄에 몰아 쓰면 CloudFront가 뒤쪽 연결을 끊는다(시안 때 실제로 겪었다).
한 줄에 하나씩, `--retry 3`을 붙인다. 받은 뒤 **다섯 개가 다 있는지 `ls`로 센다.**

```bash
cd "c:/Projects/bible-memorize-church-app-v2" && python - <<'PY'
from PIL import Image
import os
SP = r"C:\Users\sewki\AppData\Local\Temp\claude\c--Projects-bible-memorize-church-app-v2\9e7eef63-5094-4e31-9c5b-5a8b23706726\scratchpad"
for n in range(30, 35):
    src = os.path.join(SP, "verse_png", "%d.png" % n)
    im = Image.open(src).convert("RGB")
    im.thumbnail((1080, 1080))
    out = os.path.join("img", "verse", "%d.webp" % n)
    im.save(out, "WEBP", quality=78)
    print(n, im.size, round(os.path.getsize(out) / 1024), "KB")
PY
```

기대: 다섯 줄, 크기 `(1080, 806)`, 각 **25~90KB**.
150KB를 넘으면 원본이 4:3이 아닐 수 있으니 크기를 다시 본다.

- [ ] **Step 4: 다섯 장을 눈으로 본다 (사람이 한다)**

Read 도구로 `img/verse/30.webp` … `34.webp`를 하나씩 열어 **네 가지**를 본다:

1. 글자가 한 자도 없는가 (있으면 그 장은 다시 뽑는다)
2. 사람이 없는가
3. 우상처럼 보이는 형상이나 다른 종교의 상징이 없는가
4. 그림이 구절의 뜻을 **틀리게** 말하지 않는가

⚠️ **이 단계를 건너뛰지 않는다.** AI는 이걸 스스로 가리지 못한다.
한 장이라도 걸리면 그 index만 Step 1로 되돌린다(장당 2크레딧).

- [ ] **Step 5: 프롬프트를 남긴다**

`img/verse/prompts.md`를 만든다:

```markdown
# 말씀 연상 그림 — 프롬프트 기록

설계: `docs/superpowers/specs/2026-08-28-verse-image-design.md`
모델: `nano_banana_pro` · 4:3 · 원본 2400×1792 PNG → 긴 변 1080px WebP(품질 78)

## 화풍 (34장 공통 — 한 글자도 바꾸지 않는다)

```
Soft watercolor painting with delicate ink linework, warm muted earth tones,
cream paper background, generous white space, gentle and reverent mood.
No people, no human figures, no buildings, no text, no lettering,
no letters or writing of any kind.
```

⚠️ `no faces`가 아니라 `no human figures`다 — `no faces`로 적으면
31번 참새까지 걸려 새가 뒷모습으로만 나온다.

## 구절별 심상 (위 화풍 문구 앞에 붙인다)

| no | 출처 | 심상 문구 |
|---|---|---|
| 30 | 요이 1:12 | A folded letter lying closed on a plain wooden table, beside two cups of tea placed side by side, warm afternoon light. |
| 31 | 마 10:31 | A single small sparrow perched on a slender bare branch, soft open sky behind it. |
| 32 | 삼상 16:7 | A single pomegranate resting on a plain surface, its rind split open to reveal the glowing seeds inside. |
| 33 | 막 6:31 | A single empty wooden chair on a still lakeshore at dawn, calm water and a few reeds. |
| 34 | 사 48:15 | A quiet dirt path winding through an open grassy field, leading over a low hill toward a warm sunrise on the horizon. |

## 더할 때

1. 위 화풍 문구를 **그대로** 쓰고 심상 한 문장만 새로 짓는다 — 심상은 **하나만**.
2. 뽑은 뒤 사람 눈으로 본다(글자·사람·다른 종교 상징·뜻 왜곡).
3. 1080px WebP로 줄여 `img/verse/<번호>.webp`로 넣는다.
4. `app.js`의 `VERSE_IMG`에 한 줄(번호 → 한글 그림 설명)을 더한다.
5. 이 표에 심상 문구를 이어 적는다.
```

- [ ] **Step 6: 파일과 규격을 확인한다**

```bash
cd "c:/Projects/bible-memorize-church-app-v2" && ls -l img/verse/ && du -sh img/verse/
```

기대: `30.webp`~`34.webp` 다섯 개 + `prompts.md`, 폴더 합계 **300KB 미만**.
`.png`가 하나라도 보이면 지운다(원본은 저장소에 넣지 않는다).

- [ ] **Step 7: 커밋**

```bash
cd "c:/Projects/bible-memorize-church-app-v2"
git add img/verse
git commit -m "$(cat <<'MSG'
feat(그림): 최신 다섯 구절의 연상 그림을 넣는다

수채·먹선 한 화풍으로 30~34를 뽑았다. 사람은 그리지 않았고,
31번만 구절이 참새를 직접 지목하므로 새가 주인공이다.

프롬프트를 img/verse/prompts.md에 남긴다 — 반 년 뒤 새 구절을
더할 때 같은 화풍을 되찾는 유일한 길이다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: 도우미 탭에 🖼️ 그림 붙이기

**Files:**
- Modify: `app.js` — `fillVerseHelp` 바로 위에 `VERSE_IMG` 상수 추가 (현재 `app.js:3499` 주석 앞)
- Modify: `app.js:3502-3552` — `fillVerseHelp` 안 두 곳
- Modify: `style.css:444-460` — `.help-slot` 규칙 두 곳

**Interfaces:**
- Consumes: Task 1이 만든 `img/verse/<no>.webp`
- Produces: `const VERSE_IMG` — `{ [verseNo: number]: string }`. 값은 한글 alt 텍스트. 키가 있으면 그 번호의 `.webp`가 저장소에 있다는 뜻.

- [ ] **Step 1: `VERSE_IMG` 상수를 넣는다**

`app.js`에서 `// 암송 도우미 — '쉬운 풀이'...` 주석(현재 3499행) **바로 위**에 넣는다:

```js
// 말씀 연상 그림 — 구절 번호 → 그림 설명(= alt 텍스트).
//   키가 있으면 img/verse/<번호>.webp 가 있다는 뜻이라 파일 목록을 따로 두지 않는다.
//   값은 화면 낭독기가 읽고, 그림을 못 불러올 때 대신 보인다.
//   그림을 새로 넣으면 여기 한 줄을 더한다. 화풍·프롬프트는 img/verse/prompts.md.
const VERSE_IMG = {
  30: "덮어 둔 편지 한 통과 그 옆에 나란히 놓인 찻잔 둘",
  31: "가느다란 나뭇가지에 앉은 참새 한 마리",
  32: "겉껍질이 갈라져 속이 드러난 석류 한 알",
  33: "인적 없는 호숫가에 놓인 빈 나무 의자",
  34: "새벽빛이 든 들길이 언덕 너머로 곧게 이어진 풍경",
};
```

- [ ] **Step 2: 탭 한 칸을 더한다**

`fillVerseHelp` 안에서 `if (hasEn(verse)) { ... }` 블록이 끝난 **다음 줄**,
`if (!items.length) return;` **앞**에 넣는다:

```js
    // 🖼️ 그림 — 말씀을 장면으로 붙잡게 하는 도우미. 글자가 없어 언어와 무관하다.
    //   그림이 있는 구절만 탭이 뜬다(풀이가 없으면 풀이 탭이 없는 것과 같은 규칙).
    if (VERSE_IMG[verse.no]) items.push({ k: "img", label: "🖼️ 그림" });
```

⚠️ **`if (!items.length) return;` 앞**이어야 한다. 뒤에 넣으면 설교 도우미가
없는 구절에서 함수가 먼저 빠져나가 그림 탭도 함께 사라진다.

- [ ] **Step 3: 그림을 그리는 갈래를 넣는다**

같은 함수의 클릭 처리 안, `const item = items.find(...)` 와 `body.innerHTML = "";`
**다음**, `const textEl = ...` **앞**에 넣는다:

```js
        if (item.k === "img") {
          // 탭을 누른 지금에야 받는다 — 화면에 들어올 때 미리 받으면 첫 실행이
          // 무거워진다(글꼴 CSS 765KB 사건과 같은 길, 2026-08-27).
          const img = document.createElement("img");
          img.className = "help-img";
          img.alt = VERSE_IMG[verse.no];
          img.src = `img/verse/${verse.no}.webp?v=${APP_BUILD}`;
          img.addEventListener("error", () => {
            const msg = document.createElement("div");
            msg.textContent = "그림을 불러오지 못했어요.";
            img.replaceWith(msg);
          });
          body.appendChild(img);
          body.hidden = false;
          return;
        }
```

⚠️ 바로 위에 있는
`if (btn.dataset.k === "tip" && opts && opts.forChallenge) challengeUsedHelp = true;`
줄을 **그대로 둔다**. `"tip"`만 걸리므로 그림은 도움으로 세지 않는다 —
세면 그림을 본 것만으로 도전 완료 화면에 「다시 암송하기」가 떠서
그림을 여는 걸 꺼리게 된다.

같은 줄의 주석 뒤에 한 줄을 덧붙인다:

```js
        //   🖼️ 그림도 세지 않는다 — 답을 알려 주지 않고 뜻을 떠올리게 할 뿐이다.
```

- [ ] **Step 4: CSS 두 곳을 고친다**

`style.css`의 `.help-slot .help-tabs`를 이렇게 바꾼다(줄바꿈 허용 + 최소 너비):

```css
/* 탭이 셋일 때는 지금처럼 한 줄에 나란히. 넷이 되면(그림까지) 좁은 폰에서만
   두 줄로 접힌다 — 억지로 한 줄에 욱여넣으면 「🧠 기…」처럼 잘려 못 읽는다. */
.help-slot .help-tabs {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px;
}
.help-slot .help-btn {
  flex: 1 1 0; min-width: 4.6em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  padding: 6px 6px;
}
```

`.help-slot .help-body[hidden]` 줄 **다음**에 그림 규칙을 더한다:

```css
/* 연상 그림 — 도우미 칸 폭에 맞추되 너무 커지지 않게. 어두운 모드에서도
   그대로 둔다(어둡게 깔면 수채가 탁해진다 — 그림은 그림이다). */
.help-slot .help-img {
  display: block; width: 100%; max-width: 420px;
  margin: 0 auto; border-radius: 10px;
}
```

- [ ] **Step 5: 상수와 파일이 일대일인지 센다**

```bash
cd "c:/Projects/bible-memorize-church-app-v2" && python - <<'PY'
import io, os, re
src = io.open("app.js", encoding="utf-8").read()
m = re.search(r"const VERSE_IMG = \{(.*?)\n\};", src, re.S)
keys = set(int(k) for k in re.findall(r"^\s*(\d+):", m.group(1), re.M))
files = set(int(f[:-5]) for f in os.listdir("img/verse") if f.endswith(".webp"))
print("상수만 있음(그림 안 뜸):", sorted(keys - files))
print("파일만 있음(안 쓰임)  :", sorted(files - keys))
print("맞음:", sorted(keys & files))
assert keys == files, "상수와 파일이 어긋난다"
print("OK")
PY
```

기대: `맞음: [30, 31, 32, 33, 34]`, 마지막 줄 `OK`.
어긋나면 상수 줄이나 파일 이름 중 하나가 틀린 것이다.

- [ ] **Step 6: 실제 화면에서 본다**

```bash
cd "c:/Projects/bible-memorize-church-app-v2" && python -m http.server 8765
```

브라우저에서 **`http://localhost:8765/?v=34`** — 딥링크라 로그인 없이 34번
암송 화면으로 바로 들어간다. 다음 다섯 가지를 확인한다:

1. 도우미 줄에 **🖼️ 그림** 탭이 보인다
2. 누르면 그림이 펴지고, 다시 누르면 접힌다
3. **개발자도구 → 네트워크**: 탭을 누르기 **전에는** `34.webp` 요청이 없다
4. 요청 주소에 `?v=` 뒤 `APP_BUILD` 값이 붙어 있다
5. 화면 폭을 **320px**로 줄인다 — 탭 넷이 두 줄로 접히고 글자가 잘리지 않는다

그리고 두 가지를 더 본다:

- **`http://localhost:8765/?v=1`** — 1번은 그림이 없으므로 **🖼️ 그림 탭이 아예 없어야** 한다.
- **`http://localhost:8765/?v=34&lang=en`** — 영어 모드에서도 **같은 그림**이 뜬다
  (그림에 글자가 없어 언어와 무관하다).

마지막으로 **못 불러올 때**를 본다. 개발자도구 → 네트워크에서
`34.webp` 요청을 차단(Block request URL)한 뒤 탭을 열면
그 자리에 **「그림을 불러오지 못했어요.」** 한 줄이 보이고, 다른 탭은 그대로 눌린다.

- [ ] **Step 7: 도전 화면에서 「다시 암송하기」가 안 뜨는지 본다**

같은 서버에서 앱에 로그인한 뒤 **말씀 도전**으로 들어가 그림이 있는 구절
(30~34)을 만나면 **🖼️ 그림만 열고** 구절을 맞힌다.

기대: 완료 화면 맨 위에 **「📖 이 말씀 다시 암송하기」가 뜨지 않는다.**
뜬다면 Step 3의 `challengeUsedHelp` 줄을 잘못 건드린 것이다.

같은 구절에서 **🧠 기억법**을 열고 맞히면 **뜨는지도** 함께 본다 —
기존 동작이 살아 있는지 보는 대조군이다.

- [ ] **Step 8: 커밋**

```bash
cd "c:/Projects/bible-memorize-church-app-v2"
git add app.js style.css
git commit -m "$(cat <<'MSG'
feat(그림): 암송 도우미에 🖼️ 그림 탭을 둔다

풀이는 뜻을, 기억법은 끊어읽기를 준다. 그림은 그 둘이 못 하는
자리를 맡는다 — 말이 아닌 것으로 기억에 거는 일.

탭을 눌러야 받는다. 화면에 들어올 때 미리 받으면 글꼴 765KB
사건과 같은 길을 밟는다.

challengeUsedHelp는 건드리지 않았다. 그림은 답을 알려 주지 않으므로
도움으로 세면 그림 여는 것을 꺼리게 된다.

탭이 넷이 되어 좁은 폰에서 「🧠 기…」로 잘리므로 줄바꿈을 허용했다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: 배포하고 라이브에서 확인한다

**Files:**
- Modify: `index.html`, `app.js` (둘 다 `tools/bump.py`가 고친다 — 손대지 않는다)

**Interfaces:**
- Consumes: Task 2가 커밋한 `app.js`·`style.css`
- Produces: gocheok.onlybible.kr에 올라간 판. Task 4는 이 확인이 끝난 뒤에 시작한다.

- [ ] **Step 1: 판 번호를 올린다**

```bash
cd "c:/Projects/bible-memorize-church-app-v2" && python tools/bump.py
```

기대: 새 태그와 `APP_BUILD`가 같이 올라갔다는 출력.
⚠️ `index.html`의 `?v=`나 `APP_BUILD`를 **손으로 고치지 않는다.**

- [ ] **Step 2: 푸시**

```bash
cd "c:/Projects/bible-memorize-church-app-v2"
git add index.html app.js
git commit -m "chore: bump" && git push
```

- [ ] **Step 3: 배포가 끝났는지, 옛 파일이 아닌지 확인한다**

```bash
cd "c:/Projects/bible-memorize-church-app-v2"
V=$(grep -o 'app.js?v=[0-9a-z]*' index.html | head -1 | cut -d= -f2)
echo "index.html이 부르는 태그: $V"
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -o 'APP_BUILD = "[0-9a-z]*"'
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" "https://gocheok.onlybible.kr/img/verse/34.webp"
```

기대: `APP_BUILD`가 `$V`와 **같다**. 그림은 `200`에 25000~90000 사이 크기.
⚠️ 다르면 CDN이 아직 옛 app.js를 내보내는 중이다(최대 10분).
**함수 이름 같은 옛 판에도 있던 표식으로 확인하지 않는다** — 그대로 통과해 오인한다.

- [ ] **Step 4: 폰에서 본다**

`https://gocheok.onlybible.kr/?v=34` — 34번 암송 화면에서
🖼️ 그림 탭이 뜨고 눌러야 그림이 펴지는지, 탭 넷이 잘리지 않는지 본다.
어두운 모드로도 한 번 본다(그림이 밝은 덩어리로 뜨는 건 정상이다).

- [ ] **Step 5: CLAUDE.md에 한 줄 남긴다**

「주요 기능」 목록에 넣는다:

```markdown
- **말씀 연상 그림(2026-08-28):** 암송 도우미 줄(💡 풀이·🧠 기억법·🌐 영어)에 **🖼️ 그림**을 더했다. 구절의 심상 한 장을 수채·먹선 한 화풍으로 그려 `img/verse/<번호>.webp`에 두고, 있는 구절 목록은 `app.js`의 `VERSE_IMG` 상수 하나다(**값이 곧 alt 텍스트** — 낭독기가 읽고 그림이 안 뜰 때 대신 보인다). ⚠️ **탭을 눌러야 받는다** — 화면 진입 때 미리 받으면 글꼴 765KB 사건과 같은 길이다. ⚠️ **`challengeUsedHelp`를 건드리지 않는다** — `fillVerseHelp`는 도전·복습도 함께 쓰는 공용 함수이고, 그림을 도움으로 세면 그림 여는 것을 꺼리게 된다(💡 풀이와 같은 쪽이다). ⚠️ 화풍 문구의 금지어는 `no faces`가 아니라 **`no human figures`** — `no faces`면 31번 참새까지 걸린다. 프롬프트는 `img/verse/prompts.md`, 설계는 `docs/superpowers/specs/2026-08-28-verse-image-design.md`.
```

```bash
cd "c:/Projects/bible-memorize-church-app-v2"
git add CLAUDE.md && git commit -m "docs(그림): 연상 그림의 자리와 지켜야 할 셋을 적는다" && git push
```

---

### Task 4: 나머지 29장 (29 → 1)

⚠️ **Task 3의 라이브 확인이 끝난 뒤에 시작한다.** 화면에서 한 번도 안 본 채로
29장을 뽑으면, 규격이 틀렸을 때 29장을 다시 뽑아야 한다.

**Files:**
- Create: `img/verse/1.webp` … `29.webp`
- Modify: `img/verse/prompts.md` (심상 표에 29줄 추가)
- Modify: `app.js` (`VERSE_IMG`에 29줄 추가)

**Interfaces:**
- Consumes: Task 1의 `img/verse/prompts.md` 화풍 문구, Task 2의 `VERSE_IMG` 모양
- Produces: `VERSE_IMG` 키 34개 = `img/verse/*.webp` 34개

- [ ] **Step 1: 구절 본문을 UTF-8로 뽑아 둔다**

```bash
SP="C:/Users/sewki/AppData/Local/Temp/claude/c--Projects-bible-memorize-church-app-v2/9e7eef63-5094-4e31-9c5b-5a8b23706726/scratchpad"
curl -s -X POST "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" -d '{"action":"getVerses"}' -o "$SP/verses_live.json"
cd "c:/Projects/bible-memorize-church-app-v2" && python - <<PY
import io, json
SP = r"$SP"
vs = json.load(io.open(SP + "/verses_live.json", encoding="utf-8"))["verses"]
out = io.open(SP + "/verses_1_29.txt", "w", encoding="utf-8")
for v in vs:
    if v["no"] <= 29:
        out.write("%s | %s | %s\n" % (v["no"], v["refShort"], v["text"]))
out.close()
PY
cat "$SP/verses_1_29.txt"
```

⚠️ 콘솔에 바로 찍으면 한글이 깨진다. **UTF-8 파일로 쓰고 `cat`으로 본다.**

- [ ] **Step 2: 열두 장씩 세 묶음으로 뽑는다**

구절마다 **심상 한 문장**을 영어로 짓고(장면 하나만), Global Constraints의
화풍 문구를 뒤에 붙인다. 문장 모양은 Task 1의 다섯 줄을 본보기로 삼는다 —
`A single ...` / `A quiet ...`처럼 **하나의 사물이나 한 장면**으로 시작하고,
빛(`warm afternoon light`, `at dawn`)으로 분위기를 맺는다. `generate_image_batch`는 한 번에 **최대 12건**이므로
`1~12` / `13~24` / `25~29` 세 묶음으로 나눈다. 각 묶음마다 `jobs_wait`으로
`all_terminal`을 기다린 뒤 다음 묶음을 보낸다.

⚠️ 사람은 어떤 구절에도 넣지 않는다. 동물·사물은 구절이 **직접 지목할 때만**.

- [ ] **Step 3: 내려받아 줄인다**

Task 1 Step 3과 같은 방법. 한 줄에 하나씩 `--retry 3`으로 받고,
Pillow 코드의 `range(30, 35)`를 `range(1, 30)`으로 바꿔 돌린다.
받은 개수를 `ls | wc -l`로 세어 **29개**인지 확인한다.

- [ ] **Step 4: 29장을 눈으로 본다 (사람이 한다)**

Task 1 Step 4의 네 가지(글자·사람·다른 종교 상징·뜻 왜곡)를 29장 모두에 본다.
⚠️ 장수가 많다고 건너뛰지 않는다 — 34장이 다 공개되는 화면에 걸린다.
걸린 장은 그 번호만 다시 뽑는다.

- [ ] **Step 5: 상수와 프롬프트 기록을 채운다**

`app.js`의 `VERSE_IMG`에 1~29를 더한다(번호 오름차순, 값은 한글 그림 설명).
`img/verse/prompts.md`의 심상 표에도 같은 29줄을 적는다.

- [ ] **Step 6: 일대일인지 다시 센다**

Task 2 Step 5의 스크립트를 그대로 돌린다.
기대: `맞음`이 **1부터 34까지 34개**, 마지막 줄 `OK`.

```bash
cd "c:/Projects/bible-memorize-church-app-v2" && du -sh img/verse/
```

기대: **2MB 미만**.

- [ ] **Step 7: 커밋 · 배포 · 확인**

```bash
cd "c:/Projects/bible-memorize-church-app-v2"
git add img/verse app.js
git commit -m "$(cat <<'MSG'
feat(그림): 나머지 29구절의 연상 그림을 채운다

1~29를 같은 수채·먹선 화풍으로 뽑아 34구절 전부에 그림이 붙었다.
심상 문구는 img/verse/prompts.md 표에 이어 적었다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
python tools/bump.py
git add index.html app.js && git commit -m "chore: bump" && git push
```

배포 뒤 Task 3 Step 3의 확인 명령을 다시 돌리고,
`https://gocheok.onlybible.kr/?v=1`에서 1번에도 🖼️ 그림 탭이 뜨는지 본다.
