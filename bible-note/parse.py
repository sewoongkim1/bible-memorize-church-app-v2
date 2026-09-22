# -*- coding: utf-8 -*-
"""bible/*.txt(개역개정, CP949) 를 절 목록으로 파싱한다.

파일 한 줄은 대개 `약자N:M <소제목>? 본문` 꼴이다(예: `유1:1 <인사> 예수 그리스도의…`).
소제목 안에 다른 책의 장:절 인용이 그대로 들어있는 경우가 있다
(예: `<세례 요한의 증언(마 3:1-12; 막 1:7-8; 눅 3:15-17)>`) — `<...>` 안을 통째로 잡으므로 문제없다.

⚠️ 예외가 둘 있다 — 요청한 장에 있으면 **멈춘다**(ValueError, 몇 번째 줄인지 알린다).
   ① 소제목이 절 한가운데 끼면 한 절이 두 줄로 나뉘고 뒷줄에는 절 번호가 없다
      (`요5:이 날은 안식일이니`, 성경 전체 50개·21권). 건너뛰면 그 절 뒷부분이 빠진 채 인쇄된다.
   ② 여러 절이 한 줄로 합쳐진 줄(`롬9:1-2 …`, 11개). 그냥 읽으면 1절 하나로 잡혀
      「-2 <소제목> …」가 본문으로 찍히고 2절 번호가 사라진다.
   제대로 된 처리(이어 붙이기·합친 절 표기)는 66권으로 넓힐 때 한다(2026-09-22 결정).
   원문 66권을 훑어 확인한 이상한 꼴은 이 둘뿐이다. 「절 번호가 끊기면 멈춘다」는 넣지 않는다 —
   사도행전 24장은 개역개정 본문에 7절이 없다.
"""
import os
import re

VERSE_RE = re.compile(r'^\D+(\d+):(\d+)\s*(?:<([^>]*)>)?\s*(.*)$')
CHAPTER_RE = re.compile(r'^\D+(\d+):')
MERGED_RE = re.compile(r'^\D+\d+:\d+-\d+')
FILENAME_RE = re.compile(r'^\d+-\d+(.+)\.txt$')


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
    raise ValueError('%s: UTF-8 도 CP949 도 아닌 파일입니다 — 메모장에서 UTF-8 로 다시 저장해 주세요' % path)


def book_name_from_filename(path):
    """'bible/2-26유다서.txt' -> '유다서'"""
    base = os.path.basename(path)
    m = FILENAME_RE.match(base)
    if not m:
        raise ValueError('책 이름을 뽑을 수 없습니다: %s' % base)
    return m.group(1)


def parse_book(text, book_name, chapter=None):
    """성경 파일 전체 텍스트를 절 목록으로 바꾼다.

    chapter 를 주면 그 장만 남긴다(요한복음처럼 여러 장인 책에서 1장만 뽑을 때 쓴다).
    절 번호 없이 이어지는 줄이나 여러 절이 합쳐진 줄이 그 장(chapter 가 None 이면 어느 장이든)에
    있으면 ValueError.
    """
    verses = []
    for lineno, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        m = VERSE_RE.match(line)
        merged = MERGED_RE.match(line)
        if not m or merged:
            c = CHAPTER_RE.match(line)
            if c is None or chapter is None or int(c.group(1)) == chapter:
                if merged:
                    why = '여러 절이 한 줄로 합쳐져 있어 절마다 나눌 수 없습니다'
                elif c is None:
                    # 장 번호조차 없다(예: 순수 머리말 줄) — 절 번호만 없는 경우와 구분한다
                    # (2026-09-22 최종 검토 Minor).
                    why = '장·절 번호가 없는 줄이라 어느 절인지 알 수 없습니다'
                else:
                    why = '절 번호가 없는 줄이라 어느 절인지 알 수 없습니다'
                raise ValueError('%s %d번째 줄: %s — %s' % (book_name, lineno, why, line[:40]))
            continue
        ch_s, vs_s, subtitle, body = m.groups()
        ch = int(ch_s)
        if chapter is not None and ch != chapter:
            continue
        verses.append({
            'book': book_name,
            'chapter': ch,
            'verse': int(vs_s),
            'subtitle': subtitle,
            'body': body.strip(),
        })
    return verses
