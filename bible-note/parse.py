# -*- coding: utf-8 -*-
"""bible/*.txt(개역개정, CP949) 를 「조각」 목록으로 파싱한다.

파일 한 줄은 대개 `약자N:M <소제목>? 본문` 꼴이다(예: `유1:1 <인사> 예수 그리스도의…`).
소제목 안에 다른 책의 장:절 인용이 그대로 들어있는 경우가 있다
(예: `<세례 요한의 증언(마 3:1-12; 막 1:7-8; 눅 3:15-17)>`) — `<...>` 안을 통째로 잡으므로 문제없다.

조각 하나 = 인쇄되는 문단 하나. 보통은 절 하나가 조각 하나다. 키:
  book · chapter · verse(합쳐진 절은 첫 절) · subtitle · body       — 처음부터 있던 것
  part          같은 절의 몇 번째 조각(끊긴 줄이면 1, 2 …)
  verse_end     합쳐진 절의 끝 절(`롬9:1-2` → 2). 아니면 None
  heading       권 제목(「제일권」). 없으면 None
  label         번호 칸에 찍을 글자(마침표 빼고). 합쳐진 절 '1-2', 끊긴 조각 ''
  chapter_start 그 장(요청 범위 안)의 첫 조각이면 True — 장 표시(「1장」·「1편」)를 이 위에 찍는다

⚠️ 원문에는 절 번호로 시작하지 않는 꼴이 셋 있다(66권을 훑어 확인 — 권 제목 5 · 끊긴 줄 45 ·
   합쳐진 절 11, 어느 꼴에도 안 맞는 줄 0). Task 1 은 이 줄을 만나면 **멈췄다**. 2026-09-22 성도님
   결정(「방법 2」)으로 **이 세 꼴에 한해** 인쇄 성경처럼 읽는다 — 그 밖의 줄은 여전히 멈춘다.
   ① 권 제목 `시1:제일권`(시편 1·42·73·90·107편 첫 줄) → 바로 다음 절 조각의 heading.
      다음 줄이 같은 장의 절이 아니거나 파일 끝이면 멈춘다.
   ② 끊긴 절 `요5:이 날은 안식일이니` — 소제목 자리에서 한 절이 두 줄로 나뉘어 뒷줄에 절 번호가
      없다. 건너뛰면 절 뒷부분이 빠진 채 인쇄된다 → 바로 앞 조각과 같은 절의 다음 조각(part+1,
      번호 칸은 비움). 앞 조각이 없거나 다른 장이면 멈춘다.
      ⚠️ 끊긴 줄의 소제목은 「첫 낱말 뒤」에 끼어 있다 — 원문은 한 줄의 첫 낱말(보통 `요1:1`) 뒤에
      `<소제목>` 을 두는데, 끊긴 줄은 `요12:예수께서` 가 붙어 한 낱말이다. 뜻은 「소제목 →
      예수께서 이 말씀을 하시고 …」이므로 본문 = 첫 낱말 + ' ' + 나머지로 둔다.
   ③ 합쳐진 절 `롬9:1-2 …` — 두세 절을 한 줄로 번역한 곳. 그냥 읽으면 「-2 <소제목> …」가 본문으로
      찍힌다 → verse=1, verse_end=2, 번호 칸 「1-2.」.
   「절 번호가 끊기면 멈춘다」는 넣지 않는다 — 사도행전 24장은 개역개정 본문에 7절이 없다.
⚠️ 어느 꼴이든 본문·소제목에 `<` · `>` 가 남으면 멈춘다(닫히지 않은 소제목 · 떨어진 꺾쇠).
   그대로 두면 꺾쇠가 본문 글자로 인쇄된다. 끊긴 줄의 첫 낱말은 `<` 를 먹지 않는다 —
   `요5:<소제목> 이 날은` 은 소제목 「소제목」 + 본문 「이 날은」이다(2026-09-22 최종 검토 r5
   Minor 2 — 예전 `(\\S*)` 는 `<소제목>` 을 첫 낱말로 삼아 꺾쇠째 본문에 찍었다. 개역개정 66권에는
   이런 줄이 없고, 다른 번역본을 넣을 때 드러날 자리다).
"""
import os
import re

