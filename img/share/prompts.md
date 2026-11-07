# 기도문 보내기 — 풍경 사진(2026-11-04)

`js/pray-share.js` `PRAY_SHARE_PHOTOS` 가 쓰는 배경. 화면은 고를 때만 큰 그림을 받는다(작은 그림 `*-t.webp` 128×160 은 판을 열 때).

- 만든 것: Google Gemini `gemini-3-pro-image` · `aspectRatio 4:5` · `imageSize 2K`(1856×2304) → 가운데 4:5 로 자르고 1080×1350 WebP q78
  (꽃길만 잔무늬가 많아 흐림 0.8 · q66 — 150KB 아래로).
- 열두 장을 그려 여섯을 골랐다. 버린 것: 올리브(그림 가운데 이음 자국) · 눈밭(아래가 하얘 흰 글씨가 안 읽힌다) · 가을 숲(아래가 어지럽다) ·
  들풀 · 숲 햇살 · 강가(강가는 예비 — 원본은 저장소 밖).
- 다시 그릴 때 장면 말 뒤에 붙인 꼬리말(그대로):

  > Vertical 4:5 landscape photograph, natural colors, serene and peaceful, soft light, high detail, professional nature photography.
  > No people, no animals, no text, no letters, no watermark, no logo, no crosses or religious symbols, no buildings.
  > Keep the lower 45 percent of the frame simple and calm (soft field, water, mist or sky) so that text can be placed over it.

| 파일 | 이름 | 장면 말 |
|---|---|---|
| `bg-dawn` | 새벽 | Sunrise over gentle misty hills, warm golden morning light, layers of hills fading into haze. |
| `bg-wheat` | 들판 | A golden wheat field at sunset, warm glow, soft bokeh of wheat ears in the foreground. |
| `bg-sea` | 바다 | A calm sea at sunrise, gentle small waves, pale gold and blue sky, wide horizon. |
| `bg-blossom` | 꽃길 | A quiet path lined with blooming cherry blossom trees in spring, soft pink petals, morning light. |
| `bg-lavender` | 라벤더 | Rows of a lavender field at golden hour, soft purple and warm sky. |
| `bg-lake` | 호수 | A still mountain lake with morning mist, mirror reflection of distant mountains, cool soft colors. |

## 추수감사 둘(2026-11-04 · 친구 「추수감사절 배경 이미지로 2개 추가」)

판에서 사진 맨 앞(밤하늘 다음)에 둔다 — 추수감사절 철에 먼저 보이게. 1080×1350 WebP q80(자르지 않고 줄이기만 — 원본도 4:5).
여섯 장을 그려 둘을 골랐다. 버린 것: 수채화(종이가 화면을 다 덮지 않고 사진 위에 얹힌 꼴로 나왔다) · 논 · 곡식단(이미 있는 「들판」과 비슷) ·
호박(서양 추수감사 느낌 · 긴 편에서 글이 호박 위에 앉는다). 원본은 저장소 밖.
오른쪽 위에 교회 마크가 앉으므로 꼬리말에 마지막 문장을 더했다:

  > Vertical 4:5 photograph, warm natural autumn colors, peaceful and thankful harvest mood, soft light, high detail, professional photography.
  > No people, no animals, no text, no letters, no watermark, no logo, no crosses or religious symbols, no buildings.
  > Keep the lower 45 percent of the frame simple and calm (soft field, table surface, mist or soft dark background) so that text can be placed over it.
  > Keep the top right corner plain and uncluttered (open sky or soft background) for a small logo.

| 파일 | 이름 | 장면 말 |
|---|---|---|
| `bg-basket` | 열매 | A harvest still life: a woven wicker basket overflowing with grapes, red apples, pears, pomegranates and a small pumpkin, golden wheat ears beside it, on a rustic dark wooden table, warm soft window light from the left, dark warm brown background. |
| `bg-persimmon` | 감나무 | Ripe orange persimmons hanging on bare persimmon tree branches against a clear deep blue autumn sky, a softly blurred golden rice field far below, Korean countryside in harvest season, warm late afternoon light. |

## 친구가 준 추수감사 그림 셋(2026-11-04 · 「3개의 그림을 넣어주세요」)

