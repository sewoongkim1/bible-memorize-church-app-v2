# 말씀 연상 그림 — 프롬프트 기록

설계: `docs/superpowers/specs/2026-08-28-verse-image-design.md`
모델: `nano_banana_pro` · 4:3 · 원본 2400×1792 PNG → 긴 변 1080px WebP(품질 78)

## 벡터 11장을 구아슈로 교체 · 35번 신규 (2026-09-03)

Higgsfield 크레딧이 생겨(258) **벡터로 임시로 채웠던 11장을 구아슈로 다시
뽑고**, 새로 들어온 35번(슥 4:10)에 세 장(대표 수채 + 구아슈 짝 둘)을 만들었다.
총 14장 · 2크레딧/장 = 28크레딧. 이제 **벡터 화풍은 한 장도 남지 않았다** —
짝 그림 70장이 전부 구아슈·색연필이다.

교체한 11장: 3b · 3c · 4b · 7c · 10c · 11c · 12b · 13b · 16c · 32b · 33c
새로 만든 3장: 35(수채·먹선) · 35b · 35c(구아슈)

**지난번 실패 유형별 처방이 그대로 들었다** — 이 파일에 적어 둔 대로
액자화·메타 소품·가짜 글자·서명 문구를 붙였더니 14장 중 13장이 한 번에 통과했다.

⚠️ **35번 심상은 「다림줄」인데 「손에」를 그릴 수 없다.** 본문은 「스룹바벨의
손에 다림줄이 있음을」인데 화풍 문구가 `no human figures` 다. 그래서 **줄에
매달려 멈춘 추와 발치의 주춧돌**로 잡았다 — 사람 없이도 「재어 보는 일」이
전해진다. `no buildings` 도 있어 벽·비계 대신 **다듬은 돌 몇 개**만 두었다.

⚠️⚠️ **「종이」를 말하면 종이를 물체로 그린다** (이번에 새로 겪은 것)
7c(보라 옷감)가 두 번 걸렸다.
1. 첫 시도 — 3b·3c에는 「책 속 한 장이 아니다」를 넣고 **7c에는 빠뜨렸다**
   (예전 실패가 스프링 자국이라 그것만 막았다). 결과는 **스케치북을 펼쳐 놓고
   찍은 사진** — 제본 그늘·책배·표지까지 나왔다. 「탁자 위의 천」처럼 평평한
   물건도 이 함정에 걸린다. **메타 소품 문구는 종이·천·책 계열 전부에 넣을 것.**
2. 두 번째 시도 — 막으려고 `one plain sheet of cream paper that fills the
   entire frame edge to edge` 라고 썼더니 이번엔 **크림 종이 한 장이 나무
   책상 위에 놓인 사진**이 나왔다. 종이를 물체로 지칭한 것이 역효과였다.
   → **`cream paper background` 이상으로 종이를 말하지 말 것.**
3. 고친 법 — 다시 뽑지 않고 **종이 안쪽을 잘라냈다**(크림 영역을 찾아 안쪽
   14px 여유를 두고 4:3으로). 그림 자체는 멀쩡했으므로 2크레딧을 아꼈다.
   같은 증상이면 재생성 전에 크롭을 먼저 볼 것.

⚠️ **429(rate_limit_reached)는 여전히 난다.** 12장을 한꺼번에 넣으면 한둘이
튕긴다(이번엔 4번). 배치가 실패해도 나머지는 들어가므로, **튕긴 것만 골라
잠시 뒤 다시** 넣으면 된다.

⚠️ **CDN이 파이썬 기본 요청을 끊는다**(`ConnectionResetError 10054`).
결과 PNG를 받을 때는 `curl -A "Mozilla/5.0"` 을 쓸 것. 몇 장은 그래도 실패해
재시도가 필요했다.

## 화풍 비교 실험 — 1번 구절 (2026-08-28)

