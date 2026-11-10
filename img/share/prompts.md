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

## 💌 늘 쓰는 기념일 다섯(2026-11-07 밤 · 친구 「늘 쓰는 축하, 위로만 먼저 진행」)

`js/pray-share.js` `CARD_SETS.<카드>.photos` — 기념일마다 셋 · 같은 꼴(Gemini 4:5 2K → 1080×1350 WebP · 작은 그림 128×160) · 장면마다 두 장을 그려 하나(병문안 창가는 두 장 더).
위로는 도구 꼬리말의 「warm golden sunrise light」와 결이 어긋나 장면 말에 「hushed · quiet · no visible sun disk · no sun rays」를 넣었다 · 병문안 2번은 새 출발 「새싹」과 겹치지 않게 「창가」(창가 화분 · 새잎)로 바꿨다 · 생일 풍선은 「plain balloons with no printing」.

| 파일 | 기념일 | 이름 | 고른 장 | 장면 말 |
|---|---|---|---|---|
| `card-birthday-1` | 생일 | 꽃밭 | 1a | A bright meadow of small pastel wildflowers (soft pink, white, pale lavender and butter yellow) stretching in a wide band across the middle of the portrait frame, gentle morning sunlight from the left, soft dewy glow, and a clear pale sky left open in the upper right; the sky is one seamless continuous gradient from cream near the horizon to pale blue above. Light, airy, high-key photograph. No people, no animals, no insects, no text. |
| `card-birthday-2` | 생일 | 아침해 | 2a | A warm sunrise over gentle rolling green hills, golden light spreading in a broad band across the middle of the portrait frame, the sun low on the horizon a little left of center, soft mist resting in the valleys and deeper shadows along the bottom of the frame, with open glowing sky in the upper right; the sky is one seamless continuous gradient from gold to soft peach to pale blue. No people, no animals, no buildings, no roads, no fences, no trees in the upper right, no text. |
| `card-birthday-3` | 생일 | 풍선 | 3a | A bunch of plain balloons with no printing — smooth solid pastel colors only (blush pink, cream, mint green, pale lavender, soft yellow) — on thin white ribbons, gathered together and floating just above a green meadow of small wildflowers across the middle of the portrait frame, gentle morning light, light wispy clouds and empty pale blue sky in the upper right; the sky is one seamless continuous gradient. The balloons are completely blank and glossy: no letters, no numbers, no words, no patterns, no logos on them. No people, no hands, no animals, no cake, no signs, no text anywhere. |
| `card-wedding-1` | 결혼기념일 | 장미길 | 1b | A gently curving garden path through a rose garden in full bloom, white, ivory and blush pink roses spilling over both edges of the path, a few fallen petals on the path. The path leads from the bottom center into the middle of the portrait frame and fades into soft golden morning light and distant green foliage. The sky above is pale warm light, completely open and empty in the upper right. Bright, soft, luminous, pastel high-key photograph. No arches, no gates, no benches, no fences, no lamps, no statues, no buildings. No animals, no birds, no butterflies, no insects. The sky is one seamless continuous gradient. No rings, no wedding decorations, no hearts drawn or arranged. No people, no text. |
| `card-wedding-2` | 결혼기념일 | 두 나무 | 2a | Two mature trees of similar size standing side by side, close together, on the crest of a gentle grassy hill at golden hour, seen from a distance so both whole trees, trunks and full rounded crowns, sit inside the central horizontal band of the portrait frame. Their branches reach toward each other and meet in the middle. Warm backlight from a low sun near the horizon, long soft shadows across the darker grass in the lower part of the frame. Above the trees, open warm sky, completely empty in the upper right. No fences, no benches, no swing, no paths, no buildings. No animals, no birds, no butterflies, no insects. The sky is one seamless continuous gradient. No rings, no wedding decorations, no hearts drawn or arranged. No people, no text. |
| `card-wedding-3` | 결혼기념일 | 백조 | 3b | Two white swans swimming side by side on a still lake at sunset, seen from low near the water, sharply in focus in the central horizontal band of the portrait frame, their reflections clear in the calm water. Warm gold and rose sunlight glows across the middle of the lake, gentle mist over the water, a low dark tree line on the far shore, the foreground water darker at the bottom. The sky is open, soft and luminous in the upper right. Exactly two adult swans, no other birds, no cygnets, no other animals, no boats, no docks, no buildings. The sky is one seamless continuous gradient. No rings, no wedding decorations, no hearts drawn or arranged. No people, no text. |
| `card-newstart-1` | 새 출발 | 새싹 | 1a | A low eye-level close-up of fresh young green sprouts, each with two tiny round leaves, rising from soft dark early-spring soil in a wide natural row across the middle of the portrait frame, dewdrops sparkling on the leaves in gentle morning light. Behind them a softly blurred meadow fades into a pale, clear sky; the sky is one seamless continuous gradient and the upper right is open, empty sky. The lower part is soft, out-of-focus soil in light, calm tones. Growing naturally in open ground - no pots, no seedling trays, no garden tools, no fences. No animals, no insects, no people, no text. |
| `card-newstart-2` | 새 출발 | 오솔길 | 2b | A narrow forest trail of soft earth and pine needles curving toward a glowing opening of light in the center of the portrait frame, gentle sunbeams streaming through tall evergreen pines, green ferns and moss along the edges, deep soft shadows across the bottom of the frame. The canopy opens in the upper right to plain, bright pale sky; the sky is one seamless continuous gradient. Timeless season - evergreen trees only, no blossoms, no autumn colors, no fallen leaves, no snow. No signposts, no benches, no fences, no railings, no stairs, no lamps, no animals, no people, no text. |
| `card-newstart-3` | 새 출발 | 매화 | 3a | Graceful dark branches of white plum blossoms (maehwa) reaching in from the left and spreading across the middle of the portrait frame, round five-petaled white flowers with golden stamens blooming directly on bare twigs, soft early-spring sunlight glowing through the petals. Behind them a clear, soft blue sky that fades to a pale, light tone toward the bottom; the sky is one seamless continuous gradient. The upper right and the lower part are open, empty sky. No birds, no animals, no people, no text. |
| `card-comfort-1` | 위로 | 물안개 | 1a | A still lake at early dawn wrapped in soft morning mist, the first pale gold light glowing behind low, gentle hills across the middle horizontal band of the portrait frame. Calm tones of soft blue and warm cream, with the upper right sky left plain and empty. The sky is one seamless continuous gradient. The mood is hushed, quiet and consoling: soft muted colors, nothing vivid or saturated, no visible sun disk, no sun rays, no lens flare. The lower third is calm, still water softly reflecting the mist. Pure untouched nature only - no man-made objects of any kind, no animals. |
| `card-comfort-2` | 위로 | 골짜기 | 2b | A peaceful valley seen from a gently shaded slope: a narrow stream winds through soft green meadows between rounded hills, and soft light from a break in the clouds falls on the meadow and the stream in the middle horizontal band of the portrait frame. The foreground slope at the bottom is in calm, cool shade with soft grass, darker but never black. The sky is one seamless, continuous soft grey-blue expanse, and the upper right sky is plain. Muted natural colors, quiet and consoling, not dramatic, no sunburst. Lush living greenery, no bare branches. Pure untouched nature only - no man-made objects of any kind, no animals. No paths, no fences. |
| `card-comfort-3` | 위로 | 들꽃 | 3b | A low, eye-level view across a quiet meadow: a loose scatter of tiny, delicate white wildflowers with dew drops on their petals and thin green stems stands in soft grass in the middle horizontal band of the portrait frame, the far meadow dissolving into a soft pale blur. Above, a softly blurred, pale, misty sky; the sky is one seamless continuous gradient and the upper right is empty. Calm, gentle, diffused morning light. The mood is hushed, quiet and consoling: soft muted colors, nothing vivid or saturated, no visible sun disk, no sun rays, no lens flare. Wild flowers growing naturally in the grass, not picked or arranged. The lower third is soft out-of-focus green grass. No insects. Pure untouched nature only - no man-made objects of any kind, no animals. |
| `card-healing-1` | 병문안 | 숲볕 | 1a | Warm morning sunbeams streaming through tall green trees into a quiet forest clearing of soft moss and ferns, the glowing light gathered in the middle horizontal band of the portrait frame. The forest floor toward the bottom rests in deep, calm green shade, and the canopy opens to plain pale sky at the upper right; the sky is one seamless continuous gradient. A sheltering, restful and hopeful mood. No animals, no paths, no benches, no man-made objects. |
| `card-healing-2` | 병문안 | 창가 | 2c | A small terracotta pot with a young green plant unfolding a few fresh new leaves, standing on a pale wooden windowsill in soft early morning sunlight. Composition: the pot and the whole plant sit exactly in the vertical middle of the portrait frame, inside the central horizontal band; the windowsill surface is at about two thirds of the frame height, and below it the lower third of the frame is only the plain, softly lit cream wall under the window. A large single-pane window with no crossbars fills the upper two thirds behind the plant, showing only a softly blurred bright green garden and pale morning sky; the sky is one seamless continuous gradient, and the upper right is plain bright sky. Airy, bright, calm and hopeful. No animals, no other objects, no curtains, no furniture, no bed. |
| `card-healing-3` | 병문안 | 들길 | 3a | A narrow footpath of soft earth winding gently through a fresh green meadow with small scattered wildflowers toward soft rolling hills under a clear, bright morning sky, the path and hills in the middle horizontal band of the portrait frame. Warm early light across the grass. The sky is one seamless continuous gradient, and the upper right sky is left plain and empty. Hopeful, peaceful and open. No animals, no fences, no signs, no poles. |