# 줄 맨 앞 약자 자리(`유` · `요일` · `Jude` …) — **글자만**(한글 · 영문 등). 숫자 · 공백 · 밑줄 · 괄호 ·
# 따옴표 · 낫표 · 꺾쇠 · 콜론 · 기호는 올 수 없다.
# ⚠️ 예전엔 `\D+`(숫자 아닌 무엇이든)여서, 본문만 있는 줄 안에 `3:16` 같은 장:절이 있으면 그 앞까지를
#    약자로 알고 **다른 장·절로 조용히** 읽었다 — `(요 3:16 참고) 그들에게 화가 있을진저` 가
#    3장 16절이 되어 유다서 사본이 5쪽 · 25절 → 6쪽 · 26절로 바뀌었다(2026-09-22 가이드 대조 2차 A9).
#    이제 그런 줄은 어느 꼴에도 안 맞아 「장·절 번호가 없는 줄」로 멈춘다(틀린 채 인쇄하느니 멈춘다).
#    개역개정 66권의 약자 66개는 모두 한글뿐이라 그대로 읽힌다(test_parse 의 66권 테스트).
#    `Jude 1:3` 처럼 약자와 장 번호 사이에 공백을 두어도 멈춘다 — 붙여 적는다(`Jude1:3`).
#    처음엔 `[^\d\s()<>:]+` 로 좁혔는데 `「요3:16」 참고` · `[요3:16]` · `“요3:16”` · `※요3:16` 은 여전히
#    절로 읽혔다(Minor 2차 검토) — 글자만(`[^\W\d_]`) 받는다. 66권 31,138줄에서 두 틀의 결과는 같다.
#    남은 틈: 한글 낱말에 장:절이 붙은 채 시작하는 본문 줄(`참고요3:16 …`)은 진짜 절 줄과 구별할 수 없다.
ABBR = r'[^\W\d_]+'

# 순서가 뜻을 가진다 — 권 제목·합쳐진 절을 보통 절·끊긴 줄보다 먼저 본다
# (`시1:제일권` 은 끊긴 줄 꼴에도, `롬9:1-2` 는 보통 절 꼴에도 맞기 때문이다).
HEADING_RE = re.compile(r'^' + ABBR + r'(\d+):(제[일이삼사오]권)\s*$')
MERGED_RE = re.compile(r'^' + ABBR + r'(\d+):(\d+)-(\d+)\s*(?:<([^>]*)>)?\s*(.*)$')
VERSE_RE = re.compile(r'^' + ABBR + r'(\d+):(\d+)\s*(?:<([^>]*)>)?\s*(.*)$')
CONT_RE = re.compile(r'^' + ABBR + r'(\d+):([^\s<]*)\s*(?:<([^>]*)>)?\s*(.*)$')
FILENAME_RE = re.compile(r'^\d+-\d+(.+)\.txt$')


class SourceTextError(ValueError):
    """원문 파일 문제(읽을 수 없는 줄 · 인코딩) — 성도님이 원문을 고치면 풀린다.

    generate.main() 이 이 종류만 골라 트레이스백 대신 `!! …` 한 줄로 보인다
    (2026-09-22 최종 검토 r5 Minor 4). ValueError 를 이어받아 예전처럼 잡을 수도 있다.
    """


def load_book_file(path):
    """원문 파일을 읽는다 — UTF-8(BOM 있어도)을 먼저, 안 되면 CP949.

    bible/ 의 개역개정은 CP949 이고, 메모장의 기본 저장은 UTF-8 이다(2026-09-22 — 영어·다른
    번역본을 넣을 때 필요하다). CP949 로 저장한 한글은 UTF-8 로 풀리지 않으므로 순서가 안전하다.
    """
    with open(path, 'rb') as f:
        raw = f.read()
    for enc in ('utf-8-sig', 'cp949'):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    raise SourceTextError('%s: UTF-8 도 CP949 도 아닌 파일입니다 — 메모장에서 UTF-8 로 다시 저장해 주세요'
                          % path)


def book_name_from_filename(path):
    """'bible/2-26유다서.txt' -> '유다서'"""
    base = os.path.basename(path)
    m = FILENAME_RE.match(base)
    if not m:
        raise ValueError('책 이름을 뽑을 수 없습니다: %s' % base)
    return m.group(1)