34장을 다 채운 뒤 「수채·먹선 말고 다른 화풍도 보고 싶다」는 요청으로,
1번(시 119:105, 등불) 하나에만 **구아슈·색연필 화풍**을 두 장 더 만들어
`app.js`의 `VERSE_IMG_MORE`에 얹었다. 다른 33장은 이 표에 없어 그림이
그대로 한 장이다 — `fillVerseHelp`의 img 갈래가 `imgs.length > 1`일 때만
「🔄 다른 화풍 보기」 단추를 붙인다.

파일: `img/verse/1b.webp`(넓은 장면) · `1c.webp`(등불 클로즈업).
화풍 문구:
```
Soft gouache and colored pencil illustration, rich saturated warm tones,
visible pencil grain and soft matte texture, slightly more solid and
painterly than watercolor, cream paper background, generous white space,
gentle and reverent mood. The illustration is painted directly onto the
plain cream page with no border, no frame, no rectangle outline, no card,
no drop shadow around the edges — the dark night sky and foliage fade
softly into the bare cream paper at the edges.
No people, no human figures, no buildings, no text, no lettering,
no letters or writing of any kind, no signature.
```
심상 문구는 1번과 같다: `A single small oil lamp glowing on a stone path
at night, its warm light illuminating only a few steps ahead into the
darkness.`

⚠️ **첫 시도에서 8·10·15·23번과 같은 액자화가 다시 났다** — 어두운 배경의
단순한 소재(이번엔 밤 장면)에서 유독 잘 생긴다. `painted directly onto the
plain cream page with no border... fade softly into the bare cream paper`
문구를 더해서야 잡혔다. **밤·어둠이 배경인 장면은 처음부터 이 문구를
넣고 시작할 것** — 8·10·15·23·1(구아슈) 다섯 번 다 겪고 나서야 패턴이
보였다.

## 나머지 33구절도 구아슈로 두 장씩 (2026-08-28)

1번을 보고 「나머지도 3개씩」 요청이 와서, 2~34 모든 구절에 같은
방식(각 구절의 기존 심상 문구 + 구아슈 화풍 문구)으로 두 장씩 더
뽑았다. 화풍 문구는 위 1번 블록과 같은 것을 처음부터 썼다(액자화
방지 문구 포함).

⚠️ **그런데도 34장 중 10장이 또 걸렸다** — 화풍 문구를 아무리 촘촘히
적어도 완전히 안 막힌다는 뜻이다.
- **액자화 재발**: 4b·12b·16c는 배경이 여전히 각진 둥근 사각형으로
  나왔다(하늘·촛불 뒤 어둠처럼 "배경이 하나의 색 덩어리"인 장면에서
  특히 잘 생긴다).
- **메타 소품**: 3b·3c는 두 장 다 스케치북이 나무 이젤 위에 놓인
  모습으로 나왔다(왼쪽 제본선·이젤 다리까지 보임) — 액자화보다
  심한 "그림 도구를 그린 그림" 문제. **두루마리·책처럼 "종이 위의
  글"을 연상시키는 소재는 이 함정에 특히 잘 걸린다** — 8·10·15·23·3
  다섯 구절 중 넷이 이 계열이었다.
- **가짜 글자·서명**: 10c(능선의 작은 건물 형상 — no buildings
  위반)·13b(문에 새겨진 작은 표식)·33c(갈대 사이 필기체 서명)에서
  또 나왔다. 15번(포도)에서도 같은 문제(서명)가 났던 걸 감안하면
  **구아슈·색연필처럼 "손으로 그린 듯한" 화풍일수록 서명 충동이
  세다** — 수채·먹선 화풍(34장 본편)에서는 이 정도로 잦지 않았다.
- **스프링노트 자국**: 7c·11c는 왼쪽(또는 왼쪽 위) 가장자리에 작은
  점들이 줄지어 나왔다 — 스프링 제본 구멍처럼 보인다. 이것도
  "종이 위에 직접 그려짐"이 완전히는 안 지켜진다는 증거.