AI 그림이 아니다 — 친구가 소책자 · 광고에 쓰던 그림(`자료/2026추수감사절/` · 원본은 커밋 안 함). 공개 저장소 · 웹에 원본이 올라간다고 알린 뒤
친구가 「넣어 주세요」(웹에 올려도 되는 허락이 있는 것으로 확인). 가로 그림이라 세로 4:5 로 잘랐다(높이는 그대로 · 폭만 · 1080×1350 WebP q80).

| 파일 | 이름 | 원본 | 자른 자리 | 꼴 |
|---|---|---|---|---|
| `bg-maple` | 단풍길 | `Background 3.png`(1024×768) | 가운데 · 작아 키우면 거칠어 흐림 0.6 | photo(흰 글씨) |
| `bg-harvest` | 풍성 | `—Pngtree—happy thanksgiving background_15997619.jpg`(4368×2448) | 왼쪽 끝(바구니가 왼쪽) | veil(옅은 판 + 진한 글씨 — 흰 글씨가 바구니 위에서 어지러웠다) |
| `bg-watercolor` | 수채화 | `thanksgiving-basket-harvest-fruits.jpg`(5376×3072) | 오른쪽 끝(바구니가 오른쪽) | veil(바탕이 밝아 흰 글씨가 안 읽혔다) |

⚠️ 사진을 더하거나 빼면 `PRAY_SHARE_PHOTOS` 와 이 표를 함께 — `tests/pray-share.test.cjs` 가 파일(큰 그림 · 작은 그림)이 있는지 본다.

## 📖 말씀 액자 다섯(2026-11-05 · 친구 「이미지는 기존에 없던 것으로 · 말씀 액자이니 너무 크지 않게」)

첫 화면 「이번 주 말씀」 보내기 전용(`VERSE_FRAMES` · 기도문 · 묵상 판에는 안 나온다). Gemini `gemini-3-pro-image` · `aspectRatio 1:1` · `2K`(2048×2048) → 1080×1080 WebP q82.
같은 날 친구 「액자 밖 여백이 너무 많아요」 → 원본에서 액자 둘레 벽을 잘라 액자 긴 변이 960px 이 되게(위 28px · 아래 약 90px 은 설치 주소 한 줄 자리) 다시 만들었다.
여섯 장을 그려 다섯을 골랐다. 버린 것: 올리브(흰 테 · 연두 매트 — 안쪽 창이 너무 작아 글이 답답하다). 원본은 저장소 밖.
⚠️ 글 자리(`box`)와 마크 자리(`mark`)는 그림마다 눈금을 그려 잰 값이다 — 그림을 바꾸면 다시 잰다.

  > Square 1:1 image, straight-on front view, perfectly centered and symmetrical, an empty picture frame for displaying a Bible verse.
  > The inside area (the mat or paper) is completely plain and empty - no text, no letters, no symbols, no pattern in the center - and covers roughly the central 66 percent of the image.
  > Realistic, soft even lighting, high detail. No people, no text, no letters, no logo, no cross or religious symbols, no watermark.

| 파일 | 이름 | 장면 말 |
|---|---|---|
| `vf-hanji` | 한지 | A slim dark walnut wooden frame holding warm ivory Korean hanji mulberry paper with a subtle natural fiber texture, hanging on a light plaster wall. |
| `vf-gold` | 금테 | An elegant thin antique gold frame with fine carved edges holding soft cream cotton paper, on a warm off-white wall. |
| `vf-oak` | 원목 | A natural light oak wooden frame with a wide off-white linen mat, minimal Scandinavian style, on a soft beige wall. |
| `vf-wreath` | 꽃테 | No frame: a delicate watercolor wreath of small wildflowers and green leaves painted around the edges of white textured watercolor paper, soft pastel colors, the center left blank. |
| `vf-navy` | 남색 | (첫 그림 — 안쪽 창이 있어 글 자리가 좁았다 「글자가 작아요」) → 바꿈: A slim gold frame holding one single deep navy blue velvet mat that fills the whole inside of the frame edge to edge, with no inner window, no bevel and no second border - one flat calm navy surface, elegant. |

