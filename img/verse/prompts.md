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