**걸린 10장은 폴더에서 지우고 `VERSE_IMG_MORE`에도 넣지 않았다.**
3번은 두 장 다 걸려 기존처럼 그림 한 장만 남았고, 4·7·10·11·12·13·
16·33번은 통과한 한 장만 남아 총 두 장(기존+통과분)이다. 32번은
`32b` 제출이 속도 제한(429)으로 실패한 채 재시도 전에 크레딧이
떨어져 `32c`만 있다. 나머지 24구절은 두 장 다 통과해 원래 계획대로
세 장(기존+구아슈 2)이다.

**다음에 이 열 장 자리를 마저 채우려면**(2026-08-28 잔액 1.5크레딧,
2크레딧부터 한 장 — 22크레딧 이상 채워야 열한 장):
- 3, 4b, 7c, 10c, 11c, 12b, 13b, 16c, 32b, 33c — 이 순서로 위 화풍
  문구에 다음을 구절 상황에 맞게 덧붙여 다시 뽑는다.
  - 액자화(4b·12b·16c류): `edges fade gradually and irregularly
    into the bare cream paper, never a straight or hard edge, never
    a boxy or rounded-rectangle silhouette`
  - 메타 소품(3번류): `This is a single object resting on a surface,
    not a page inside another book or on a stand` + `no easel, no
    book, no spiral binding, no book spine`
  - 가짜 글자·건물(10c·13b류): 소재를 "무늬 없이 매끈하다"고
    명시하고 배경에서 "distant landscape, tiny shapes on the
    horizon"을 금지한다.
  - 서명(33c류): `no artist signature, no watermark, no monogram`을
    화풍 문구에 기본으로 넣는다(이번엔 마지막에만 넣었다가 걸렸다 —
    처음부터 넣을 것).

## 화풍 (34장 공통 — 한 글자도 바꾸지 않는다)

```
Soft watercolor painting with delicate ink linework, warm muted earth tones,
cream paper background, generous white space, gentle and reverent mood.
No people, no human figures, no buildings, no text, no lettering,
no letters or writing of any kind.
```

⚠️ `no faces`가 아니라 `no human figures`다 — `no faces`로 적으면
31번 참새까지 걸려 새가 뒷모습으로만 나온다. 사람을 막으려는 것이지
새를 막으려는 것이 아니다. (2026-08-28 실제로 확인)

## 구절별 심상 (위 화풍 문구 앞에 붙인다)