같은 날 셋째 판 — 다섯 장 모두 액자 긴 변 960px 을 위아래 가운데(60px)로 다시 잘랐다(아래 설치 줄 자리가 없어져서) · 한지는 오른쪽 그림자까지 넣어 가운데(「오른쪽 여백을 좀 더」).
같은 날 다섯째 판 — ⚠️ 그림자를 넣어 재니 한지 · 남색이 왼쪽 위로 밀렸다(친구 「첫번째 액자가 왼쪽으로 치우쳤어요」 · 「청색 글씨가 오른쪽으로」). 둘 다 **테두리 바깥 끝**(한지 호두나무 · 남색 금테 — 원본 2048 에서
한지 303~1745 · 남색 389~1657, 원본은 정확히 가운데)의 가운데로 다시 잘라 액자 긴 변 960 · 둘레 60. 작은 그림은 큰 그림 가운데를 4:5 로 잘라 128×160.
⚠️ 다시 자를 때 안쪽 바탕 끝을 자동으로 재지 말 것 — 테두리가 바탕에 그림자를 드리워 왼쪽 끝이 안으로 잡힌다. 글 자리(`box`)는 테두리 가운데에 맞춘다.

## 🎓 수험생 응원기도카드 다섯(2026-11-07 · 친구 「수능 이미지는 5개」)

`js/pray-share.js` `CARD_SETS.suneung.photos` — 카드 판에만 나온다(기도문 · 묵상 · 말씀 판에는 안 나온다). 말씀마다 첫 배경은 자료 `entries[i].photo`.
Gemini `gemini-3-pro-image` · `aspectRatio 4:5` · `2K`(1856×2304) → 가운데 4:5 → 1080×1350 WebP q80(잔무늬가 많은 은행잎은 흐림 0.8 · q68, 들녘은 흐림 0.6 · q72 — 150KB 안팎) · 작은 그림 128×160.
「그림 밖」 짜임은 같은 그림의 가운데 가로 띠(1000×560)를 잘라 쓴다(사진마다 `focus`) — 그래서 장면을 가운데 가로 띠에 두게 그렸다.
장면마다 두 장씩 그려 하나를 골랐다. 버린 것: 해돋이 b(여러 칸 콜라주로 나왔다 — 그 뒤 꼬리말에 「no collage」를 더했다) · 독수리 a(어둡고 오른쪽 위에 이음 자국) · 은행잎 b · 들녘 a · 물줄기 b. 원본은 저장소 밖.
해돋이에만 언덕 위 작은 나무 십자가가 있다(친구가 보여 준 참조 카드의 결 — 세 장 중 한 장 정도로).

꼬리말(장면 말 뒤에 그대로):

  > Vertical 4:5 landscape photograph, bright and hopeful, warm golden sunrise light, natural colors, high detail, professional photography.  No people, no text, no letters, no numbers, no watermark, no logo, no buildings, no city.  Keep the main scene in the central horizontal band of the frame, and keep the top right corner as plain sky.  One single continuous photograph — no collage, no panels, no inset pictures, no borders, no frames.

| 파일 | 이름 | 첫 배경으로 쓰는 말씀 | 고른 장 | 장면 말 |
|---|---|---|---|---|
| `card-suneung-1` | 해돋이 | 1 · 3 | 1a | A bright sunrise over soft green mountains and a calm lake, golden rays spreading across a pale blue sky with a few tiny birds far off, and a wildflower path winding up a gentle rocky hill to a small, plain, empty wooden cross with no figure on it. The main scene sits in the middle horizontal band of the portrait frame, with a soft meadow in the foreground. |
| `card-suneung-2` | 은행잎 | 2 · 4 | 2a | A quiet path carpeted with fallen golden ginkgo leaves beneath tall ginkgo trees, a few leaves still on the branches, with soft late-autumn morning light glowing toward a bright open sky. The path and trees sit in the middle horizontal band of the portrait frame. |
| `card-suneung-3` | 독수리 | 6 · 7 | 3b | A single small eagle soaring high and far away above layered misty mountain ridges at dawn, warm golden light touching the peaks in the middle horizontal band of the portrait frame. The valleys below fall into deep blue shadow toward the bottom. |
| `card-suneung-4` | 들녘 | 8 · 9 | 4b | Wide harvested rice paddies in mid-November, golden stubble divided by low earthen ridges, with bundled rice-straw sheaves standing in neat rows across the middle band of the portrait frame and gentle hazy hills beyond, under a bright, clear pale-blue sky with a few tiny birds far away. |
| `card-suneung-5` | 물줄기 | 5 · 10 | 5a | Several small streams winding down from late-autumn hills and joining into one wide, calm river that shines in warm late-afternoon light across the middle band of the portrait frame, with a few tiny birds high in the sky. The near slopes and riverbank in the lower third fall into deep shadow. |