⚠️ 그림을 바꾸면 `자료/card/tools/build_cards.py` 의 사진 목록(photos.json) · 이 표 · 시험(파일이 있는지)을 함께.

## 🎄 철마다 — 성탄 · 새해(2026-11-10 · 친구 「성탄절, 송구영신·새해」 · gemini-3-pro-image 4:5 2K → 1080×1350 WebP · 꼬리말은 gen_img.py 와 같음)

| 파일 | 이름 | 고른 것 | 장면(영어 그대로) | 버린 것 |
|---|---|---|---|---|
| `card-christmas-1` | 눈 언덕 | 1a | A calm winter night over gentle snow-covered hills, with one bright star shining low above the horizon and its soft glow lighting the snow across the middle band. Deep blue sky, quiet and peaceful; keep the upper-right corner plain and uncluttered. | 1b 는 오른쪽 위에 네모 얼룩 |
| `card-christmas-2` | 눈숲 | 2b | Snow-covered pine trees in a quiet forest at dusk, lit only by the low setting sun glowing golden between the trunks across the middle band while gentle snowflakes fall; keep the upper-right corner plain and uncluttered. | 2a 는 오른쪽 위에 네모 얼룩 |
| `card-christmas-3` | 설경 | 3h | A bright snowy meadow on a clear winter morning, a few frosted evergreen trees with small clusters of red winter berries, soft warm sunlight, pale blue sky, fresh untouched snow, calm and joyful Christmas mood. One natural upright portrait photograph filling the whole frame, horizon level. | 3a · 3d · 3g 는 옆으로 누움 · 3b · 3c · 3e · 3f 는 가운데·옆에 네모 칸 — 장면 말에서 「across the middle band」를 빼고 다시 그림 |
| `card-newyear-1` | 해돋이 | 1a | The first sunrise of the year rising over a calm winter sea, the golden sun just above the horizon in the middle band with a shimmering path of light on the water; keep the upper-right corner plain and uncluttered. | 1b 도 깨끗함(바닷가 모래) — 겨울 바위가 든 1a |
| `card-newyear-2` | 새길 | 2b | A snow-covered path winding through a quiet open field toward distant hills under a soft pink and lavender sky just before sunrise, fresh snow, the path and the glowing horizon in the middle band; keep the upper-right corner plain and uncluttered. | 2a 는 여러 칸 콜라주 |
| `card-newyear-3` | 눈꽃 | 3b | Bright frost-covered tree branches sparkling across the middle band against a clear pale-blue winter sky in fresh morning light, white and silver tones; keep the upper-right corner plain and uncluttered. | 3a 는 옆으로 누움 |

⚠️ 장면 말에 「across the middle band」를 넣으면 모델이 가운데에 따로 그린 네모 칸을 끼우거나 그림을 옆으로 눕히는 일이 잦았다(성탄 셋째 여덟 장 중 일곱 장) — 「한 장의 사진 · 수평선 수평」으로 쓰면 깨끗했다.