| no | 출처 | 심상 문구 |
|---|---|---|
| 1 | 시 119:105 | A single small oil lamp glowing on a stone path at night, its warm light illuminating only a few steps ahead into the darkness. |
| 2 | 창 12:2 | A single ancient olive tree standing alone on a hill at dawn, its branches spreading wide and full. |
| 3 | 수 1:8 | An old scroll lying open on a simple wooden stand, its parchment blank and softly lit, in a quiet room. |
| 4 | 출 13:22 | A tall pillar of soft white cloud rising into a vast twilight sky over an empty desert, its base glowing gently with warm inner light. |
| 5 | 레 20:26 | A single white lily standing apart from the surrounding grass in an open field, gentle space around it. |
| 6 | 행 16:31 | A single iron key resting beside an open cell door, warm light spilling into the dark space beyond. |
| 7 | 행 16:14 | A bolt of deep purple cloth unrolled across a wooden table, catching soft afternoon light. |
| 8 | 눅 4:8 | A single mountain peak rising above a sea of clouds at dawn, vast and solitary, nothing else in view. + 재생성: 종이 위에 직접 그려지도록(액자·책상·그림자 배경 없이) 문구를 덧붙였다. |
| 9 | 신 8:6 | A narrow footpath of sunbaked earth winding between scattered desert rocks toward distant blue mountains, midday light. |
| 10 | 막 12:17 | A single old coin resting on a plain wooden table, soft light catching its worn surface. + 재생성: 동전 면에 각인·문양이 생기지 않도록 "매끈하고 무늬 없는 면"을 못 박았다. |
| 11 | 삿 8:23 | A shepherd's wooden staff leaning against a large rock on a hillside, overlooking a quiet valley below. |
| 12 | 벧전 4:16 | A single candle burning steadily in the dark, its flame bending gently in a soft wind but not going out, wax dripping slowly down its side. |
| 13 | 막 11:3 | A young donkey standing alone by a simple doorway, a loose rope tied nearby, soft morning light. |
| 14 | 막 16:6 | A large round stone rolled away from the mouth of a tomb, soft dawn light spilling into the dark, empty opening. |
| 15 | 민 14:24 | A single heavy cluster of grapes hanging from a vine, sunlight glowing through the ripe fruit. + 재생성: 서명이 생겨 "no artist signature, no watermark, no monogram"을 덧붙였다. |
| 16 | 삼상 26:24 | A spear standing upright in the ground beside a water jug, in a quiet moonlit camp. |
| 17 | 잠 4:6 | A single sturdy tree beside a flowing stream, its roots exposed at the water's edge, standing firm as the current bends the reeds around it. |
| 18 | 대상 22:12 | Neatly stacked cut stones and cedar beams at a quiet building site, soft morning light. |
| 19 | 눅 1:28 | A small bird's nest cradling a single pale egg, resting safely in the fork of a budding branch, soft morning light. |
| 20 | 시 3:6 | A single smooth stone resting undisturbed at the center of a dry riverbed, water-carved grooves swirling around it in the sand. |
| 21 | 살전 5:16-18 | A wisp of incense smoke rising gently from a small dish, curling upward into soft light. |
| 22 | 마 28:19 | Concentric ripples spreading outward across still water, seen close from just above the surface, soft morning light. |
| 23 | 행 16:10 | A single sailing ship's mast with a furled sail against a dawn sky, seen from a quiet harbor. + 재생성: 8번과 같은 이유(액자·그림자 배경)로 문구를 덧붙였다. |
| 24 | 시 116:1 | An open window with a sheer curtain drifting gently in the breeze, warm morning light streaming into a quiet room. |
| 25 | 계 2:7 | A single tree in a lush garden clearing, its leaves full and golden fruit glowing softly among them. |
| 26 | 딤전 1:11 | A small wooden chest lying open on a stone ledge, soft golden light glowing from within, illuminating the surrounding stones. |
| 27 | 눅 5:10 | An empty fishing net laid out to dry on a quiet shore at dawn, calm water beyond. |
| 28 | 사 26:3 | A perfectly still lake mirroring a soft dawn sky, not a single ripple on its surface. |
| 29 | 골 3:23 | A pair of well-worn work gloves and simple garden tools resting beside a small thriving flower bed, warm afternoon light. |
| 30 | 요이 1:12 | A folded letter lying closed on a plain wooden table, beside two cups of tea placed side by side, warm afternoon light. |
| 31 | 마 10:31 | A single small sparrow perched on a slender bare branch, soft open sky behind it. |
| 32 | 삼상 16:7 | A single pomegranate resting on a plain surface, its rind split open to reveal the glowing seeds inside. |
| 33 | 막 6:31 | A single empty wooden chair on a still lakeshore at dawn, calm water and a few reeds. |
| 34 | 사 48:15 | A quiet dirt path winding through an open grassy field, leading over a low hill toward a warm sunrise on the horizon. |

**30번 메모:** 프롬프트는 「덮어 둔 편지」였는데 모델은 **펼쳐진 빈 편지지**를 그렸다.
그대로 두었다 — 요이 1:12는 *편지로 다 쓰지 않고 만나서 말하겠다*는 구절이라
빈 편지지 쪽이 뜻에 더 가깝다. 다시 뽑으면 이 우연을 잃는다.

