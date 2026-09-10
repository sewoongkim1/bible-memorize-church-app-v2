# 액자 잎가지 — 만든 법과 실패담

가정 축복 기도문 「크게 보기」와 시편 말씀 액자가 함께 쓰는 소재다.
**색(금색·군청) × 잎가지(1~12) = 24가지 얼굴**을 만든다.

| 번호 | 그림 | 출처 |
|---|---|---|
| 1 | 유칼립투스 | 말씀카드 원본 `leafT1.png` |
| 2 | 유칼립투스와 열매 | `leafT2.png` |
| 3 | 유칼립투스와 올리브잎 | `leafT3.png` |
| 4 | 흰꽃 | `leafT4.png` |
| 5 | 올리브가지 | `leafT5.png` |
| 6 | 밀이삭 | `leafT6.png` |
| 7 | 들꽃 | AI 생성 2026-09-10 |
| 8 | 백합 | AI 생성 2026-09-10 |
| 9 | 은방울꽃 | AI 생성 2026-09-10 |
| 10 | 포도 | AI 생성 2026-09-10 |
| 11 | 무화과 | AI 생성 2026-09-10 |
| 12 | 석류 | AI 생성 2026-09-10 |

1~6은 `C:\Projects\말씀카드_B7\소재`(이 컴퓨터에만 있다)에서 왔고,
7~12는 2026-09-10에 새로 그렸다(시편 말씀 액자에서 12종이 필요해서).
**결과 webp 만 저장소에 있다** — 원본 PNG는 장당 3~6MB라 넣지 않는다.
다시 만들 일이 없으면 그대로 쓰면 된다.

---

## 만드는 법

```bash
python tools/frame-art.py                # 1~6 (말씀카드 원본, 이미 투명)
python tools/frame-art.py --from <폴더>   # 7~12 (7.png..12.png, 배경이 흰색·크림)
```

높이 600px WebP, 품질 72, **`alpha_quality=70`**.
⚠️ `alpha_quality` 를 빠뜨리면 기본값 100(무손실)이라 **파일이 두 배**가 된다.

---

## 프롬프트 (7~12)

모델 `nano_banana_pro` · 가로세로 **2:3** · 장당 2 크레딧.

**화풍 문구는 한 글자도 바꾸지 말 것** — 1~6과 나란히 놓이므로 조금만 달라도
「같은 액자」로 안 보인다. `[소재]` 자리만 갈아 끼운다.

```
[소재]

Delicate watercolor botanical illustration with soft translucent washes and
fine hair-thin ink stems. Muted sage green and warm soft gold palette, gentle
earth tones, nothing saturated. Plain flat white background. Vertical
composition, the sprig standing alone with generous empty space around it,
edges fading softly into the bare paper. No border, no frame, no rectangle,
no shadow, no pot, no vase, no text, no human figures. Quiet and reverent,
like a pressed botanical study.
```

⚠️ 금지어는 `no faces` 가 아니라 **`no human figures`** 다 —
`no faces` 면 새·짐승까지 걸린다(말씀 연상 그림에서 31번 참새가 그랬다).

| 번호 | `[소재]` |
|---|---|
| 7 | `A single slender wildflower sprig standing alone: one fine arching stem with small five-petal blossoms in pale cream and soft blush, tiny narrow leaves along the stem.` |
| 8 | `A single upright lily stem standing alone: two open white lilies with softly washed petals and three long slender leaves.` |
| 9 | `A single arching sprig of lily-of-the-valley standing alone: a gently curving stem hung with small white bell-shaped blossoms, two broad soft green leaves at the base.` |
| 10 | `A single grapevine sprig standing alone: one small hanging cluster of dusty deep-purple grapes, two broad lobed vine leaves and a curling tendril.` (팔레트에 `muted plum accents` 를 더했다) |
| 11 | `A single fig branch standing alone: one ripe fig in dusty muted violet hanging from a slim branch, with two deeply lobed fig leaves.` (`soft violet accents`) |
| 12 | `A single pomegranate branch standing alone: one ripe pomegranate in soft muted terracotta with its little crown, and three narrow glossy leaves on a slim stem.` (`soft terracotta accents`) |

---

## 실패담 — 배경 빼기에서 세 번 틀렸다

새로 그린 여섯 장은 **배경이 투명이 아니라 옅은 종이색**이라 그대로 넣으면
액자 위에 네모가 뜬다. 빼는 데 세 번 틀렸고, 셋 다 **잘라내기가 안 먹는 것**으로
먼저 드러났다(결과가 전부 같은 크기 403×600, 파일이 정상의 두세 배).

**① 네 귀퉁이 색과의 거리로 잡았다 → 실패.**
새 그림의 배경은 한 색이 아니라 **옅은 그라데이션**이다.
실측: `leaf9~12` 의 알파 16~199 구간이 각각 **88~91%** — 그림 전체가 반투명으로 남았다.
→ 밝기와 채도 두 가지로 바꿨다(종이는 밝고 무채색, 물감은 어둡거나 색이 있다).

**② 불감대를 안 뒀다 → 실패.**
종이 밝기가 **238~249 로 11 단계 흔들린다**(원본 `10.png` 실측).
그 흔들림이 그대로 알파 67 짜리 안개가 됐다.
→ 「종이보다 `LUM_DEAD`(16) 이상 어두울 때부터」 세기 시작한다.

**③ 종이가 늘 무채색인 줄 알았다 → `leaf9` 만 실패.**
은방울꽃 배경이 **따뜻한 크림**이라 채도 기준(`SAT_DEAD` 고정값)에 배경이 통째로 걸렸다.
→ **종이 밝기에 해당하는 화소들의 채도를 그림마다 재서** 기준으로 쓴다(`paper_sat`).

**그리고 색을 되돌린다(unpremultiply).**
안 하면 반투명한 가장자리가 종이색과 섞여 **뿌옇게 뜬 테두리**가 남는다 —
크림 바탕에 얹으면 그게 그대로 보인다.

⚠️ **다음에 배경 빼기가 이상하면 숫자부터 보라.** 결과가 전부 같은 크기로 나오면
잘라내기가 실패한 것이고, 그건 배경이 안 빠졌다는 뜻이다:

```python
from PIL import Image
a = Image.open("img/frame/leaf9.webp").convert("RGBA").getchannel("A")
n = a.width * a.height
h = a.histogram()
print("투명", 100*h[0]/n, "잡티(1~15)", 100*sum(h[1:16])/n, "중간", 100*sum(h[16:200])/n)
```
정상이면 **투명이 74~90%** 다. 「중간」이 80%를 넘으면 배경이 안 빠진 것이다.
