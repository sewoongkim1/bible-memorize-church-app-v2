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

⚠️ 사진을 더하거나 빼면 `PRAY_SHARE_PHOTOS` 와 이 표를 함께 — `tests/pray-share.test.cjs` 가 파일(큰 그림 · 작은 그림)이 있는지 본다.
