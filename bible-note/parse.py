# -*- coding: utf-8 -*-
"""bible/*.txt(개역개정, CP949) 를 절 목록으로 파싱한다.

파일 한 줄은 `약자N:M <소제목>? 본문` 꼴이다(예: `유1:1 <인사> 예수 그리스도의…`).
소제목 안에 다른 책의 장:절 인용이 그대로 들어있는 경우가 있다
(예: `<세례 요한의 증언(막 1:7-8; 눅 3:15-17)>`) — `<...>` 안을 통째로 잡으므로 문제없다.
"""
import os
import re

VERSE_RE = re.compile(r'^\D+(\d+):(\d+)\s*(?:<([^>]*)>)?\s*(.*)$')
FILENAME_RE = re.compile(r'^\d+-\d+(.+)\.txt$')


def load_book_file(path):
    """CP949 로 저장된 성경 파일을 읽어 유니코드 문자열로 돌려준다."""
    with open(path, 'rb') as f:
        raw = f.read()
    return raw.decode('cp949')


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
    """
    verses = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        m = VERSE_RE.match(line)
        if not m:
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