**34번 메모:** 화풍 시안 3장(수채·사진풍·판화)을 비교할 때 뽑은 수채본을
그대로 썼다. 이미 눈으로 고른 그림이라 다시 뽑지 않았다.

**1~29 인물 서사 구절 메모:** 아브라함·다윗·마리아·베드로처럼 사람이 등장하는
사건이 많다(2, 6, 7, 8, 13, 14, 16, 19, 22, 23, 27 등). **사람 대신 그 장면이
남긴 사물이나 흔적**으로 옮겼다 — 빈 무덤의 돌(14, 막 16:6), 다윗이 남긴 창과
물병(16, 삼상 26:24), 베드로의 빈 그물(27, 눅 5:10)처럼. "인물화"가 아니라
"그 장면의 정물"이라고 생각하면 다음 구절도 같은 방식으로 풀 수 있다.

**⚠️ 검수에서 걸려 다시 뽑은 넷(8·10·15·23):** 화풍 문구만으로는 안 막히는
두 가지 실패 유형이 있었다.
- **액자화**: 그림이 나무 책상 위에 놓인 카드처럼(8번), 또는 벽에 걸린 포스터처럼
  그림자 테두리가 진 채로(23번) 나왔다. 34장 중 이 둘만 그랬다 — 배경이
  단순한 구도(산·배)에서 모델이 "정물 사진"으로 착각한 듯하다. 막으려면
  "painted directly onto the plain cream page with no border, no frame, no
  desk or table surface, no drop shadow around the edges"를 덧붙인다.
- **가짜 글자**: 동전(10번)에 라틴어 명문 흉내가, 포도(15번)에 필기체
  서명("A. Moreau")이 생겼다. `no text, no lettering`만으로는 "화면의 글"은
  막아도 "물건에 새겨진 무늬"나 "그림 구석의 서명"은 못 막는다 — 물건이라면
  "no engraving, no inscription, no relief pattern"을, 그림 전체라면
  "no artist signature, no watermark, no monogram"을 따로 덧붙여야 한다.
- 나머지 30장은 별문제 없었다 — 이 둘은 **동전·배처럼 "실물 정물"에 가까운
  소재**에서만 나왔다. 사람·나무·물·불 같은 유기적 소재는 걸리지 않았다.

## 더할 때

1. 위 화풍 문구를 **그대로** 쓰고 심상 한 문장만 새로 짓는다 — 심상은 **하나만**.
   `A single ...` / `A quiet ...`처럼 사물 하나나 한 장면으로 시작하고,
   빛(`warm afternoon light`, `at dawn`)으로 분위기를 맺는다.
2. 뽑은 뒤 **사람 눈으로 본다** — 글자·사람·다른 종교 상징·뜻 왜곡 넷.
   AI는 이걸 스스로 가리지 못한다.
3. 1080px WebP(품질 78)로 줄여 `img/verse/<번호>.webp`로 넣는다.
   ⚠️ 원본 PNG는 장당 8MB다. 저장소에 넣지 않는다.
4. `app.js`의 `VERSE_IMG`에 한 줄(번호 → 한글 그림 설명)을 더한다.
   그 값이 곧 `alt` 텍스트이므로 **실제 그림을 보고 적는다**(프롬프트가 아니라).
5. 이 표에 심상 문구를 이어 적는다.

## 겪은 것

- 내려받을 때 **한 줄에 하나씩 `--retry 3`**으로 받는다. 다섯 개를 몰아 쓰면
  CloudFront가 뒤쪽 연결을 끊는다(`Recv failure: Connection was reset`).
- 파일 이름은 **ASCII만** 쓴다. 한글 이름으로 `curl -o` 하면 조용히 안 받아진다.
- 한 장이 6분 넘게 걸리기도 한다. `jobs_wait`을 그냥 다시 부르면 된다.