⚠️ 그림을 바꾸면 `CARD_SETS.suneung.photos` · 이 표 · 시험(파일이 있는지)을 함께.

### 포근하고 따뜻한 다섯 더(2026-11-07 밤 · 친구 「배경 이미지는 포근하고 따뜻한 이미지로 5개 더」)

같은 꼴(Gemini 4:5 2K → 1080×1350 WebP · 작은 그림 128×160) · 장면마다 두 장(노을은 한 장 더)을 그려 하나를 골랐다. 첫 배경으로 정한 말씀은 없다(고르기 칸에서 고른다).
버린 것: 찻잔 b(세로 창살이 오른쪽 위를 가름) · 담요 a(오른쪽 위 나뭇가지) · 노을 a · b(하늘이 네모 칸으로 이어 붙음) · 첫눈 b(칸 나뉨) · 촛불 b(덜 포근 · 촛대 잘림).
⚠️ 다음에 그릴 때: 꼬리말의 「keep the top right corner as plain sky」가 하늘을 네모 칸으로 따로 칠하게 하는 일이 있다 — 장면 말에 「하늘은 이음매 없는 한 그라데이션」을 넣으면 낫다 · 방 안 장면은 「single-pane window with no crossbars」(십자 창살 = 십자가처럼 보임) · 「No animals」.

| 파일 | 이름 | 첫 배경으로 쓰는 말씀 | 고른 장 | 장면 말 |
|---|---|---|---|---|
| `card-suneung-6` | 찻잔 | — | 6a | A cozy study-desk still life on a quiet late-autumn evening: a steaming ceramic mug of tea glows in warm amber desk-lamp light on a wooden desk, beside a closed book with a plain cover and a blank notebook, both softly out of focus with no writing, all in the middle horizontal band of the portrait frame, with a small desk lamp at the far left edge. Behind the desk a large single-pane window with no crossbars shows only plain soft peach-and-blue twilight sky, especially in the top right; the lower third is the smooth warm wooden desktop. No animals. |
| `card-suneung-7` | 담요 | — | 7b | Warm golden low sunlight pouring through sheer linen curtains and a large single-pane window with no crossbars onto a chunky cream knitted blanket draped over a soft armchair, tiny dust motes glowing in the light, in the middle horizontal band of the portrait frame. The window shows only plain glowing sky in the top right, and the lower third is a warm wooden floor with soft long shadows. No animals. |
| `card-suneung-8` | 노을 | — | 8c | A single small round tree standing alone on top of a gentle grassy hill at sunset, wrapped in soft peach, rose and gold light, the hill and tree in the middle horizontal band of the portrait frame, with a few soft pink clouds near the horizon. The whole sky is one smooth, seamless, continuous gradient from edge to edge with no rectangular patches, and it stays plain and empty in the top right. The lower third is late-autumn grass on the near slope in warm, gentle shadow. No animals or birds. |
| `card-suneung-9` | 첫눈 | — | 9a | A small clearing at the edge of a quiet pine forest after the first light snow of early winter: a thin dusting of snow on the green pine branches and the ground, with warm golden morning sunbeams streaming softly between the trunks across the middle horizontal band of the portrait frame. Plain pale morning sky shows in the top right above the treetops, and the lower third is smooth, untouched snow with long soft blue shadows. No animals, no footprints. |
| `card-suneung-10` | 촛불 | — | 10a | A softly lit, cozy still life on a rustic wooden table in the early evening: three cream pillar candles of different heights glowing with warm candlelight, a few pinecones, dried cotton stems and small dried flowers on a natural linen cloth, in the middle horizontal band of the portrait frame, against a softly blurred warm background with gentle golden bokeh that stays plain in the top right. The lower third is the plain linen cloth in warm shadow. Not Christmas: no ornaments, no red ribbons, no evergreen garlands. No animals. |