def _classify(line):
    """(꼴, match) — 꼴은 'heading' · 'merged' · 'verse' · 'cont', 어디에도 안 맞으면 (None, None)."""
    m = HEADING_RE.match(line)
    if m:
        return 'heading', m
    m = MERGED_RE.match(line)
    if m:
        return 'merged', m
    m = VERSE_RE.match(line)
    if m:
        return 'verse', m
    m = CONT_RE.match(line)
    if m and not m.group(2)[:1].isdigit():
        return 'cont', m
    return None, None


def parse_book(text, book_name, chapter=None):
    """성경 파일 전체 텍스트를 조각 목록으로 바꾼다(키는 모듈 머리 참고).

    chapter 를 주면 그 장만 남긴다(요한복음처럼 여러 장인 책에서 1장만 뽑을 때 쓴다) —
    권 제목·끊긴 줄도 자기 장을 따른다. 권 제목·끊긴 줄·합쳐진 절 셋 밖의 절 번호 없는 줄,
    이을 앞 절이 없는 끊긴 줄, 절이 뒤따르지 않는 권 제목, 본문·소제목에 남은 꺾쇠(`<` · `>`)가
    그 장(chapter 가 None 이면 어느 장이든)에 있으면 SourceTextError(ValueError · 몇 번째 줄인지).
    장 번호조차 없는 줄은 어느 장이든 멈춘다 — 본문만 있는 줄 속의 `3:16` 도 장 번호로 치지
    않는다(약자 자리 ABBR 참고).
    """
    pieces = []
    pending = None        # (줄 번호, 장, 권 제목) — 다음 절 조각에 붙기를 기다린다
    started = set()       # 첫 조각을 이미 낸 장

    def stop(lineno, why, line):
        raise SourceTextError('%s %d번째 줄: %s — %s' % (book_name, lineno, why, line[:40]))

    for lineno, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        kind, m = _classify(line)
        if kind is None:
            stop(lineno, '장·절 번호가 없는 줄이라 어느 절인지 알 수 없습니다', line)
        ch = int(m.group(1))
        if pending is not None:
            h_lineno, h_ch, h_text = pending
            if kind not in ('verse', 'merged') or ch != h_ch:
                stop(h_lineno, '권 제목 「%s」 다음 줄이 같은 장의 절이 아닙니다' % h_text, line)
        if chapter is not None and ch != chapter:
            continue

        if kind == 'heading':
            pending = (lineno, ch, m.group(2))
            continue

        if kind == 'cont':
            prev = pieces[-1] if pieces else None
            if prev is None or prev['chapter'] != ch:
                stop(lineno, '절 번호가 없는 줄인데 바로 앞에 같은 장의 절이 없어 어느 절에 '
                             '이어지는지 알 수 없습니다', line)
            first, subtitle, rest = m.group(2), m.group(3), m.group(4).strip()
            body = ' '.join(s for s in (first, rest) if s)
            if not body:
                stop(lineno, '절 번호도 본문도 없는 줄입니다', line)
            verse, verse_end, part, label = prev['verse'], prev['verse_end'], prev['part'] + 1, ''
        elif kind == 'merged':
            _, a, b, subtitle, body = m.groups()
            verse, verse_end, part = int(a), int(b), 0
            label = '%d-%d' % (verse, verse_end)
        else:
            _, vs_s, subtitle, body = m.groups()
            verse, verse_end, part = int(vs_s), None, 0
            label = str(verse)

        if any(c in s for s in (body, subtitle or '') for c in '<>'):
            stop(lineno, '소제목 꺾쇠(< >)가 짝이 맞지 않습니다', line)

        heading = None
        if pending is not None:
            heading = pending[2]
            pending = None
        pieces.append({
            'book': book_name,
            'chapter': ch,
            'verse': verse,
            'subtitle': subtitle,
            'body': body.strip(),
            'part': part,
            'verse_end': verse_end,
            'heading': heading,
            'label': label,
            'chapter_start': ch not in started,
        })
        started.add(ch)

    if pending is not None:
        h_lineno, h_ch, h_text = pending
        stop(h_lineno, '권 제목 「%s」 뒤에 절이 없습니다(파일 끝)' % h_text, h_text)
    return pieces
