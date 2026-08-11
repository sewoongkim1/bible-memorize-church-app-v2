# -*- coding: utf-8 -*-
"""말씀 광고 슬라이드용 프롬프트 생성 — PPT 애드인에 붙여 쓰는 용도.
   포스터(C안)와 같은 서식으로 32구절을 시리즈로 뽑을 수 있게 만든다."""
import json, io, re, csv

vs = json.load(io.open('verses.json', encoding='utf-8'))
vs = vs.get('verses', vs) if isinstance(vs, dict) else vs
vs = sorted(vs, key=lambda v: v['no'])
ss = json.load(io.open('sermons.json', encoding='utf-8'))
ss = ss.get('sermons', ss) if isinstance(ss, dict) else ss
by_no = {s['memVerseNo']: s for s in ss if s.get('memVerseNo')}

EVENT_MAX = 12          # 이벤트 출제 범위(1~12번)


# 자동 규칙이 서술어나 대명사를 고른 구절만 손으로 지정한다(핵심어가 가려져야 광고가 산다)
BLANK_FIX = {
    5: '소유', 11: '여호와께서', 13: '주가', 15: '갈렙', 18: '지혜',
    23: '복음', 28: '견고', 30: '기쁨', 32: '외모',
}


def blank_word(text, no=None):
    """가릴 낱말 하나 — 가장 긴 어절(동률이면 뒤쪽). 핵심어에 잘 걸린다.
       조사가 붙은 어절은 통째로 가리면 문장이 어색해져, 뒤 조사는 남긴다."""
    toks = text.split()
    fix = BLANK_FIX.get(no)
    if fix:
        for i, t in enumerate(toks):
            if t.startswith(fix):
                toks[i] = '＿＿＿' + t[len(fix):]
                return ' '.join(toks), fix
    # 맨 끝 어절과 서술어·연결어는 뺀다 — 문장 끝이 뚫리면 퀴즈 맛이 떨어지고,
    # 가운데 핵심 낱말이 가려져야 "저게 뭐였더라" 하고 떠올리게 된다.
    PRED = re.compile(r'(다|라|니라|하며|하면|려고|으라|리니|지라)$')
    cand = [i for i in range(len(toks))
            if not (len(toks) >= 4 and i == len(toks) - 1) and not PRED.search(toks[i])]
    if not cand:
        cand = list(range(len(toks)))
    best = max(cand, key=lambda i: (len(toks[i]), -i))   # 가장 긴 것, 동률이면 앞쪽
    w = toks[best]
    # 흔한 조사/어미는 남겨 문장 흐름을 지킨다
    m = re.match(r'^(.+?)(이요|이니이다|으로|에게|에서|하고|이며|을|를|은|는|이|가|의|에|과|와|도|께)$', w)
    if m and len(m.group(1)) >= 2:
        head, tail = m.group(1), m.group(2)
    else:
        head, tail = w, ''
    toks[best] = '＿＿＿' + tail
    return ' '.join(toks), head


STYLE = """[공통 스타일 — 첫 슬라이드 만들 때 한 번만 붙여넣고, 이후에는 '같은 서식으로'라고만 하세요]

A4 세로(21×29.7cm) 교회 포스터. 배경 흰색, 아주 옅은 모눈.
위아래에 남색(#10204A) 이중 가로선(굵은 선 + 가는 선).
글꼴은 맑은 고딕. 제목은 남색 굵게, 강조는 벽돌빨강(#C0392B),
박스는 크림색(#FDFAF0) 바탕에 금색(#C9A24B) 테두리, 모서리 둥글게.
장식 그림·사람 사진 없이 글자와 여백으로만 구성. 가운데 정렬.
하단에 고척교회 로고와 'gocheok.onlybible.kr'.
"""

HEAD = """# 말씀 광고 슬라이드 프롬프트 (32구절)

PowerPoint 애드인에 **한 구절씩** 붙여넣어 슬라이드를 만드는 용도입니다.

**먼저 읽어 주세요**
- 애드인이 *이미지 생성* 방식이면 **한글이 깨집니다.** AI 이미지 모델은 한글을 제대로 못 씁니다.
  *슬라이드(텍스트 상자) 생성* 방식의 애드인에 쓰세요.
- 빈칸은 앱 이벤트와 같은 방식으로 **어절 하나**만 가렸습니다. 괄호 안이 정답입니다.
- 1~12번은 이번 이벤트 출제 범위, 13~32번은 이후 광고용입니다.

"""


rows = []
out = [HEAD, STYLE, '\n---\n']
for v in vs:
    s = by_no.get(v['no']) or {}
    quiz, ans = blank_word(v['text'], v['no'])
    tag = '이벤트 출제' if v['no'] <= EVENT_MAX else '일반 광고'
    p = (
        "%02d번 · %s  (%s)\n"
        "```\n"
        "같은 서식으로 슬라이드 한 장 만들어 줘.\n"
        "· 상단 작은 글씨(빨강): 이 빈칸, 채우실 수 있나요?\n"
        "· 가운데 큰 글씨(남색, 크림 박스 안): %s\n"
        "· 그 아래 작은 글씨(보라): %s\n"
        "· 그 아래 한 줄(빨강 굵게): 정답은 QR로 확인하세요\n"
        "· 하단 박스: 참여 기간 8월 16일 — 9월 30일 / "
        "참여하신 성도님께는 기념품을 드립니다\n"
        "· 맨 아래: 고척교회 로고, gocheok.onlybible.kr\n"
        "```\n"
        "정답: **%s** · 전문: %s\n"
        % (v['no'], v['refFull'], tag, quiz, v['refFull'], ans, v['text'])
    )
    out.append(p)
    rows.append({
        '번호': v['no'], '구분': tag, '출처': v['refFull'],
        '빈칸 문장': quiz, '정답': ans, '구절 전문': v['text'],
        '설교 제목': s.get('title', ''),
        '쉬운 풀이': (s.get('easyExplain') or '')[:160],
    })

io.open('말씀광고_프롬프트.md', 'w', encoding='utf-8').write('\n'.join(out))

with io.open('말씀광고_프롬프트.csv', 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)

print('done', len(rows))
