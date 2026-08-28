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
