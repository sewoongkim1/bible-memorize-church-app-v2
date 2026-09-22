# 성경 필사노트 가로형 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bible/*.txt`(개역개정 성경 전체 66권, CP949)에서 한 권(또는 한 장)을 뽑아,
A4 가로(297×210mm) · 왼쪽 원문 / 오른쪽 필사줄 구조의 HTML 파일을 만든다. 브라우저에서
바로 `Ctrl+P`로 인쇄한다.

**Architecture:** 파싱(`parse.py`) → 1차 렌더링(원문만, `render.py`) → 헤드리스 크롬으로
절마다 실제 줄 수 실측(`generate.py`) → 페이지 배분(`paginate.py`) → 2차 렌더링(원문+필사줄,
`render.py`) → 검증(`verify.py`). 「기독교 고전 소책자」(`booklet/generate_classics.py`)가
쓴 것과 같은 2단계 그리기 패턴이다.

**Tech Stack:** Python 3(표준 라이브러리 + pytest), 헤드리스 Chrome(이 PC에 설치됨),
Noto Serif KR(SIL OFL, 최초 실행 시 자동 다운로드), pymupdf(검증의 인쇄 확인에만 — 이 PC에 설치됨).

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-09-22-bible-landscape-note-design.md` — 모든 태스크가 이 문서의 결정을 따른다.
- 새 폴더는 `bible-note/`. 기존 `booklet/`(기독교 고전 소책자 전용)과 섞지 않는다.
- 페이지: 297×210mm, 여백 13mm, 헤더 12mm, 푸터 8mm → **가용 본문 높이 164mm**.
- 줄 높이: **9.5mm** 고정 → **페이지당 17줄**(161.5mm 사용, 여유 2.5mm).
- 좌우 폭(가용폭 271mm 기준): 원문 열 **38%**(102.98mm) : 필사 열 **62%**(168.02mm).
  두 열 모두 세로선 쪽으로 안쪽 여백 **4mm**.
- **1차(실측)와 2차(인쇄)의 원문 열 폭·안쪽 여백은 반드시 같은 CSS 규칙 하나**에서 나온다.
  다르면 줄바꿈 지점이 달라져 필사줄 수가 어긋난다.
- **원문 한 줄 = 필사줄 한 줄**: 원문 절의 각 줄과 그 절의 필사줄이 같은 높이에서 시작한다.
  소제목은 필사 열에서도 원문 쪽과 **같은 높이**를 차지한다(필사 열이 넓어 더 적은 줄로 끝나도).
- 인쇄는 `@page { size: A4 landscape; margin: 0; }` 로 가로가 저절로 잡힌다.
- 서체: Noto Serif KR. 절 중간에서 페이지를 자르지 않는다. 소제목은 바로 다음 절과 한 묶음.
- 산출물은 HTML 파일만(PDF 변환 없음). 로고·표어·자유메모 페이지는 넣지 않는다.
- **만든 HTML과 서체는 커밋하지 않는다** — `bible-note/*.html`·`bible-note/fonts/`·`bible-note/_*`를
  `.gitignore`에 넣는다. HTML에는 개역개정 본문이 통째로 들어 있다(`bible/`을 이미 같은 이유로 빼 두었다 —
  대한성서공회 저작물, 공개 저장소).
- 이번 범위는 유다서(1장 전체) · 요한복음 1장 두 견본뿐이다. 66권 자동화는 범위 밖.

**이 PC(Windows + Git Bash)에서 지킬 것:**
- `python`을 쓴다(`python3`은 윈도 스토어 껍데기라 실패한다).
- 한글을 출력하는 스크립트는 `PYTHONIOENCODING=utf-8 python …`으로 돌린다(콘솔이 cp949라 깨지거나 멈춘다).
- 커밋은 경로를 못 박는다: 먼저 `git diff --cached --name-only`로 남이 올려 둔 것이 없는지 보고,
  `git add -- <경로>` → `git commit -m "…" -- <경로>`. `git add -A`·`git add .` 금지. **푸시하지 않는다.**
- 커밋 메시지 끝줄: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

### Task 1: `parse.py` — 성경 텍스트 파싱

**Files:**
- Create: `bible-note/parse.py`
- Test: `bible-note/tests/test_parse.py`

**Interfaces:**
- Produces:
  - `load_book_file(path: str) -> str` — CP949 파일을 읽어 유니코드 문자열로 반환
  - `book_name_from_filename(path: str) -> str` — `'bible/2-26유다서.txt'` → `'유다서'`
  - `parse_book(text: str, book_name: str, chapter: int | None = None) -> list[dict]` —
    각 원소는 `{'book': str, 'chapter': int, 'verse': int, 'subtitle': str | None, 'body': str}`

- [ ] **Step 1: 폴더와 실패하는 테스트 작성**

`bible-note/tests/test_parse.py`:
```python
# -*- coding: utf-8 -*-
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from parse import parse_book, book_name_from_filename, load_book_file

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
JUDE = os.path.join(ROOT, 'bible', '2-26유다서.txt')
JOHN = os.path.join(ROOT, 'bible', '2-04요한복음.txt')

# bible/ 은 .gitignore 로 저장소에서 뺀 폴더다(개역개정 저작권). 원문이 없는 PC 에서는
# 실제 파일을 읽는 테스트만 건너뛴다 — 가짜 문자열로 하는 나머지 테스트는 어디서든 돈다.
needs_bible = pytest.mark.skipif(
    not (os.path.exists(JUDE) and os.path.exists(JOHN)),
    reason='bible/ 원문이 없는 PC(저장소에서 뺀 폴더)')


def test_parse_simple_verse():
    text = "유1:1 예수 그리스도의 종이요 야고보의 형제인 유다는"
    verses = parse_book(text, '유다서')
    assert len(verses) == 1
    assert verses[0] == {
        'book': '유다서', 'chapter': 1, 'verse': 1,
        'subtitle': None, 'body': '예수 그리스도의 종이요 야고보의 형제인 유다는',
    }


def test_parse_verse_with_subtitle():
    text = "유1:1 <인사> 예수 그리스도의 종이요"
    verses = parse_book(text, '유다서')
    assert verses[0]['subtitle'] == '인사'
    assert verses[0]['body'] == '예수 그리스도의 종이요'


def test_parse_subtitle_with_nested_reference():
    # 소제목 안에 다른 책의 장:절 인용이 통째로 들어있는 경우(요한복음 1:19 실제 원문 형태)
    text = "요1:19 <세례 요한의 증언(막 1:7-8; 눅 3:15-17)> 유대인들이 예루살렘에서"
    verses = parse_book(text, '요한복음')
    assert verses[0]['subtitle'] == '세례 요한의 증언(막 1:7-8; 눅 3:15-17)'
    assert verses[0]['body'] == '유대인들이 예루살렘에서'


def test_parse_filters_by_chapter():
    text = "요1:1 태초에\n요2:1 사흘째 되던 날"
    verses = parse_book(text, '요한복음', chapter=1)
    assert len(verses) == 1
    assert verses[0]['chapter'] == 1


def test_parse_keeps_all_chapters_when_chapter_is_none():
    text = "요1:1 태초에\n요2:1 사흘째 되던 날"
    verses = parse_book(text, '요한복음')
    assert len(verses) == 2


def test_parse_skips_blank_lines():
    text = "유1:1 예수 그리스도의\n\n유1:2 긍휼과 평강과"
    verses = parse_book(text, '유다서')
    assert len(verses) == 2
    assert [v['verse'] for v in verses] == [1, 2]


def test_book_name_from_filename():
    assert book_name_from_filename('bible/2-26유다서.txt') == '유다서'
    assert book_name_from_filename('2-04요한복음.txt') == '요한복음'
    assert book_name_from_filename('1-01창세기.txt') == '창세기'


@needs_bible
def test_load_book_file_decodes_cp949():
    text = load_book_file(JUDE)
    assert '유1:1' in text
    assert '예수 그리스도의 종이요' in text


@needs_bible
def test_parse_actual_jude_file_has_25_verses():
    verses = parse_book(load_book_file(JUDE), '유다서')
    assert len(verses) == 25
    assert verses[0]['verse'] == 1
    assert verses[-1]['verse'] == 25


@needs_bible
def test_parse_actual_john_chapter1_has_51_verses():
    verses = parse_book(load_book_file(JOHN), '요한복음', chapter=1)
    assert len(verses) == 51
    assert all(v['chapter'] == 1 for v in verses)
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `cd bible-note && python -m pytest tests/test_parse.py -v`
Expected: `ModuleNotFoundError: No module named 'parse'` (아직 `parse.py`가 없다)

- [ ] **Step 3: `parse.py` 구현**

`bible-note/parse.py`:
```python
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
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `cd bible-note && python -m pytest tests/test_parse.py -v`
Expected: `10 passed` (이 PC에는 `bible/`이 있으므로 건너뛰는 테스트가 없어야 한다)

- [ ] **Step 5: 커밋**

```bash
git diff --cached --name-only        # 비어 있어야 한다 — 남이 올려 둔 것이 있으면 멈추고 보고
git add -- bible-note/parse.py bible-note/tests/test_parse.py
git commit -m "feat(성경필사노트): 성경 텍스트 파싱

bible/*.txt(CP949)에서 절 목록을 뽑는다. 소제목 안에 다른 책 인용이
그대로 들어있는 경우(요1:19)도 정규식이 <...> 를 통째로 잡아 안전하다.
원문 파일을 읽는 테스트는 bible/ 이 없는 PC 에서 건너뛴다(저장소에서 뺀 폴더).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- bible-note/parse.py bible-note/tests/test_parse.py
```

---

### Task 2: `paginate.py` — 페이지 배분 알고리즘

**Files:**
- Create: `bible-note/paginate.py`
- Test: `bible-note/tests/test_paginate.py`

**Interfaces:**
- Consumes: `parse.py`가 만드는 절 dict에 `'lines'`(정수, 그 절이 차지하는 총 줄 수 —
  소제목 줄과 본문 줄을 이미 합친 값)가 더해진 리스트. `'lines'` 키는 Task 4에서
  실측 결과로 채워진다.
- Produces: `paginate(verses: list[dict], lines_per_page: int) -> list[list[dict]]`

- [ ] **Step 1: 실패하는 테스트 작성**

`bible-note/tests/test_paginate.py`:
```python
# -*- coding: utf-8 -*-
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from paginate import paginate


def test_paginate_fits_on_one_page():
    verses = [{'verse': i, 'lines': 2} for i in range(1, 6)]  # 5개 * 2줄 = 10줄
    pages = paginate(verses, lines_per_page=17)
    assert len(pages) == 1
    assert len(pages[0]) == 5


def test_paginate_splits_across_pages():
    verses = [{'verse': i, 'lines': 5} for i in range(1, 5)]  # 4개 * 5줄 = 20줄
    pages = paginate(verses, lines_per_page=17)
    # 5+5+5=15 는 17줄 안에 들어가지만, 네 번째(20)는 못 들어간다
    assert len(pages) == 2
    assert [v['verse'] for v in pages[0]] == [1, 2, 3]
    assert [v['verse'] for v in pages[1]] == [4]


def test_paginate_never_splits_a_single_verse():
    verses = [{'verse': 1, 'lines': 10}, {'verse': 2, 'lines': 10}]
    pages = paginate(verses, lines_per_page=17)
    assert len(pages) == 2
    assert pages[0] == [verses[0]]
    assert pages[1] == [verses[1]]


def test_paginate_oversized_verse_gets_its_own_page():
    # 17줄보다 큰 절은 있을 수 없다고 가정하지만, 방어적으로 혼자 페이지를 차지한다
    verses = [{'verse': 1, 'lines': 30}]
    pages = paginate(verses, lines_per_page=17)
    assert len(pages) == 1
    assert len(pages[0]) == 1


def test_paginate_empty_list_returns_empty():
    assert paginate([], lines_per_page=17) == []


def test_paginate_exact_fit_does_not_overflow_to_new_page():
    verses = [{'verse': 1, 'lines': 9}, {'verse': 2, 'lines': 8}]  # 정확히 17줄
    pages = paginate(verses, lines_per_page=17)
    assert len(pages) == 1
    assert len(pages[0]) == 2
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `cd bible-note && python -m pytest tests/test_paginate.py -v`
Expected: `ModuleNotFoundError: No module named 'paginate'`

- [ ] **Step 3: `paginate.py` 구현**

`bible-note/paginate.py`:
```python
# -*- coding: utf-8 -*-
"""절 목록을 페이지에 순서대로 채운다.

⚠️ 절 중간에서 페이지를 자르지 않는다 — 한 절(소제목 포함)의 'lines' 가 통째로
   한 페이지에 들어간다. 소제목은 parse.py 단계에서 이미 그 절 dict 안에 붙어
   있으므로(별도 원소가 아니다) 여기서 따로 다룰 것이 없다.
"""


def paginate(verses, lines_per_page):
    if not verses:
        return []
    pages = []
    current = []
    remaining = lines_per_page
    for v in verses:
        need = v['lines']
        if current and need > remaining:
            pages.append(current)
            current = []
            remaining = lines_per_page
        current.append(v)
        remaining -= need
    if current:
        pages.append(current)
    return pages
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `cd bible-note && python -m pytest tests/test_paginate.py -v`
Expected: `6 passed`

- [ ] **Step 5: 커밋**

```bash
git diff --cached --name-only        # 비어 있어야 한다
git add -- bible-note/paginate.py bible-note/tests/test_paginate.py
git commit -m "feat(성경필사노트): 절을 페이지에 배분하는 알고리즘

절 중간에서 페이지를 자르지 않는다 — 실측한 줄 수를 보고 순서대로
쌓다가 남은 자리에 안 들어가면 새 페이지로 넘긴다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- bible-note/paginate.py bible-note/tests/test_paginate.py
```

---

### Task 3: `render.py` — HTML 렌더링 (1차 초안 + 2차 최종)

**Files:**
- Create: `bible-note/render.py`
- Test: `bible-note/tests/test_render.py`

**Interfaces:**
- Consumes: `parse.py`의 절 dict(1차), `paginate.py`가 만든 페이지 목록(`list[list[dict]]`, 2차).
  2차의 절 dict에는 `'lines'`(총 줄 수)와 `'sub_lines'`(그중 소제목 줄 수 — 없으면
  소제목이 있을 때 1, 없을 때 0으로 본다)가 있다.
- Produces:
  - 상수: `PAGE_W_MM=297`, `PAGE_H_MM=210`, `MARGIN_MM=13`, `HEADER_MM=12`,
    `FOOTER_MM=8`, `LINE_MM=9.5`, `ORIG_PCT=38`, `COL_PAD_MM=4`, `FONT_PT=12`, `FONT_URL`, `BASE_CSS`
  - `usable_body_mm() -> float` (=164), `lines_per_page() -> int` (=17)
  - `orig_width_mm() -> float` (=102.98), `write_width_mm() -> float` (=168.02)
  - `esc(text: str | None) -> str` — `html.escape` 래퍼(None·빈 문자열은 `''`)
  - `build_draft_html(verses: list[dict]) -> str` — 실측용, 페이지 없이 원문만
  - `build_final_html(pages: list[list[dict]], book: str) -> str` — 인쇄용 최종본

**Note:** 실제 브라우저 렌더링 결과(줄 수)는 pytest로 검증할 수 없다(서체·헤드리스 크롬이
필요하다). 여기서는 **생성된 HTML 문자열 안에 필요한 구조가 있는지**를 확인하고, 실제
렌더링 검증은 Task 5(`verify.py`)가 헤드리스 크롬으로 한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`bible-note/tests/test_render.py`:
```python
# -*- coding: utf-8 -*-
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from render import (
    BASE_CSS, build_draft_html, build_final_html, esc,
    lines_per_page, orig_width_mm, usable_body_mm, write_width_mm,
)


def _v(verse, lines=1, subtitle=None, body='본문', **extra):
    d = {'book': '유다서', 'chapter': 1, 'verse': verse,
         'subtitle': subtitle, 'body': body, 'lines': lines}
    d.update(extra)
    return d


def test_usable_body_mm_is_164():
    assert usable_body_mm() == 164


def test_lines_per_page_is_17():
    assert lines_per_page() == 17


def test_column_widths():
    assert orig_width_mm() == 102.98
    assert write_width_mm() == 168.02


def test_esc_handles_none_and_empty():
    assert esc(None) == ''
    assert esc('') == ''
    assert esc('A&B') == 'A&amp;B'


def test_draft_html_has_data_attributes_for_each_verse():
    html = build_draft_html([
        _v(1, subtitle='인사', body='예수 그리스도의'),
        _v(2, body='긍휼과 평강과'),
    ])
    assert 'data-ch="1" data-vs="1" data-role="sub"' in html
    assert 'data-ch="1" data-vs="1" data-role="body"' in html
    assert 'data-ch="1" data-vs="2" data-role="body"' in html
    assert 'data-ch="1" data-vs="2" data-role="sub"' not in html
    assert '예수 그리스도의' in html
    assert '인사' in html


def test_draft_html_has_no_page_elements():
    assert 'class="page"' not in build_draft_html([_v(1)])


def test_draft_and_final_share_orig_col_rule():
    # 실측(1차)과 인쇄(2차)의 원문 열 폭·안쪽 여백이 같은 CSS 규칙 하나에서 나와야
    # 줄바꿈 지점이 같다. 2차에서 인라인 style 로 폭을 따로 주면 이 약속이 깨진다.
    draft = build_draft_html([_v(1)])
    final = build_final_html([[_v(1)]], '유다서')
    assert '.orig-col { width:102.98mm; padding-right:4mm; }' in BASE_CSS
    assert BASE_CSS in draft
    assert BASE_CSS in final
    assert 'class="orig-col" style=' not in final


def test_final_html_has_one_page_div_per_page():
    html = build_final_html([[_v(1)], [_v(2)]], '유다서')
    assert html.count('class="page"') == 2


def test_final_html_write_col_has_matching_blank_line_count():
    html = build_final_html([[_v(1, lines=3)]], '유다서')
    assert html.count('class="ln"') == 3


def test_final_html_subtitle_line_does_not_add_blank_lines():
    # 소제목 1줄 + 본문 2줄 = lines 3 인데, 필사줄은 본문 몫(2개)만 있어야 한다
    # (소제목은 빈칸이 아니라 원문·필사 양쪽에 그대로 굵게 반복된다)
    html = build_final_html([[_v(1, lines=3, subtitle='인사')]], '유다서')
    assert html.count('class="ln"') == 2
    assert html.count('인사') == 2  # 원문 열 한 번 + 필사 열 한 번


def test_final_html_two_line_subtitle_keeps_rows_aligned():
    # 긴 소제목이 원문 열에서 2줄이면, 필사 열(더 넓다)에서 1줄로 끝나더라도
    # 높이를 2줄(19mm)로 못박아야 아래 필사줄이 원문 줄과 같은 높이에서 시작한다.
    html = build_final_html([[_v(19, lines=5, sub_lines=2,
                                 subtitle='세례 요한의 증언(막 1:7-8; 눅 3:15-17)')]], '요한복음')
    assert html.count('class="ln"') == 3
    assert '<div class="sub" style="height:19mm">' in html


def test_final_html_header_shows_verse_range():
    html = build_final_html([[_v(6), _v(7)]], '유다서')
    assert '유다서 1:6 ~ 1:7' in html


def test_final_html_page_numbers_increment():
    html = build_final_html([[_v(1)], [_v(2)]], '유다서')
    assert '<span class="pg">1</span>' in html
    assert '<span class="pg">2</span>' in html


def test_final_html_prints_a4_landscape():
    html = build_final_html([[_v(1)]], '유다서')
    assert '@page { size: A4 landscape; margin: 0; }' in html
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `cd bible-note && python -m pytest tests/test_render.py -v`
Expected: `ModuleNotFoundError: No module named 'render'`

- [ ] **Step 3: `render.py` 구현**

`bible-note/render.py`:
```python
# -*- coding: utf-8 -*-
"""HTML 생성 — 1차(실측용 초안)와 2차(인쇄용 최종본).

⚠️ 페이지 기하(여백·헤더·푸터·줄 높이·열 폭)는 이 파일의 상수에서만 나온다.
   `generate.py`의 페이지 배분도 lines_per_page() 를 그대로 쓴다 — 두 곳에서 따로
   계산하면 나중에 한쪽만 고쳐 어긋난다.
⚠️ 원문 열의 폭·안쪽 여백은 BASE_CSS 의 `.orig-col` 규칙 하나가 정한다. 1차·2차가
   이 규칙을 같이 쓰므로 실측한 줄바꿈이 인쇄본에서도 그대로 나온다. 2차에서 폭을
   인라인 style 로 따로 주지 말 것.
"""
import html as _html

PAGE_W_MM = 297
PAGE_H_MM = 210
MARGIN_MM = 13
HEADER_MM = 12
FOOTER_MM = 8
LINE_MM = 9.5
ORIG_PCT = 38      # 원문 열이 가용폭에서 차지하는 비율(퍼센트)
COL_PAD_MM = 4     # 세로선 쪽 안쪽 여백 — 원문 열 오른쪽, 필사 열 왼쪽
FONT_PT = 12

FONT_URL = {
    'fonts/NotoSerifKR-400.woff':
        'https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-kr@5.3.0/'
        'files/noto-serif-kr-korean-400-normal.woff',
    'fonts/NotoSerifKR-700.woff':
        'https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-kr@5.3.0/'
        'files/noto-serif-kr-korean-700-normal.woff',
}


def esc(text):
    return _html.escape(text or '')


def _mm(x):
    """19.0 -> '19', 9.5 -> '9.5' — CSS 에 쓸 mm 값."""
    return ('%.2f' % x).rstrip('0').rstrip('.')


def usable_body_mm():
    """페이지에서 여백·헤더·푸터를 뺀, 원문/필사가 쓸 수 있는 세로 길이."""
    return PAGE_H_MM - 2 * MARGIN_MM - HEADER_MM - FOOTER_MM


def lines_per_page():
    """9.5mm 줄 하나가 몇 개나 들어가는지."""
    return int(usable_body_mm() // LINE_MM)


def _avail_width_mm():
    return PAGE_W_MM - 2 * MARGIN_MM


def orig_width_mm():
    return round(_avail_width_mm() * ORIG_PCT / 100.0, 2)


def write_width_mm():
    return round(_avail_width_mm() - orig_width_mm(), 2)


BASE_CSS = """
@font-face { font-family:'NSK'; src:url('fonts/NotoSerifKR-400.woff') format('woff');
             font-weight:400; font-display:block; }
@font-face { font-family:'NSKB'; src:url('fonts/NotoSerifKR-700.woff') format('woff');
             font-weight:400; font-display:block; }
* { box-sizing:border-box; }
html, body { margin:0; }
body { font-family:'NSK',serif; color:#111; }
.orig-col { width:%(ow)smm; padding-right:%(pad)smm; }
.orig-col p, .orig-col .sub, .write-col .sub {
  font-size:%(fpt)spt; line-height:%(line)smm; margin:0; word-break:keep-all;
}
.orig-col .sub, .write-col .sub { font-family:'NSKB',serif; font-weight:400; }
.orig-col .num { font-family:'NSKB',serif; font-weight:400; margin-right:1.5mm; }
""" % {'ow': orig_width_mm(), 'pad': COL_PAD_MM, 'fpt': FONT_PT, 'line': LINE_MM}


def build_draft_html(verses):
    """1차 그리기 — 페이지를 나누지 않고 원문 열만 그린다.

    각 절(과 소제목)에 data-ch/data-vs/data-role 을 붙여, 브라우저에서
    실제로 몇 줄로 찍혔는지 그 속성으로 찾아 잴 수 있게 한다.
    """
    parts = []
    for v in verses:
        if v['subtitle']:
            parts.append(
                '<div class="sub" data-ch="%d" data-vs="%d" data-role="sub">%s</div>'
                % (v['chapter'], v['verse'], esc(v['subtitle'])))
        parts.append(
            '<p data-ch="%d" data-vs="%d" data-role="body">'
            '<span class="num">%d.</span>%s</p>'
            % (v['chapter'], v['verse'], v['verse'], esc(v['body'])))
    return (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<style>%s</style></head>'
        '<body><div class="orig-col">%s</div></body></html>'
        % (BASE_CSS, ''.join(parts))
    )


PAGE_CSS = """
@page { size: A4 landscape; margin: 0; }
.page { width:%(w)smm; height:%(h)smm; padding:%(m)smm; background:#fff; }
@media print {
  .page { page-break-after:always; }
  .page:last-of-type { page-break-after:auto; }
}
.hd { height:%(hh)smm; display:flex; justify-content:space-between; align-items:flex-end;
      padding-bottom:1.5mm; border-bottom:0.75pt solid #333; font-size:11pt; }
.hd .date { color:#555; letter-spacing:.05em; }
.row { height:%(rh)smm; display:flex; }
.orig-col { flex:0 0 auto; overflow:hidden; }
.write-col { flex:0 0 auto; width:%(ww)smm; padding-left:%(pad)smm;
             border-left:0.75pt solid #ccc; overflow:hidden; }
.write-col .ln { height:%(line)smm; border-bottom:0.5pt solid #999; }
.ft { height:%(fh)smm; display:flex; align-items:center; justify-content:center;
      font-size:9pt; color:#555; }
""" % {'w': PAGE_W_MM, 'h': PAGE_H_MM, 'm': MARGIN_MM, 'hh': HEADER_MM,
       'rh': usable_body_mm(), 'fh': FOOTER_MM, 'line': LINE_MM,
       'ww': write_width_mm(), 'pad': COL_PAD_MM}


def _page_html(page_verses, book, page_no):
    first, last = page_verses[0], page_verses[-1]
    rng = '%s %d:%d ~ %d:%d' % (book, first['chapter'], first['verse'],
                                 last['chapter'], last['verse'])
    orig_parts = []
    write_parts = []
    for v in page_verses:
        sub_lines = v.get('sub_lines', 1 if v['subtitle'] else 0)
        if v['subtitle']:
            orig_parts.append('<div class="sub">%s</div>' % esc(v['subtitle']))
            # 필사 열은 더 넓어 같은 소제목이 더 적은 줄로 끝날 수 있다 — 높이를 원문 쪽
            # 실측 줄 수에 못박아야 아래 필사줄이 원문 줄과 같은 높이에서 시작한다.
            write_parts.append('<div class="sub" style="height:%smm">%s</div>'
                               % (_mm(sub_lines * LINE_MM), esc(v['subtitle'])))
        orig_parts.append(
            '<p><span class="num">%d.</span>%s</p>' % (v['verse'], esc(v['body'])))
        body_lines = v['lines'] - sub_lines
        write_parts.append(
            '<div class="vs-write">%s</div>' % ('<div class="ln"></div>' * body_lines))
    return (
        '<div class="page">'
        '<div class="hd"><span class="rng">%s</span>'
        '<span class="date">____년 __월 __일</span></div>'
        '<div class="row">'
        '<div class="orig-col">%s</div>'
        '<div class="write-col">%s</div>'
        '</div>'
        '<div class="ft"><span class="pg">%d</span></div>'
        '</div>'
        % (esc(rng), ''.join(orig_parts), ''.join(write_parts), page_no)
    )


def build_final_html(pages, book):
    """2차 그리기 — 페이지별로 원문 열 + 필사줄 열을 나란히 그린다."""
    page_divs = [_page_html(pg, book, i + 1) for i, pg in enumerate(pages)]
    return (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<title>%s 필사노트</title>'
        '<style>%s%s</style></head><body>%s</body></html>'
        % (esc(book), BASE_CSS, PAGE_CSS, ''.join(page_divs))
    )
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `cd bible-note && python -m pytest tests/test_render.py -v`
Expected: `14 passed`

- [ ] **Step 5: 커밋**

```bash
git diff --cached --name-only        # 비어 있어야 한다
git add -- bible-note/render.py bible-note/tests/test_render.py
git commit -m "feat(성경필사노트): HTML 렌더링 (1차 초안 · 2차 최종)

페이지 기하를 render.py 상수에 모았다. 원문 열 폭·안쪽 여백은 1차·2차가 함께
쓰는 CSS 규칙 하나에서 나와, 실측한 줄바꿈이 인쇄본에서도 그대로 나온다.
소제목은 필사 열에서도 원문과 같은 높이를 차지해 필사줄이 한 줄씩 밀리지 않는다.
@page 로 A4 가로 인쇄가 저절로 잡힌다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- bible-note/render.py bible-note/tests/test_render.py
```

---

### Task 4: `generate.py` — CLI 파이프라인 (크롬 실측 통합) · 유다서 첫 생성

**Files:**
- Create: `bible-note/generate.py`
- Modify: `.gitignore` (프로젝트 루트, 파일 끝에 한 묶음 추가)

**Interfaces:**
- Consumes: `parse.parse_book/load_book_file`, `render.build_draft_html/build_final_html/lines_per_page/FONT_URL`,
  `paginate.paginate`
- Produces:
  - `find_chrome() -> str | None`
  - `ensure_fonts() -> None`
  - `find_book_file(book_name: str) -> str` — `bible/` 안에서 그 책 파일을 찾는다
  - `measure_lines(html_path: str, chrome: str) -> dict[tuple[int, int, str], int] | None`
    — 키는 `(chapter, verse, 'body'|'sub')`, 값은 실측 줄 수
  - `generate(book_name: str, chapter: int | None = None, out_path: str | None = None) -> str`
  - 절 dict에 `'lines'`(총 줄 수)와 `'sub_lines'`(소제목 줄 수)를 채운다
  - CLI: `python generate.py <책이름> [--chapter N] [--out 파일명]`

이 태스크는 실제 헤드리스 크롬을 부르므로 pytest 유닛 테스트로 감쌀 수 없다.
**실행 자체가 테스트**다 — 유다서를 실제로 만들어 본다.

⚠️ **줄 수는 「높이 ÷ 줄 높이」로 잰다.** 원문 문단은 `<p><span class="num">1.</span>본문…</p>`
꼴이라 `Range.getClientRects()`로 상자를 세면 첫 줄에서 절 번호 상자·그 안 글자·본문 조각이
따로 잡혀 **첫 줄을 두세 번 센다.** 줄 높이가 9.5mm로 고정이므로 높이를 줄 높이로 나누면
정확하다.

- [ ] **Step 1: `.gitignore`에 한 묶음 추가**

프로젝트 루트 `.gitignore` 끝에 다음을 더한다:
```
# 성경 필사노트(bible-note/) — 서체는 없으면 generate.py 가 받아 온다.
# ⚠️ 만든 HTML 에는 개역개정 본문이 통째로 들어 있다 — 위 bible/ 와 같은 이유(저작권 ·
#    공개 저장소)로 올리지 않는다. _로 시작하는 것은 실측·검증 중에 잠깐 생기는 파일이다.
bible-note/fonts/
bible-note/*.html
bible-note/_*
```

- [ ] **Step 2: `generate.py` 작성**

`bible-note/generate.py`:
```python
# -*- coding: utf-8 -*-
"""성경 필사노트(가로형) 생성기.

사용법:
    cd bible-note
    PYTHONIOENCODING=utf-8 python generate.py 유다서
    PYTHONIOENCODING=utf-8 python generate.py 요한복음 --chapter 1

⚠️ 두 번 그린다(기독교 고전 소책자와 같은 이유) — 1차로 원문만 그려 브라우저에
   실제 줄 수를 물어본 뒤, 그 줄 수만큼 필사줄을 넣어 2차로 다시 그린다.
   손으로 "이 절은 몇 자니까 몇 줄"이라고 계산하지 않는다.
"""
import argparse
import io
import os
import re
import subprocess
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse import parse_book, load_book_file
from paginate import paginate
from render import build_draft_html, build_final_html, lines_per_page, FONT_URL

CHROME_CANDS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.join(os.environ.get('LOCALAPPDATA', ''), r'Google\Chrome\Application\chrome.exe'),
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
]

# ⚠️ 줄 수 = 높이 ÷ 줄 높이. Range.getClientRects() 로 상자를 세면 절 번호 <span> 때문에
#    첫 줄을 두세 번 센다(상자·그 안 글자·본문 조각이 따로 잡힌다).
# ⚠️ 서체가 안 불렸으면 대체 서체 기준 줄 수라 인쇄본과 어긋난다 — 재지 않고 멈춘다.
MEASURE_PROBE = """<script>
document.fonts.ready.then(function(){
  var bad = [];
  document.fonts.forEach(function(f){ if (f.status !== 'loaded') bad.push(f.family); });
  if (bad.length) { document.title = 'LINES|FONTFAIL'; return; }
  var out = [];
  document.querySelectorAll('[data-role]').forEach(function(el){
    var lh = parseFloat(getComputedStyle(el).lineHeight);
    var n = Math.round(el.getBoundingClientRect().height / lh);
    out.push(el.dataset.ch + ',' + el.dataset.vs + ',' + el.dataset.role + ',' + n);
  });
  document.title = 'LINES|' + out.join(';');
});
</script>"""


def find_chrome():
    for c in CHROME_CANDS:
        if c and os.path.exists(c):
            return c
    return None


def ensure_fonts():
    """Noto Serif KR 을 받아 둔다 — 없으면 여기서만 한 번 인터넷이 필요하다."""
    os.makedirs('fonts', exist_ok=True)
    for path, url in FONT_URL.items():
        if os.path.exists(path) and os.path.getsize(path) > 100000:
            continue
        print('  서체를 받습니다 — %s' % os.path.basename(path))
        try:
            urllib.request.urlretrieve(url, path)
        except Exception as e:
            raise SystemExit(
                '!! 서체를 받지 못했습니다(%s)\n'
                '   인터넷이 되는 곳에서 한 번만 돌리면 fonts/ 에 저장됩니다.\n'
                '   직접 받으려면: %s' % (e, url))


def find_book_file(book_name):
    """bible/ 폴더에서 이 책 이름으로 끝나는 파일을 찾는다."""
    bible_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'bible')
    target = book_name + '.txt'
    for fn in sorted(os.listdir(bible_dir)):
        if fn.endswith(target):
            return os.path.join(bible_dir, fn)
    raise SystemExit('!! bible/ 에서 "%s"를 못 찾았습니다' % book_name)


def measure_lines(html_path, chrome):
    """브라우저에 '이 절(과 소제목)이 몇 줄로 찍혔는지' 물어본다."""
    with io.open(html_path, encoding='utf-8') as f:
        html = f.read()
    tmp = os.path.join(os.path.dirname(os.path.abspath(html_path)), '_measure.html')
    with io.open(tmp, 'w', encoding='utf-8') as f:
        f.write(html.replace('</body>', MEASURE_PROBE + '</body>'))
    r = subprocess.run(
        [chrome, '--headless', '--disable-gpu', '--dump-dom',
         '--virtual-time-budget=20000',
         'file:///' + tmp.replace(os.sep, '/')],
        capture_output=True)
    os.remove(tmp)
    dom = r.stdout.decode('utf-8', 'replace')
    m = re.search(r'<title>LINES\|([^<]*)</title>', dom)
    if not m:
        return None
    if m.group(1) == 'FONTFAIL':
        raise SystemExit('!! 서체가 불리지 않아 줄 수를 잴 수 없습니다 — fonts/ 를 확인하세요')
    result = {}
    for item in m.group(1).split(';'):
        if not item:
            continue
        ch, vs, role, n = item.split(',')
        result[(int(ch), int(vs), role)] = int(n)
    return result


def generate(book_name, chapter=None, out_path=None):
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    ensure_fonts()
    chrome = find_chrome()
    if not chrome:
        raise SystemExit('!! 크롬을 못 찾았습니다 — 헤드리스 실측에 필요합니다.')

    text = load_book_file(find_book_file(book_name))
    verses = parse_book(text, book_name, chapter=chapter)
    if not verses:
        raise SystemExit('!! "%s"(%s장)에서 절을 찾지 못했습니다'
                         % (book_name, chapter or '전체'))

    draft_path = '_draft.html'
    with io.open(draft_path, 'w', encoding='utf-8') as f:
        f.write(build_draft_html(verses))
    lines_map = measure_lines(draft_path, chrome)
    os.remove(draft_path)
    if lines_map is None:
        raise SystemExit('!! 줄 수를 재지 못했습니다')

    for v in verses:
        body_n = lines_map.get((v['chapter'], v['verse'], 'body'))
        if not body_n:
            raise SystemExit('!! %d:%d 본문 줄 수를 못 쟀습니다' % (v['chapter'], v['verse']))
        sub_n = lines_map.get((v['chapter'], v['verse'], 'sub'), 0) if v['subtitle'] else 0
        v['sub_lines'] = sub_n
        v['lines'] = body_n + sub_n

    pages = paginate(verses, lines_per_page())
    if not out_path:
        suffix = '_%d장' % chapter if chapter else ''
        out_path = '%s%s.html' % (book_name, suffix)
    with io.open(out_path, 'w', encoding='utf-8') as f:
        f.write(build_final_html(pages, book_name))

    print('완료: %s (%d쪽 · %d절)' % (out_path, len(pages), len(verses)))
    return out_path


def main():
    ap = argparse.ArgumentParser(description='성경 필사노트(가로형) 생성')
    ap.add_argument('book', help='책 이름(예: 유다서, 요한복음)')
    ap.add_argument('--chapter', type=int, default=None, help='특정 장만(예: 1)')
    ap.add_argument('--out', default=None, help='출력 파일명')
    args = ap.parse_args()
    generate(args.book, chapter=args.chapter, out_path=args.out)


if __name__ == '__main__':
    main()
```

- [ ] **Step 3: 유다서로 첫 실행**

Run:
```bash
cd bible-note
PYTHONIOENCODING=utf-8 python generate.py 유다서
```

Expected: 서체를 처음 받는 메시지(이미 있으면 생략) 후 `완료: 유다서.html (N쪽 · 25절)`.
N은 대략 5~8이다(참조 PDF는 세로라 한 쪽에 약 27줄이었고, 가로는 17줄이라 쪽이 더 늘어난다).
오류가 나거나 N이 0이면 멈추고 출력 전체를 담아 BLOCKED로 보고한다.

- [ ] **Step 4: 전체 테스트 한 번**

Run: `cd bible-note && python -m pytest tests -v`
Expected: `30 passed` (parse 10 · paginate 6 · render 14)

- [ ] **Step 5: 만든 HTML이 커밋 대상에서 빠졌는지 확인**

Run: `git status --porcelain -- bible-note`
Expected: `bible-note/generate.py`만 보이고 `유다서.html`·`fonts/`는 보이지 않는다.

- [ ] **Step 6: 커밋**

```bash
git diff --cached --name-only        # 비어 있어야 한다
git add -- bible-note/generate.py .gitignore
git commit -m "feat(성경필사노트): 생성 CLI — 파싱·실측·배분·인쇄본을 잇는다

1차 그리기 → 헤드리스 크롬 실측 → 페이지 배분 → 2차 그리기. 줄 수는
높이 ÷ 줄 높이로 잰다(절 번호 상자 때문에 상자 수로 세면 첫 줄을 두세 번 센다).
서체가 안 불렸으면 재지 않고 멈춘다. 만든 HTML·서체는 올리지 않는다
(개역개정 본문 — bible/ 과 같은 이유).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- bible-note/generate.py .gitignore
```

---

### Task 5: `verify.py` — 검증 스크립트 · 유다서 통과 확인

**Files:**
- Create: `bible-note/verify.py`

**Interfaces:**
- Consumes: `generate.find_chrome`
- Produces: `verify(html_path: str) -> list[str]` — 문제 목록(빈 리스트면 통과).
  CLI: `python verify.py <html경로>` — 통과면 `모두 통과했습니다.`, 아니면 문제를 찍고 종료 코드 1.

이 태스크도 헤드리스 크롬이 필요해 pytest 대상이 아니다. 실행 결과가 곧 테스트다.

- [ ] **Step 1: `verify.py` 작성**

`bible-note/verify.py`:
```python
# -*- coding: utf-8 -*-
"""최종 HTML을 헤드리스 크롬으로 열어 네 가지를 확인한다.

① 원문 열·필사 열의 내용이 칸(164mm) 밖으로 넘치지 않았는가 — scrollHeight 로 잰다.
   ⚠️ getBoundingClientRect().bottom 으로 재면 안 된다 — 열은 flex 로 늘 칸 높이와 같고
      넘친 내용은 overflow:hidden 에 잘려, 넘쳐도 「통과」로 나온다.
② 원문 문단(<p>)마다 실제 줄 수 = 옆 필사줄(.vs-write 안 .ln) 개수인가
   (줄 수는 높이 ÷ 줄 높이 — generate.py 와 같은 방법)
③ 그 문단과 필사줄 묶음이 같은 높이에서 시작하는가(원문 한 줄 = 필사줄 한 줄)
④ 인쇄하면 쪽 수가 .page 개수와 같고, 쪽마다 A4 가로(297×210mm)인가
"""
import io
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import find_chrome

A4_LANDSCAPE_PT = (841.89, 595.28)

LAYOUT_PROBE = """<script>
document.fonts.ready.then(function(){
  var out = [];
  document.fonts.forEach(function(f){ if (f.status !== 'loaded') out.push('FONT_NOT_LOADED:' + f.family); });
  function lines(el){
    return Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
  }
  document.querySelectorAll('.page').forEach(function(pg, i){
    var no = i + 1;
    var orig = pg.querySelector('.orig-col');
    var write = pg.querySelector('.write-col');
    if (orig.scrollHeight > orig.clientHeight + 1) out.push(no + ':ORIG_OVERFLOW');
    if (write.scrollHeight > write.clientHeight + 1) out.push(no + ':WRITE_OVERFLOW');
    var ps = orig.querySelectorAll('p');
    var groups = write.querySelectorAll('.vs-write');
    if (ps.length !== groups.length) {
      out.push(no + ':GROUP_COUNT_MISMATCH:' + ps.length + '!=' + groups.length);
      return;
    }
    var o0 = orig.getBoundingClientRect().top;
    var w0 = write.getBoundingClientRect().top;
    ps.forEach(function(p, k){
      var n = lines(p);
      var lns = groups[k].querySelectorAll('.ln').length;
      if (n !== lns) out.push(no + ':LINE_MISMATCH:' + k + ':' + n + '!=' + lns);
      var dy = (p.getBoundingClientRect().top - o0) - (groups[k].getBoundingClientRect().top - w0);
      if (Math.abs(dy) > 0.5) out.push(no + ':ALIGN_MISMATCH:' + k + ':' + dy.toFixed(1) + 'px');
    });
  });
  document.title = 'CHECK|' + out.join(';');
});
</script>"""


def _chrome(chrome, flags, html_path):
    return subprocess.run(
        [chrome, '--headless', '--disable-gpu'] + flags +
        ['file:///' + os.path.abspath(html_path).replace(os.sep, '/')],
        capture_output=True)


def _beside(html_path, name):
    """검사용 임시 파일은 HTML 옆에 둔다 — 그래야 fonts/ 상대 경로가 그대로 풀린다."""
    return os.path.join(os.path.dirname(os.path.abspath(html_path)), name)


def check_layout(html_path, chrome):
    with io.open(html_path, encoding='utf-8') as f:
        html = f.read()
    tmp = _beside(html_path, '_verify.html')
    with io.open(tmp, 'w', encoding='utf-8') as f:
        f.write(html.replace('</body>', LAYOUT_PROBE + '</body>'))
    r = _chrome(chrome, ['--dump-dom', '--virtual-time-budget=20000'], tmp)
    os.remove(tmp)
    m = re.search(r'<title>CHECK\|([^<]*)</title>', r.stdout.decode('utf-8', 'replace'))
    if not m:
        return ['LAYOUT_CHECK_FAILED: 크롬 결과를 읽지 못했습니다']
    return [item for item in m.group(1).split(';') if item]


def check_print(html_path, chrome):
    try:
        import pymupdf
    except ImportError:
        try:
            import fitz as pymupdf
        except ImportError:
            return ['PRINT_CHECK_UNAVAILABLE: pymupdf 가 없어 인쇄 쪽 수·크기를 확인하지 못했습니다'
                    '(pip install pymupdf)']
    with io.open(html_path, encoding='utf-8') as f:
        expected = f.read().count('class="page"')
    pdf = _beside(html_path, '_verify_print.pdf')
    if os.path.exists(pdf):
        os.remove(pdf)
    _chrome(chrome, ['--no-pdf-header-footer', '--print-to-pdf=' + pdf,
                     '--virtual-time-budget=20000'], html_path)
    if not os.path.exists(pdf):
        return ['PRINT_FAILED: 크롬이 PDF 를 만들지 못했습니다']
    problems = []
    doc = pymupdf.open(pdf)
    try:
        if doc.page_count != expected:
            problems.append('PRINT_PAGES:%d!=%d' % (doc.page_count, expected))
        for i in range(doc.page_count):
            w, h = doc[i].rect.width, doc[i].rect.height
            if abs(w - A4_LANDSCAPE_PT[0]) > 2 or abs(h - A4_LANDSCAPE_PT[1]) > 2:
                problems.append('PRINT_SIZE:%d:%.0fx%.0fpt' % (i + 1, w, h))
    finally:
        doc.close()
        os.remove(pdf)
    return problems


def verify(html_path):
    chrome = find_chrome()
    if not chrome:
        return ['크롬을 찾을 수 없어 검증할 수 없습니다']
    return check_layout(html_path, chrome) + check_print(html_path, chrome)


def main():
    if len(sys.argv) < 2:
        raise SystemExit('사용법: python verify.py <html파일>')
    problems = verify(sys.argv[1])
    if problems:
        print('문제 발견:')
        for p in problems:
            print('  -', p)
        sys.exit(1)
    print('모두 통과했습니다.')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: 유다서 검증 실행**

Run:
```bash
cd bible-note
test -f 유다서.html || PYTHONIOENCODING=utf-8 python generate.py 유다서
PYTHONIOENCODING=utf-8 python verify.py 유다서.html
```

Expected: `모두 통과했습니다.`

문제가 나오면 `render.py`·`generate.py`를 이 태스크에서 고치지 않는다 — 검증 출력 전체를
보고서에 담아 **DONE_WITH_CONCERNS**로 보고한다(verify.py 자체는 커밋한다). 고치는 일은
컨트롤러가 따로 맡긴다.

- [ ] **Step 3: 임시 파일이 남지 않았는지 확인**

Run: `ls bible-note/_* 2>/dev/null; echo "남은 임시 파일 위에 없어야 함"`
Expected: `_verify.html`·`_verify_print.pdf`·`_measure.html`·`_draft.html`이 하나도 없다.

- [ ] **Step 4: 커밋**

```bash
git diff --cached --name-only        # 비어 있어야 한다
git add -- bible-note/verify.py
git commit -m "feat(성경필사노트): 검증 스크립트 — 넘침·줄 수·줄 맞춤·인쇄 쪽수

원문·필사 열 넘침은 scrollHeight 로 잰다(열이 flex 로 늘 칸 높이라
bottom 비교로는 넘쳐도 통과한다). 절마다 필사줄 수와 시작 높이를 원문과
대조하고, 실제로 PDF 로 인쇄해 쪽 수와 A4 가로 크기를 확인한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- bible-note/verify.py
```

---

### Task 6: 요한복음 1장 생성 · 검증

**Files:**
- 없음(새 코드 없음 — 생성·검증만. 만든 HTML은 커밋하지 않는다)

**Interfaces:**
- Consumes: Task 4의 `generate.py` CLI, Task 5의 `verify.py` CLI

- [ ] **Step 1: 생성**

Run:
```bash
cd bible-note
PYTHONIOENCODING=utf-8 python generate.py 요한복음 --chapter 1
```

Expected: `완료: 요한복음_1장.html (N쪽 · 51절)`

- [ ] **Step 2: 검증**

Run:
```bash
PYTHONIOENCODING=utf-8 python verify.py 요한복음_1장.html
PYTHONIOENCODING=utf-8 python verify.py 유다서.html
```

Expected: 두 파일 모두 `모두 통과했습니다.`

요한복음 1장은 유다서보다 까다롭다 — 51절이고, 1:19처럼 원문 열에서 2줄이 되는 긴 소제목이
있다. 문제가 나오면 코드를 고치지 말고 검증 출력 전체를 담아 **DONE_WITH_CONCERNS**로 보고한다.

- [ ] **Step 3: 소제목 줄 수가 실제로 여러 줄인 경우가 있었는지 기록**

Run:
```bash
grep -o 'class="sub" style="height:[0-9.]*mm"' 요한복음_1장.html | sort | uniq -c
```

Expected: 소제목마다 높이가 찍힌다. `height:19mm`(2줄)가 하나라도 있으면 Task 3의
「두 줄 소제목 맞춤」이 실제로 쓰인 것이다 — 보고서에 그 줄을 그대로 옮긴다(없어도 실패가 아니다).

- [ ] **Step 4: 커밋 없음 확인**

Run: `git status --porcelain -- bible-note`
Expected: 아무것도 안 나온다(HTML은 `.gitignore`로 빠진다).

---

## Self-Review

**스펙 커버리지:**
- 전체 흐름(파싱→1차→실측→배분→2차→검증) — Task 1~5 ✅
- 페이지 레이아웃(297×210, 여백 13, 헤더/푸터, 좌우 38:62, 9.5mm, Noto Serif KR, A4 가로 인쇄) — Task 3 ✅
- 절 표기(번호+본문 한 줄, 소제목 양쪽 반복) — Task 3 ✅
- 필사줄 대응(N줄 ↔ N개 빈 줄, 같은 높이에서 시작) — Task 3(렌더링) + Task 4(실측) + Task 5(검증) ✅
- 페이지 나누기(절 안 자름, 소제목 다음 절과 묶음) — Task 2 ✅
- 파일 구조(`bible-note/`, 서체·HTML gitignore) — Task 4 ✅
- 검증(넘침·줄 수·줄 맞춤·인쇄 쪽수·크기) — Task 5 ✅
- 유다서·요한복음 1장 견본 — Task 4·5·6 ✅
- "하지 않는 것"(66권 자동화·PDF 산출물·로고/표어/자유메모·○ 기호) — 계획 어디에도 안 만듦 ✅

**사전 점검에서 고친 것(2026-09-22, 성도님 승인):**
- 실측(1차)과 인쇄(2차)의 원문 열 폭이 4mm 달랐다 → `.orig-col` 규칙 하나를 둘이 함께 쓴다.
- 두 줄 소제목이 필사 열에서 한 줄로 끝나 필사줄이 밀렸다 → `sub_lines`를 실측해 높이를 못박는다.
- 가로 인쇄 지정이 없었다 → `@page { size: A4 landscape; margin: 0; }`.
- 줄 수를 상자 개수로 세면 절 번호 `<span>` 때문에 첫 줄을 두세 번 셌다 → 높이 ÷ 줄 높이.
- 넘침을 `bottom`으로 비교하면 열이 늘 칸 높이라 넘쳐도 통과했다 → `scrollHeight`.
- 만든 HTML을 커밋하게 되어 있었다 → `.gitignore`(개역개정 본문, 공개 저장소).
- 원문 파일을 읽는 테스트가 `bible/` 없는 PC에서 깨졌다 → 없으면 건너뛴다.

**타입 일관성:**
- `parse_book` 반환 dict 키(`book/chapter/verse/subtitle/body`) — `render.py`·`paginate.py` 전체에서 동일.
- `'lines'`·`'sub_lines'` — `generate.generate()`가 채우고, `paginate()`는 `'lines'`를,
  `render._page_html`은 둘 다 읽는다 — 일치.
- `measure_lines()`의 키 `(chapter, verse, 'body'|'sub')` — `build_draft_html`의
  `data-ch`/`data-vs`/`data-role`과 1:1 — 일치.
- 줄 수 세는 법(높이 ÷ 줄 높이) — `generate.MEASURE_PROBE`와 `verify.LAYOUT_PROBE`가 같다.
- `find_chrome`은 `generate.py`에 정의하고 `verify.py`가 import — 중복 정의 없음.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-22-bible-landscape-note.md`.
Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
