# -*- coding: utf-8 -*-
"""성경 필사노트 — 화면(ui.py)이 부르는 만들기 한 곳. 설정 묶음(JSON) 하나 → HTML(· PDF).

    python notebook.py build <설정.json> [--preview]   # ui.py 가 새 프로세스로 부른다
    python notebook.py list                           # 번역본 · 책 · 서체(JSON) — 손으로 볼 때

두 꼴:
  right — 오른쪽 필사형(왼쪽 원문 / 오른쪽 필사줄) — generate.py · render.py
  below — 아래쪽 필사형(원문 한 줄 아래 필사줄) — dictation.py

⚠️ render.py · generate.py 는 고치지 않는다(다른 세션도 쓰는 파일이다) — 모듈 값을 바꿔 넣고, 값이 없는 것
   (본문 서체 경로 · 날짜 칸 · 원문 색 · 제본 여백)은 함수를 감싼다(_patch_right). 그래서 build 는 반드시
   **새 프로세스에서 한 번만** 부른다 — 같은 프로세스에서 두 번 부르면 앞 설정이 남는다(ui.py 는 늘 새로 띄운다).
   감쌀 자리(서체 줄 · 날짜 칸)를 render.py 에서 못 찾으면 조용히 넘어가지 않고 멈춘다.
⚠️ 원문 폴더 규칙은 RULES(아래) · 화면 「번역본 넣는 규칙」 · docs/notes/bible-note.md 가 같아야 한다.
⚠️ 만든 HTML · PDF 에는 성경 본문이 그대로 있다 — 저장 자리는 generate.ensure_out_path_safe 가 본다
   (저장소 안이면 .gitignore 에 걸린 자리만).
"""
import io
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import parse as P
import render as R
import generate as G
import dictation as D
from paginate import paginate

ENV_PATH = os.path.join(HERE, '_환경.json')        # 이 PC 의 폴더 · 크롬 — git 에 안 올라간다(_ 로 시작)
LAST_PATH = os.path.join(HERE, '_마지막설정.json')  # 화면을 다시 열면 이어서
PRESET_PATH = os.path.join(HERE, '설정묶음.json')   # 이름 붙인 설정 — 본문이 없어 올려도 된다(다른 PC 로 함께)
FONT_DIR = os.path.join(HERE, 'fonts')
FONT_EXTS = ('.woff', '.woff2', '.ttf', '.otf')

KO_FILE_RE = re.compile(r'^(\d+)-(\d+)(.+)\.txt$')          # 1-20잠언.txt (parse.FILENAME_RE 와 같은 꼴)
EN_FILE_RE = re.compile(r'^(\d+)-(.+?) \((.+)\)\.txt$')      # 20-Proverbs (잠언).txt (parse.NIV_FILENAME_RE)
CH_LINE_RE = re.compile(r'^\s*[^\W\d_]*(\d+):\d')           # 장:절 로 시작하는 줄의 장 번호

ORIG_FONT_URL = dict(R.FONT_URL)
NOTO_400, NOTO_700 = 'fonts/NotoSerifKR-400.woff', 'fonts/NotoSerifKR-700.woff'

# 받아 쓸 수 있는 무료 한글 서체(OFL) — 2026-11-14 주소 확인(고운돋움은 굵은 글꼴이 없어 보통 글꼴로 대신).
_FS = 'https://cdn.jsdelivr.net/npm/@fontsource/%s@%s/files/%s-korean-%s-normal.woff'
FONT_CATALOG = [
    {'key': 'noto-serif-kr', 'name': '본명조 (Noto Serif KR)', 'files': {
        '400': (NOTO_400, ORIG_FONT_URL.get(NOTO_400, _FS % ('noto-serif-kr', '5.3.0', 'noto-serif-kr', 400))),
        '700': (NOTO_700, ORIG_FONT_URL.get(NOTO_700, _FS % ('noto-serif-kr', '5.3.0', 'noto-serif-kr', 700)))}},
    {'key': 'noto-sans-kr', 'name': '본고딕 (Noto Sans KR)', 'files': {
        '400': ('fonts/NotoSansKR-400.woff', _FS % ('noto-sans-kr', '5.3.1', 'noto-sans-kr', 400)),
        '700': ('fonts/NotoSansKR-700.woff', _FS % ('noto-sans-kr', '5.3.1', 'noto-sans-kr', 700))}},
    {'key': 'nanum-myeongjo', 'name': '나눔명조', 'files': {
        '400': ('fonts/NanumMyeongjo-400.woff', _FS % ('nanum-myeongjo', '5.3.0', 'nanum-myeongjo', 400)),
        '700': ('fonts/NanumMyeongjo-700.woff', _FS % ('nanum-myeongjo', '5.3.0', 'nanum-myeongjo', 700))}},
    {'key': 'nanum-gothic', 'name': '나눔고딕', 'files': {
        '400': ('fonts/NanumGothic-400.woff', _FS % ('nanum-gothic', '5.3.0', 'nanum-gothic', 400)),
        '700': ('fonts/NanumGothic-700.woff', _FS % ('nanum-gothic', '5.3.0', 'nanum-gothic', 700))}},
    {'key': 'gowun-batang', 'name': '고운바탕', 'files': {
        '400': ('fonts/GowunBatang-400.woff', _FS % ('gowun-batang', '5.3.0', 'gowun-batang', 400)),
        '700': ('fonts/GowunBatang-700.woff', _FS % ('gowun-batang', '5.3.0', 'gowun-batang', 700))}},
    {'key': 'gowun-dodum', 'name': '고운돋움', 'files': {
        '400': ('fonts/GowunDodum-400.woff', _FS % ('gowun-dodum', '5.3.0', 'gowun-dodum', 400))}},
]

RULES = {
    'source': [
        '번역본 하나 = 성경 폴더 아래 폴더 하나. 폴더 이름이 화면의 번역본 이름이다(예: 개정개역4 · NIV). '
        '이름이 _ 로 시작하는 폴더(_보관)는 목록에 안 나온다.',
        '책 하나 = .txt 파일 하나. 파일 이름은 둘 중 한 꼴 —',
        '  한글 꼴: 「구약 1 · 신약 2」-「권 번호」「책 이름」 → 1-20잠언.txt · 2-01마태복음.txt. '
        '줄은 「잠1:1 <소제목> 본문」(책 약자 + 장:절 · 소제목은 꺾쇠).',
        '  영어 꼴: 「권 번호 01~66」-「영어 이름」 (「한글 이름」) → 20-Proverbs (잠언).txt. '
        '첫 줄에 책 이름이 있어도 되고, 줄은 「1:1 본문」.',
        '글자 꼴(인코딩)은 UTF-8 이나 CP949(메모장의 ANSI). 장:절 번호가 없는 줄이 있으면 틀린 채 찍지 않고 멈춘다.',
        '두 번역 함께(한영 · 영한 · 오른쪽 필사형)는 한글 번역본의 책과 같은 책을 영어 번역본 폴더에서 찾는다 — 괄호 속 한글 이름이 같은 책 '
        '(20-Proverbs (잠언).txt), 없으면 같은 권 번호(22-Song of Songs (아가서).txt ↔ 1-22아가.txt). 영어에 없는 절은 한글만 찍고, '
        '영어에만 있는 절은 찍지 않고 알린다(고린도후서 13장 NIV 의 절 나눔은 바로잡아 짝짓는다).',
        '필요하면 번역본 폴더에 번역본.json 을 둔다(UTF-8) — {"이름": "개역개정 4판", "언어": "ko"}. '
        '이름은 화면 · 파일 이름에 쓴다. 「언어」는 영어 꼴 파일에만 먹는다 — 영어 꼴 파일 이름에 한글 본문을 넣었으면 "ko" '
        '(「1 장」 · 머리글 한글 책 이름). 없으면 폴더 이름 · 파일 꼴(한글 꼴 = 한글, 영어 꼴 = 영어)로 정한다.',
        '성경 본문 · 만든 HTML · PDF 는 저작권 때문에 git 에 올리지 않는다 '
        '(bible/ · bible-note 아래 *.html · *.pdf · fonts/ 는 .gitignore 에 막혀 있다).',
    ],
    'other_pc': [
        '파이썬 3.8 이상과 크롬(또는 엣지)만 있으면 된다 — 따로 깔 꾸러미는 없다.',
        '저장소를 받거나(git clone) bible-note 폴더를 통째로 복사한다.',
        '성경 원문 폴더(bible/ — git 에 없다)를 USB 등으로 옮긴다.',
        '필사노트_화면.bat 을 두 번 누르고, 「이 PC 환경」에서 성경 폴더 · 저장 폴더 · 크롬 경로를 정해 저장한다 '
        '(bible-note/_환경.json — 이 PC 에만 있고 git 에 안 올라간다).',
        '서체는 처음 한 번 인터넷에서 받는다(본명조 · 「서체 받기」). 내 PC 서체는 bible-note/fonts/ 에 '
        '.ttf · .otf · .woff · .woff2 를 넣는다 — fonts/ 도 git 에 없으니 다른 PC 에는 따로 복사한다.',
        '이름 붙인 설정은 bible-note/설정묶음.json 에 있다 — 함께 옮기면 같은 설정을 쓴다.',
        '저장 폴더가 저장소 안이면 git 이 있어야 한다(커밋에서 빠지는 자리인지 확인한다). git 이 없는 PC 는 '
        '저장 폴더를 저장소 밖(바탕화면 등)으로 정한다.',
    ],
}


class UserError(Exception):
    """사람이 고칠 수 있는 문제 — 화면에 한 줄로 보인다."""


class Cancelled(Exception):
    """화면의 「멈추기」 — ui.py 가 멈춤 표시 파일(--cancel)을 만들었다."""


CANCEL_FILE = None   # build 의 --cancel 값 — 이 파일이 생기면 크롬을 끄고 스스로 뒷정리한 뒤 멈춘다


def _check_cancel():
    if CANCEL_FILE and os.path.exists(CANCEL_FILE):
        raise Cancelled()


def say(msg):
    print(msg, flush=True)


# ── 이 PC 환경 · 저장 ──────────────────────────────────────────────────
def load_json(path, default):
    """⚠️ 틀린 파일(메모장 ANSI 저장 · git 충돌 표시 · 반쯤 쓴 파일)은 UserError — 글에 폴더 이름까지 넣는다
    (번역본.json 은 폴더마다 있어 이름만으로는 어느 것인지 모른다 · 2026-11-14 검토 js-2)."""
    try:
        with io.open(path, encoding='utf-8-sig') as f:
            return json.load(f)
    except FileNotFoundError:
        return default
    except ValueError as e:     # JSON 오류 · UnicodeDecodeError 둘 다
        where = os.path.join(os.path.basename(os.path.dirname(path)), os.path.basename(path))
        raise UserError('%s 을 읽지 못했습니다(UTF-8 JSON 이 아님) — %s' % (where, e))


def save_json(path, data):
    """임시 파일(「_」 로 시작 — bible-note 안에서 git 에 안 걸린다)에 다 쓴 뒤 바꿔 끼운다.
    통째로 덮어쓰면 쓰는 도중 끊겼을 때 반쯤 쓴 파일이 남아 화면이 서지 못했다(검토 sv-4).
    ⚠️ 임시 이름은 부를 때마다 다르게(mkstemp) — 화면의 /api/last 와 만들기의 save_last 가 같은 파일을 함께 쓸 수 있어,
       고정 이름이면 서로의 임시 파일을 옮기거나 지웠다. 윈도는 상대가 그 파일을 연 순간 바꿔 끼우기를 막으므로
       짧게 몇 번 다시 해 본다(검토 nb-n1 · sv-n3)."""
    d = os.path.dirname(path) or '.'
    fd, tmp = tempfile.mkstemp(dir=d, prefix='_' + os.path.basename(path) + '.', suffix='.tmp')
    try:
        with io.open(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        for attempt in range(10):
            try:
                os.replace(tmp, path)
                return
            except PermissionError:
                if attempt == 9:
                    raise
                time.sleep(0.05)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def get_env(warnings=None):
    """이 PC 환경. warnings 를 주면(화면) _환경.json 이 틀려도 멈추지 않고 기본값으로 · 경고를 담는다.
    만들기(build)는 warnings 없이 불러 틀리면 멈춘다."""
    try:
        e = load_json(ENV_PATH, {})
    except UserError as err:
        if warnings is None:
            raise
        warnings.append('%s — 기본값으로 엽니다(「이 PC 환경」을 다시 저장하면 고쳐집니다)' % err)
        e = {}
    if not isinstance(e, dict):
        e = {}
    return {
        'bible_dir': e.get('bible_dir') or os.path.normpath(os.path.join(HERE, '..', 'bible')),
        'out_dir': e.get('out_dir') or os.path.join(HERE, '인쇄용'),
        'chrome': e.get('chrome') or '',
        'saved': bool(e),
    }


def env_status(env):
    chrome = env['chrome'] if env['chrome'] else (G.find_chrome() or '')
    return {
        'bible_dir': os.path.isdir(env['bible_dir']),
        'out_dir': os.path.isdir(env['out_dir']) or os.path.isdir(os.path.dirname(env['out_dir'])),
        'chrome': bool(chrome) and os.path.exists(chrome),
        'chrome_path': chrome,
    }


CHROME_NAMES = {'chrome.exe', 'msedge.exe', 'chromium.exe', 'chrome', 'chromium', 'chromium-browser',
                'google-chrome', 'google-chrome-stable', 'microsoft-edge', 'google chrome', 'microsoft edge'}


def save_env(data):
    out = {}
    for k in ('bible_dir', 'out_dir', 'chrome'):
        v = str(data.get(k) or '').strip().strip('"')
        if v:
            out[k] = os.path.normpath(v)
    if out.get('bible_dir') and not os.path.isdir(out['bible_dir']):
        raise UserError('성경 폴더가 없습니다: %s' % out['bible_dir'])
    if out.get('chrome'):
        # ⚠️ 크롬 · 엣지 실행 파일만 — 이 경로는 만들 때마다 그대로 실행된다(검토 sv-1: 아무 프로그램이나 띄울 수 있었다).
        if os.path.basename(out['chrome']).lower() not in CHROME_NAMES:
            raise UserError('크롬 경로는 chrome.exe(또는 msedge.exe) 파일이어야 합니다: %s' % out['chrome'])
        if not os.path.isfile(out['chrome']):
            raise UserError('크롬 파일이 없습니다: %s' % out['chrome'])
    save_json(ENV_PATH, out)
    return get_env()


def find_chrome(env):
    if env['chrome']:
        if not os.path.exists(env['chrome']):
            raise UserError('「이 PC 환경」의 크롬 경로에 파일이 없습니다: %s' % env['chrome'])
        return env['chrome']
    c = G.find_chrome()
    if not c:
        raise UserError('크롬(또는 엣지)을 못 찾았습니다 — 「이 PC 환경」에 chrome.exe 경로를 적어 주세요')
    return c


# ── 번역본 · 책 ─────────────────────────────────────────────────────────
def scan_books(folder):
    books = []
    for fn in os.listdir(folder):
        if not fn.lower().endswith('.txt'):
            continue
        # ⚠️ 영어 꼴을 먼저 본다 — 「09-1 Samuel (사무엘상).txt」 는 한글 꼴(숫자-숫자 이름)에도 걸린다.
        # canon = 정경 권 번호(창세기 1 ~ 요한계시록 66) — 두 번역 함께에서 이름이 다른 책(아가 · 아가서)을 잇는다.
        m = EN_FILE_RE.match(fn)
        if m:
            n = int(m.group(1))
            books.append({'file': fn, 'fmt': 'en', 'name': m.group(3).strip(), 'title': m.group(2).strip(),
                          'order': n, 'canon': n, 'testament': 'old' if n <= 39 else 'new'})
            continue
        m = KO_FILE_RE.match(fn)
        if m:
            t, n, name = int(m.group(1)), int(m.group(2)), m.group(3).strip()
            books.append({'file': fn, 'fmt': 'ko', 'name': name, 'title': name,
                          'order': t * 100 + n, 'canon': n if t == 1 else 39 + n,
                          'testament': 'old' if t == 1 else 'new'})
    books.sort(key=lambda b: b['order'])
    return books


LANG_WORDS = {'en': 'en', 'eng': 'en', 'english': 'en', '영어': 'en',
              'ko': 'ko', 'kor': 'ko', 'korean': 'ko', '한글': 'ko', '한국어': 'ko'}


def translations(env, warnings=None):
    """번역본 목록. 못 여는 하위 폴더(문서의 'My Music' · 드라이브 맨 위의 'System Volume Information')나
    틀린 번역본.json 하나 때문에 목록 전체가 멈추지 않게 그 폴더만 건너뛴다(검토 sv-4 · js-2).
    warnings(목록)를 주면 건너뛴 까닭을 담는다.

    「언어」는 영어 꼴 파일(20-Proverbs (잠언).txt)에만 먹는다 — 한글 꼴 파일은 늘 한글이다(검토 nb-5).
    값은 대소문자 · 한글 이름도 받는다(EN · 영어 · 한국어). 모르는 값이면 파일 꼴대로 두고 알린다."""
    warn = warnings.append if warnings is not None else (lambda _m: None)
    root = env['bible_dir']
    if not os.path.isdir(root):
        return []
    try:
        names = sorted(os.listdir(root))
    except OSError as e:
        warn('성경 폴더를 읽지 못했습니다 — %s' % e)
        return []
    out = []
    for d in names:
        folder = os.path.join(root, d)
        if d.startswith(('_', '.')) or not os.path.isdir(folder):
            continue
        try:
            books = scan_books(folder)
        except OSError as e:
            warn('「%s」 폴더를 읽지 못해 건너뜁니다 — %s' % (d, e.strerror or e))
            continue
        if not books:
            continue
        try:
            info = load_json(os.path.join(folder, '번역본.json'), {})
        except UserError as e:
            warn('%s — 폴더 이름 · 파일 꼴로 엽니다' % e)
            info = {}
        if not isinstance(info, dict):
            info = {}
        fmts = {b['fmt'] for b in books}
        lang = 'en' if fmts == {'en'} else 'ko'
        raw = info.get('언어', info.get('lang'))
        if raw is not None and str(raw).strip():
            want = LANG_WORDS.get(str(raw).strip().lower())
            if want is None:
                warn('「%s」 번역본.json 의 「언어」 %r 를 모릅니다(ko · en) — 파일 꼴대로 엽니다' % (d, raw))
            elif want == 'en' and 'en' not in fmts:
                warn('「%s」 은 한글 꼴 파일이라 「언어」 en 을 쓰지 않습니다 — 영어 본문은 영어 꼴 파일 이름으로 넣어 주세요' % d)
            elif 'en' in fmts:
                lang = want
        out.append({'id': d, 'name': str(info.get('이름') or info.get('name') or d),
                    'lang': lang, 'books': books})
    return out


def find_book(env, tr_id, book_file):
    for tr in translations(env):
        if tr['id'] == tr_id:
            for bk in tr['books']:
                if bk['file'] == book_file:
                    return tr, bk
            raise UserError('「%s」에 그 책 파일이 없습니다: %s' % (tr['name'], book_file))
    raise UserError('번역본 폴더를 못 찾았습니다: %s' % tr_id)


def chapter_count(env, tr_id, book_file):
    tr, bk = find_book(env, tr_id, book_file)
    text = P.load_book_file(os.path.join(env['bible_dir'], tr['id'], bk['file']))
    mx = 0
    for line in text.splitlines():
        m = CH_LINE_RE.match(line)
        if m:
            mx = max(mx, int(m.group(1)))
    return mx


def load_pieces(env, s):
    tr, bk = find_book(env, s['translation'], s['book'])
    pieces = _read_range(env, tr, bk, s)
    lang = tr['lang']
    if bk['fmt'] == 'en' and lang == 'ko':      # 영어 꼴 파일에 한글 본문(번역본.json 「언어」 ko)
        for p in pieces:
            p['lang'] = 'ko'
            p['book'] = bk['name']
    title = bk['title'] if (lang == 'en' and bk['fmt'] == 'en') else bk['name']
    if not pieces:
        raise UserError('고른 범위에 절이 없습니다 — 장 번호를 확인해 주세요')
    return tr, bk, pieces, title, lang


def _read_range(env, tr, bk, s):
    """그 책에서 고른 범위의 조각들 — 비어 있어도 그대로 돌려준다(빈 것을 막는 것은 부른 쪽)."""
    text = P.load_book_file(os.path.join(env['bible_dir'], tr['id'], bk['file']))
    mode, a, b = s['range_mode'], s['ch_from'], s['ch_to']
    single = a if mode == 'chapter' else None
    if bk['fmt'] == 'ko':
        pieces = P.parse_book(text, bk['name'], chapter=single)
    else:
        pieces = P.parse_book_en(text, bk['title'], chapter=single)
    if mode == 'chapters':
        a, b = min(a, b), max(a, b)
        pieces = [p for p in pieces if a <= p['chapter'] <= b]
    return pieces


PAIRS = {'koen': '한영', 'enko': '영한'}   # 두 번역 함께 — 절마다 한글 → 영어 / 영어 → 한글(오른쪽 필사형만)

# 두 번역의 절 나눔이 다른 장 — 영어(NIV 꼴) 절 번호 → 한글(개역개정) 절 번호. 한글 절이 바로 앞 영어 절과 같으면 그 끝에 잇는다.
# 고린도후서 13장: 개역개정은 11절 끝에 「거룩하게 입맞춤으로 서로 문안하라」를 붙여 13절에서 끝나고, NIV 는 그것을 12절로 떼어
# 14절(축도)까지 간다 — 그대로 두면 12 · 13절 짝이 어긋나고 축도가 빠졌다(2026-11-14 검토 pn-2 · 66권에서 이 한 곳).
# ⚠️ 영어 쪽 그 장의 끝 절이 한글보다 클 때만 옮긴다(다른 영어 번역본이 한글처럼 나눴으면 그대로 둔다).
VERSE_REMAP = {('고린도후서', 13): {12: 11, 13: 12, 14: 13}}


def _last_verses(pieces):
    last = {}
    for p in pieces:
        last[p['chapter']] = max(last.get(p['chapter'], 0), p.get('verse_end') or p['verse'])
    return last


def _remap_en(book_name, ko, en):
    ko_last, en_last = _last_verses(ko), _last_verses(en)
    out = []
    for p in en:
        table = VERSE_REMAP.get((book_name, p['chapter']))
        if table and p['verse'] in table and en_last.get(p['chapter'], 0) > ko_last.get(p['chapter'], 0):
            to = table[p['verse']]
            if out and (out[-1]['chapter'], out[-1]['verse']) == (p['chapter'], to):
                out[-1] = dict(out[-1], body=out[-1]['body'] + ' ' + p['body'])
                continue
            p = dict(p, verse=to, label=str(to))
        out.append(p)
    return out


def load_pair_pieces(env, s):
    """한영 · 영한(2026-11-14 친구) — 한글 번역본(s['translation'])과 영어 번역본(s['pair_translation'])의 같은 책 · 같은 범위를
    generate.enko_pieces 로 절마다 짝지운다(남의 파일 · 읽기만).
    영어 책은 같은 한글 이름으로, 없으면 같은 정경 권 번호로 찾는다(한글 「아가」 · NIV 「아가서」 · 검토 pn-1).
    영어 쪽 범위가 비어도 멈추지 않는다 — 모두 한글만 찍고 빠진 절로 알린다(검토 pn-3).
    돌려주는 것: (한글 번역본, 영어 번역본, 한글 책, 조각들, 영어에 없는 절, 한글에 없는 영어 절(찍히지 않음))."""
    tr, bk, ko, _title, lang = load_pieces(env, s)
    if lang != 'ko':
        raise UserError('한영 · 영한은 한글 번역본(예: 개정개역4)을 고른 뒤에 만들 수 있습니다')
    en_tr = next((t for t in translations(env) if t['id'] == s['pair_translation']), None)
    if en_tr is None or en_tr['lang'] != 'en':
        raise UserError('영어 번역본을 골라 주세요(예: NIV)')
    en_bk = (next((b for b in en_tr['books'] if b['name'] == bk['name']), None)
             or next((b for b in en_tr['books'] if b.get('canon') == bk.get('canon')), None))
    if en_bk is None:
        raise UserError('영어 번역본 「%s」에 「%s」가 없습니다' % (en_tr['name'], bk['name']))
    en = _remap_en(bk['name'], ko, _read_range(env, en_tr, en_bk, s))
    covered = {(p['chapter'], v) for p in ko for v in range(p['verse'], (p.get('verse_end') or p['verse']) + 1)}
    extra = sorted({(p['chapter'], p['verse']) for p in en} - covered)
    pieces, missing = G.enko_pieces(ko, en, ko_first=(s['pair'] == 'koen'))
    return tr, en_tr, bk, pieces, missing, extra


def warn_missing(env, tr, bk, pieces, s):
    """영어 본문이면 같은 책 한글 본문과 견줘 빠진 절을 알린다(멈추지 않는다 — 번역마다 절 나눔이 다르다)."""
    for other in translations(env):
        if other['id'] == tr['id'] or other['lang'] != 'ko':
            continue
        for ob in other['books']:
            if ob['name'] == bk['name'] and ob['fmt'] == 'ko':
                try:
                    _t, _b, ko, _ti, _l = load_pieces(env, dict(s, translation=other['id'], book=ob['file']))
                except (UserError, P.SourceTextError):
                    return
                miss = G.verses_missing_from(ko, pieces)
                if miss:
                    say('⚠ 「%s」에는 있고 이 본문에는 없는 절 %d개: %s%s' % (
                        other['name'], len(miss), ', '.join('%d:%d' % m for m in miss[:12]),
                        ' …' if len(miss) > 12 else ''))
                return


# ── 서체 ───────────────────────────────────────────────────────────────
def list_fonts():
    names = {}
    for item in FONT_CATALOG:
        for w, (path, _url) in item['files'].items():
            names[path] = '%s%s' % (item['name'], ' 굵게' if w == '700' else '')
    out = []
    if os.path.isdir(FONT_DIR):
        for fn in sorted(os.listdir(FONT_DIR)):
            if os.path.splitext(fn)[1].lower() in FONT_EXTS:
                path = 'fonts/' + fn
                out.append({'path': path, 'name': names.get(path) or os.path.splitext(fn)[0]})
    return out


def font_catalog_state():
    out = []
    for item in FONT_CATALOG:
        have = all(os.path.exists(os.path.join(HERE, p)) for p, _u in item['files'].values())
        out.append({'key': item['key'], 'name': item['name'], 'installed': have,
                    'bold': '700' in item['files']})
    return out


def download_font(key):
    import urllib.request
    for item in FONT_CATALOG:
        if item['key'] == key:
            os.makedirs(FONT_DIR, exist_ok=True)
            for path, url in item['files'].values():
                dst = os.path.join(HERE, path)
                if os.path.exists(dst) and os.path.getsize(dst) > 100000:
                    continue
                try:
                    urllib.request.urlretrieve(url, dst + '.part')
                except Exception as e:
                    raise UserError('서체를 받지 못했습니다(%s) — 인터넷을 확인해 주세요' % e)
                os.replace(dst + '.part', dst)
            return list_fonts()
    raise UserError('모르는 서체입니다: %s' % key)


# ── 설정 ───────────────────────────────────────────────────────────────
def layout_defaults():
    return {
        'right': {'font_pt': R.FONT_PT, 'line_mm': R.LINE_MM, 'orig_pct': R.ORIG_PCT,
                  'header_pt': R.HEADER_PT, 'date_pt': getattr(R, 'DATE_PT', D.DATE_PT)},
        'below': {'font_pt': D.FONT_PT, 'text_mm': D.TEXT_MM, 'write_mm': D.WRITE_MM,
                  'header_pt': D.HEADER_PT, 'date_pt': D.DATE_PT},
    }


SIZE_STEPS = {
    'right': [{'name': '보통', 'font_pt': 12, 'line_mm': 9.5},
              {'name': '크게', 'font_pt': 14, 'line_mm': 10.5},
              {'name': '아주 크게', 'font_pt': 16, 'line_mm': 11.5}],
    'below': [{'name': '보통', 'font_pt': 16, 'text_mm': 9.5, 'write_mm': 10.5},
              {'name': '크게', 'font_pt': 18, 'text_mm': 10.5, 'write_mm': 12},
              {'name': '아주 크게', 'font_pt': 20, 'text_mm': 11.5, 'write_mm': 13}],
}


def defaults():
    ld = layout_defaults()
    d = {
        'translation': '', 'book': '', 'range_mode': 'book', 'ch_from': 1, 'ch_to': 1,
        'pair': 'none', 'pair_translation': '',
        'layout': 'below',
        'body_font': NOTO_400, 'bold_font': NOTO_700,
        'font_pt': ld['below']['font_pt'], 'letter_spacing_em': 0, 'text_color': '#111111',
        'line_mm': ld['right']['line_mm'], 'orig_pct': ld['right']['orig_pct'],
        'text_mm': ld['below']['text_mm'], 'write_mm': ld['below']['write_mm'], 'head_pt': D.HEAD_PT,
        'justify': D.JUSTIFY, 'keep_words': D.KEEP_WORDS, 'para_mark': bool(D.PARA_MARK),
        'chap_sub_inline': D.CHAP_SUB_INLINE, 'verse_break': D.VERSE_BREAK,
        'header_font': '', 'header_pt': ld['below']['header_pt'], 'show_date': True,
        'date_prefix': D.DATE_PREFIX, 'date_pt': ld['below']['date_pt'],
        'footer_left': R.FOOTER_LEFT, 'footer_center_odd': R.FOOTER_CENTER,
        'footer_center_even': R.FOOTER_CENTER_EVEN, 'footer_right': R.FOOTER_RIGHT,
        'footer_pt': R.FOOTER_PT, 'footer_font': '',
        'footer_like_sub': bool(getattr(R, 'FOOTER_LIKE_SUBTITLE', False)),
        'bind_top_mm': 0, 'bind_left_mm': 0,
        'out_name': '', 'make_pdf': False,
    }
    return d


NUM_RULES = {
    'font_pt': (8, 28, '글자 크기'), 'letter_spacing_em': (-0.1, 0.5, '글자 간격'),
    'line_mm': (6, 20, '줄 높이'), 'orig_pct': (30, 70, '원문 칸 비율'),
    'text_mm': (6, 20, '원문 줄 높이'), 'write_mm': (6, 25, '필사줄 높이'),
    'head_pt': (8, 24, '장 표시 · 소제목 크기'), 'header_pt': (8, 28, '머리글 크기'),
    'date_pt': (8, 20, '날짜 칸 크기'), 'footer_pt': (6, 16, '바닥글 크기'),
    'bind_top_mm': (0, 30, '제본 여백(위)'), 'bind_left_mm': (0, 30, '제본 여백(왼쪽)'),
    'ch_from': (1, 200, '시작 장'), 'ch_to': (1, 200, '끝 장'),
}
BOOL_KEYS = ('justify', 'keep_words', 'para_mark', 'chap_sub_inline', 'verse_break', 'show_date', 'make_pdf',
             'footer_like_sub')
TEXT_KEYS = ('footer_left', 'footer_center_odd', 'footer_center_even', 'footer_right', 'date_prefix', 'out_name')
FONT_KEYS = ('body_font', 'bold_font', 'header_font', 'footer_font')
LOOK_KEYS_EXCLUDED = ('translation', 'book', 'range_mode', 'ch_from', 'ch_to', 'out_name',
                      'pair', 'pair_translation')   # 설정 묶음에 안 넣는 것(무엇을 찍을지 — 모양이 아니다)


def _font_ok(path):
    return (path.startswith('fonts/') and '/' not in path[6:] and '\\' not in path
            and os.path.splitext(path)[1].lower() in FONT_EXTS)


def _used_numbers(s):
    """지금 고른 꼴 · 범위 · 켬/끔에서 실제로 쓰는 숫자 칸. 쓰지 않는 칸(화면에서 숨기거나 막아 둔 칸)의 틀린 값은
    멈추지 않고 기본값으로 둔다 — 보이지 않는 칸 때문에 만들기 · 설정 저장이 막혔다(검토 js-4)."""
    used = {'font_pt', 'letter_spacing_em', 'header_pt', 'bind_top_mm', 'bind_left_mm'}
    used |= {'line_mm', 'orig_pct'} if s['layout'] == 'right' else {'text_mm', 'write_mm', 'head_pt'}
    if s['range_mode'] in ('chapter', 'chapters'):
        used.add('ch_from')
    if s['range_mode'] == 'chapters':
        used.add('ch_to')
    if s['show_date']:
        used.add('date_pt')
    if not s['footer_like_sub']:
        used.add('footer_pt')
    return used


def normalize(raw):
    base = defaults()
    s = dict(base)
    for k, v in (raw or {}).items() if isinstance(raw, dict) else ():
        if k in s:
            s[k] = v
    if s['layout'] not in ('right', 'below'):
        raise UserError('필사형을 골라 주세요')
    if s['range_mode'] not in ('book', 'chapter', 'chapters'):
        raise UserError('범위를 골라 주세요')
    if s['pair'] not in ('none',) + tuple(PAIRS):
        raise UserError('두 번역 함께(한영 · 영한)를 다시 골라 주세요')
    s['pair_translation'] = str(s['pair_translation'] or '')
    if s['pair'] != 'none' and s['layout'] != 'right':
        raise UserError('한영 · 영한은 오른쪽 필사형에서만 만들 수 있습니다')
    for k in BOOL_KEYS:
        s[k] = bool(s[k])
    used = _used_numbers(s)
    for k, (lo, hi, label) in NUM_RULES.items():
        try:
            v = float(s[k])
            ok = v == v and lo <= v <= hi          # v == v — NaN 거르기
        except (TypeError, ValueError):
            v, ok = None, False
        if not ok:
            if k not in used:
                v = float(base[k])
            elif v is None:
                raise UserError('%s 값이 숫자가 아닙니다: %r' % (label, s[k]))
            else:
                raise UserError('%s은(는) %s ~ %s 사이로 정해 주세요(지금 %s)' % (label, lo, hi, s[k]))
        s[k] = int(v) if k in ('ch_from', 'ch_to') else v
    # 인쇄는 render/dictation 의 _mm(소수 둘째 자리)로 적는다 — 저장 · 견본 · 인쇄가 같은 값이게(검토 nb-6).
    s['letter_spacing_em'] = round(s['letter_spacing_em'], 2)
    for k in TEXT_KEYS:
        s[k] = str(s[k] or '')
        if len(s[k]) > 120:
            raise UserError('글이 너무 깁니다: %s…' % s[k][:20])
    for k in FONT_KEYS:
        s[k] = str(s[k] or '')
        if s[k] and not _font_ok(s[k]):
            raise UserError('서체는 bible-note/fonts/ 안의 파일만 고를 수 있습니다: %s' % s[k])
    if not s['body_font'] or not s['bold_font']:
        raise UserError('본문 서체 · 굵은 서체를 골라 주세요(목록이 비었으면 「서체 받기」에서 본명조를 받아 주세요)')
    if not re.match(r'^#[0-9a-fA-F]{6}$', str(s['text_color'])):
        raise UserError('원문 색이 잘못됐습니다: %s' % s['text_color'])
    glyph_mm = s['font_pt'] * 0.3528
    line = s['line_mm'] if s['layout'] == 'right' else s['text_mm']
    if line < glyph_mm * 1.15:
        raise UserError('줄 높이(%smm)가 글자(%.1fmm)보다 너무 작습니다 — 줄 높이를 늘리거나 글자를 줄여 주세요'
                        % (line, glyph_mm))
    return s


def safe_file_name(name):
    """윈도에서 파일 이름으로 못 쓰는 것을 고친다 — \\ / : * ? " < > | · 제어 문자 → _ · 끝의 점 · 빈칸 빼기 ·
    CON · PRN · AUX · NUL · COM1~9 · LPT1~9 는 뒤에 _. 자동 이름(번역본.json 「이름」이 들어간다)에도 쓴다(검토 nb-3).
    ⚠️ index.html 의 safeFileName 과 같은 규칙이어야 화면에 보이는 이름과 실제 이름이 같다."""
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', '_', name).strip().rstrip('. ')
    stem, dot, ext = name.partition('.')
    if re.fullmatch(r'(?i)con|prn|aux|nul|com[0-9]|lpt[0-9]', stem):
        name = stem + '_' + dot + ext
    return name or '필사노트'


def out_file_name(s, tr, bk, en_tr=None):
    """자동 이름 — 「잠언_개정개역4_3장_아래쪽」 · 한영/영한이면 「잠언_개정개역4+NIV_한영_오른쪽」.
    ⚠️ index.html 의 autoName 과 같은 규칙."""
    if s['out_name'].strip():
        name = s['out_name'].strip()
    else:
        unit = R.chapter_unit(bk['name'])
        parts = [bk['name'], tr['name']]
        if s.get('pair', 'none') != 'none' and en_tr:
            parts = [bk['name'], '%s+%s' % (tr['name'], en_tr['name']), PAIRS[s['pair']]]
        if s['range_mode'] == 'chapter':
            parts.append('%d%s' % (s['ch_from'], unit))
        elif s['range_mode'] == 'chapters':
            a, b = sorted((s['ch_from'], s['ch_to']))
            parts.append('%d-%d%s' % (a, b, unit))
        parts.append('오른쪽' if s['layout'] == 'right' else '아래쪽')
        name = '_'.join(parts)
    if name.lower().endswith('.html'):
        name = name[:-5]
    return safe_file_name(name) + '.html'


def load_presets():
    data = load_json(PRESET_PATH, {})
    return data if isinstance(data, dict) else {}


def save_preset(name, settings):
    name = (name or '').strip()
    if not name or len(name) > 40:
        raise UserError('설정 이름을 1~40자로 적어 주세요')
    s = normalize(settings)
    data = load_presets()
    data[name] = {k: v for k, v in s.items() if k not in LOOK_KEYS_EXCLUDED}
    save_json(PRESET_PATH, data)
    return data


def delete_preset(name):
    data = load_presets()
    data.pop(name, None)
    save_json(PRESET_PATH, data)
    return data


def load_last():
    return load_json(LAST_PATH, None)


def save_last(settings):
    save_json(LAST_PATH, settings)


# ── 꼴마다 값 넣기 ──────────────────────────────────────────────────────
def _apply_common(s):
    """두 꼴이 함께 보는 render 값 — 서체 목록(받기 · 복사 · 저장 자리 검사) · 바닥글."""
    fu = {}
    for p in (s['body_font'], s['bold_font']):
        fu[p] = ORIG_FONT_URL.get(p, '')
    R.FONT_URL = fu

    def slot(path):
        if not path or path == s['body_font']:
            return {}
        return {path: ORIG_FONT_URL.get(path, '')}
    R.HEADER_FONT_URL = slot(s['header_font'])
    R.FOOTER_FONT_URL = slot(s['footer_font'])
    R.FOOTER_LEFT = s['footer_left']
    R.FOOTER_CENTER = s['footer_center_odd']
    R.FOOTER_CENTER_EVEN = s['footer_center_even']
    R.FOOTER_RIGHT = s['footer_right']
    R.FOOTER_PT = s['footer_pt']
    if hasattr(R, 'FOOTER_LIKE_SUBTITLE'):      # 바닥글을 소제목 글씨로(굵게 · 검정) — 2026-11-14 render 에 생김
        R.FOOTER_LIKE_SUBTITLE = s['footer_like_sub']


DATE_SPAN_RE = re.compile(r'<span class="date">.*?일</span>', re.S)


def _patch_right(s):
    """오른쪽 필사형 — render 값 · 감싸기."""
    R.FONT_PT = s['font_pt']
    R.LETTER_SPACING_EM = s['letter_spacing_em']
    R.LINE_MM = s['line_mm']
    R.ORIG_PCT = s['orig_pct']
    R.HEADER_PT = s['header_pt']
    if hasattr(R, 'DATE_PT'):
        R.DATE_PT = s['date_pt']
    if hasattr(R, 'CHAP_SUB_INLINE'):
        R.CHAP_SUB_INLINE = s['chap_sub_inline']

    body, bold, color = s['body_font'], s['bold_font'], s['text_color']
    orig_base_css = R.base_css

    swap = {NOTO_400: body, NOTO_700: bold}
    src_re = re.compile(r"url\('(%s|%s)'\) format\('woff'\)" % (re.escape(NOTO_400), re.escape(NOTO_700)))

    def base_css():
        # ⚠️ 두 자리를 한 번에 바꾼다 — 차례로 str.replace 하면 본문을 「본명조 굵게(700)」로 고른 뒤 700 자리를
        #    바꿀 때 본문 자리까지 바뀌었다(검토 nb-1). 자리마다 꼭 한 번 — 못 찾으면 멈춘다.
        css = orig_base_css()
        found = set(src_re.findall(css))
        if found != set(swap):
            raise UserError('render.py 의 서체 줄(%s)을 못 찾아 서체를 바꿀 수 없습니다'
                            % ', '.join(sorted(set(swap) - found)))
        css = src_re.sub(lambda m: "url('%s') format('%s')" % (swap[m.group(1)], R.font_format(swap[m.group(1)])),
                         css)
        return css + '.orig-col { color:%s; }\n' % color
    R.base_css = base_css

    orig_page_html = R._page_html
    show, prefix = s['show_date'], s['date_prefix']

    def page_html(*a, **k):
        h = orig_page_html(*a, **k)
        if not show:
            h, n = DATE_SPAN_RE.subn('', h, count=1)
        elif prefix:
            n = h.count('<span class="date">')
            h = h.replace('<span class="date">', '<span class="date">%s' % R.esc(prefix), 1)
        else:
            n = 1
        if not n:
            raise UserError('render.py 의 날짜 칸을 못 찾아 날짜 설정을 넣을 수 없습니다')
        return h
    R._page_html = page_html

    # 바닥글 한 줄의 줄 높이를 조인다 — 「소제목 같은 바닥글」(render.FOOTER_LIKE_SUBTITLE)은 본문 크기 굵은 글씨라 16pt(「아주 크게」)
    # 부터 줄 상자(1.44em)가 8mm 칸보다 커서 verify 가 FOOTER_OVERFLOW 로 멈췄다(2026-11-14 · 잘린 데는 없다). 한 줄이라 모양은 그대로.
    extra = ['.ft span { line-height:1.15; }']
    bt, bl = s['bind_top_mm'], s['bind_left_mm']
    if bt or bl:
        orig_usable, orig_avail = R.usable_body_mm, R._avail_width_mm
        R.usable_body_mm = lambda: orig_usable() - bt
        R._avail_width_mm = lambda: orig_avail() - bl
        extra.append('.page { padding-top:%smm; padding-left:%smm; }' % (
            R._mm(R.MARGIN_MM + bt), R._mm(R.MARGIN_MM + bl)))
    orig_page_css = R.page_css

    def page_css(*a, **k):
        return orig_page_css(*a, **k) + '\n'.join(extra) + '\n'
    R.page_css = page_css


def _apply_below(s):
    D.FONT_PT = s['font_pt']
    D.LETTER_SPACING_EM = s['letter_spacing_em']
    D.TEXT_MM = s['text_mm']
    D.WRITE_MM = s['write_mm']
    D.HEAD_PT = s['head_pt']
    D.HEAD_MM = max(9, round(s['head_pt'] * 0.3528 * 1.7, 1))
    D.HEADER_PT = s['header_pt']
    D.DATE_PT = s['date_pt']
    D.SHOW_DATE = s['show_date']
    D.DATE_PREFIX = s['date_prefix']
    D.PARA_MARK = '○' if s['para_mark'] else ''
    D.JUSTIFY = s['justify']
    D.KEEP_WORDS = s['keep_words']
    D.CHAP_SUB_INLINE = s['chap_sub_inline']
    D.VERSE_BREAK = s['verse_break']
    D.TEXT_COLOR = s['text_color']
    D.BIND_TOP_MM = s['bind_top_mm']
    D.BIND_LEFT_MM = s['bind_left_mm']
    D.BODY_FONT = s['body_font']
    D.BOLD_FONT = s['bold_font']
    D.HEADER_FONT = '' if s['header_font'] == s['body_font'] else s['header_font']
    D.FOOTER_FONT = '' if s['footer_font'] == s['body_font'] else s['footer_font']
    D.FOOTER_LIKE_SUB = s['footer_like_sub']


def _build_right(pieces, title, out_path, chrome, max_pages):
    lines_map = G.measure_draft(pieces, chrome)
    if lines_map is None:
        raise UserError('줄 수를 재지 못했습니다 — 다시 눌러 보세요')
    G.apply_line_counts(pieces, lines_map)
    pages = paginate(pieces, R.lines_per_page())
    if max_pages:
        # ⚠️ 번호 칸 폭은 1차(실측)가 쓴 모든 조각으로 정한다 — 미리보기로 앞 2쪽만 넘기면 build_final_html 이 그 2쪽의 절 번호로
        #    번호 칸을 좁혀(아가 1장: 1~8절 한 자리 · 실측은 17절까지 두 자리) 줄이 덜 바뀌고 자체 확인이 LINE_MISMATCH 로 멈췄다.
        digits = R.num_digits(pieces)
        R.num_digits = lambda _verses: digits
        pages = pages[:max_pages]
    G._copy_fonts_beside(out_path)
    with io.open(out_path, 'w', encoding='utf-8') as f:
        f.write(R.build_final_html(pages, title))
    say('인쇄본을 확인하는 중…')
    import verify as V
    V._chrome = _chrome_runner     # verify 는 generate._chrome 을 제 이름으로 들여온다
    problems = V.check_layout(out_path, chrome)
    if problems:
        raise UserError('인쇄본 확인에서 걸렸습니다 — 인쇄하지 마세요: %s' % '; '.join(problems[:6]))
    return len(pages)


def _kill_tree(pid):
    """이 build 가 띄운 크롬 하나를 자식 프로세스까지(PID 로만)."""
    if os.name == 'nt':
        subprocess.run(['taskkill', '/T', '/F', '/PID', str(pid)], capture_output=True)
    else:
        try:
            os.kill(pid, 9)
        except OSError:
            pass


def file_uri(path):
    """크롬에 넘길 file 주소 — 퍼센트 인코딩한다. 'file:///' + 경로로 붙이면 폴더 이름의 「#」 뒤가 주소 조각(fragment)이
    되고 「%41」 이 다른 글자로 풀려, 실측 · 확인이 늘 「다시 돌려 보세요」로 멈췄다(검토 dc-5 · 다른 PC 의 폴더 이름)."""
    return pathlib.Path(os.path.abspath(path)).as_uri()


def _chrome_runner(chrome, flags, target_path):
    """generate._chrome 과 같은 부름 · 같은 멈춤 문구 — 다른 것은 셋.
    ① 출력을 파이프가 아니라 임시 파일로 받고 크롬 본 프로세스가 끝나기만 기다린다(파이프면 크롬이 남긴 자식
      프로세스가 파이프를 쥐고 있는 동안 끝난 줄 모른다). ② 시간을 넘기거나 멈추기 · Ctrl+C 로 빠질 때 그 크롬을
      자식까지 끈다(남는 크롬 없게 · 검토 sv-8). ③ 주소를 퍼센트 인코딩한다(file_uri).
    build() 가 generate · verify 의 _chrome 자리에 끼운다(새 프로세스 한 번만 쓰므로 되돌리지 않는다)."""
    args = [chrome, '--headless', '--disable-gpu'] + flags + [file_uri(target_path)]
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        p = subprocess.Popen(args, stdout=out, stderr=err)
        deadline = time.time() + G.CHROME_TIMEOUT_SEC
        try:
            while True:     # 0.5초마다 — 끝났나 · 「멈추기」를 눌렀나 · 시간을 넘겼나
                try:
                    rc = p.wait(timeout=0.5)
                    break
                except subprocess.TimeoutExpired:
                    if CANCEL_FILE and os.path.exists(CANCEL_FILE):
                        raise Cancelled()       # 위의 finally 들이 임시 파일(_dict_draft_ …)을 지운다
                    if time.time() > deadline:
                        raise SystemExit('!! 크롬이 %d초 안에 끝나지 않았습니다(멈췄을 수 있습니다) — %s'
                                         % (G.CHROME_TIMEOUT_SEC, target_path))
        except BaseException:
            _kill_tree(p.pid)
            raise
        out.seek(0)
        err.seek(0)
        return subprocess.CompletedProcess(args, rc, out.read(), err.read())


def _retry(fn, what):
    """크롬이 드물게 멈춘다(2026-11-14 화면 시험에서 잠언 1장 실측이 한 번 120초 멈춤 · 되풀이하면 4~12초).
    멈춤(시간 넘김)일 때만 한 번 더 — 그 밖의 멈춤(틀린 원문 · 넘친 줄)은 그대로 올린다."""
    for attempt in (1, 2):
        try:
            return fn()
        except SystemExit as e:
            msg = str(e.code)
            if attempt == 1 and '크롬이' in msg and '끝나지 않았습니다' in msg:
                say('⚠ 크롬이 멈춰서 한 번 더 해 봅니다(%s)' % what)
                continue
            raise


def _make_pdf(html_path, pdf_path, chrome):
    if os.path.exists(pdf_path):
        os.remove(pdf_path)
    r = G._chrome(chrome, ['--no-pdf-header-footer', '--print-to-pdf=' + pdf_path,
                           '--virtual-time-budget=30000'], html_path)
    if not os.path.exists(pdf_path) or os.path.getsize(pdf_path) == 0:
        raise UserError('PDF 를 만들지 못했습니다 — 다시 눌러 보세요(%s)'
                        % r.stderr.decode('utf-8', 'replace').strip()[:200])


WORK_PREFIX = '_만드는중_'   # 「_」 로 시작 — bible-note 안이면 .gitignore 의 bible-note/**/_* 에 걸린다


def _work_path(final_path, ext):
    """확인을 통과하기 전까지 쓰는 자리 — 진짜 이름 옆(서체 fonts/ 를 같이 쓴다)."""
    d, n = os.path.split(final_path)
    return os.path.join(d, WORK_PREFIX + os.path.splitext(n)[0] + ext)


def _check_writable(path):
    """이미 있는 파일을 바꿔 끼울 수 있나 — PDF 보기(Acrobat 등)가 열어 두면 윈도는 쓰기를 막는다.
    긴 실측을 다 마친 뒤가 아니라 처음에 알린다(검토 nb-4)."""
    if not os.path.exists(path):
        return
    try:
        with open(path, 'r+b'):
            pass
    except PermissionError:
        raise UserError('「%s」 이(가) 다른 프로그램에 열려 있습니다 — 그 창을 닫고 다시 눌러 주세요'
                        % os.path.basename(path))


def _swap_in(work, final):
    try:
        os.replace(work, final)
    except OSError as e:
        raise UserError('「%s」 이(가) 다른 프로그램에 열려 있어 바꾸지 못했습니다 — 그 창을 닫고 다시 눌러 주세요(%s)'
                        % (os.path.basename(final), e.strerror or e))


def _swap_pair(work_html, out_path, work_pdf, pdf_path):
    """새 HTML(· PDF)을 진짜 이름으로 — 둘 다 바뀌거나 둘 다 옛것 그대로.
    PDF 를 먼저 바꾼 뒤 HTML 바꾸기가 실패하면 「새 PDF + 옛 HTML」 짝이 남았다(검토 nb-n2) — 옛 PDF 를 옆으로 비켜 두었다가
    HTML 이 실패하면 새 PDF 를 치우고 옛 PDF 를 제자리로 되돌린다."""
    backup = None
    if work_pdf:
        if os.path.exists(pdf_path):
            backup = _work_path(pdf_path, '.옛것.pdf')
            _swap_in(pdf_path, backup)           # PDF 가 열려 있으면 여기서 멈춘다 — 아직 아무것도 안 바뀌었다
        try:
            _swap_in(work_pdf, pdf_path)
        except UserError:
            if backup:
                os.replace(backup, pdf_path)
            raise
    try:
        _swap_in(work_html, out_path)
    except UserError as e:
        if work_pdf:
            try:
                os.remove(pdf_path)
                if backup:
                    os.replace(backup, pdf_path)
            except OSError:
                raise UserError('%s — ⚠ PDF 를 옛것으로 되돌리지 못했습니다: %s 를 확인해 주세요' % (e, os.path.basename(pdf_path)))
        raise
    if backup:
        try:
            os.remove(backup)
        except OSError:
            pass


def build(raw, preview=False):
    s = normalize(raw)
    env = get_env()
    os.chdir(HERE)
    if not preview:
        try:            # 꼭 해야 하는 저장이 아니다 — 실패해도 만들기는 이어 간다(검토 nb-n1)
            save_last(raw)
        except OSError as e:
            say('⚠ 마지막 설정을 저장하지 못했습니다(만들기는 이어 갑니다) — %s' % (e.strerror or e))
    en_tr, missing, extra = None, [], []
    if s['pair'] != 'none':      # 한영 · 영한 — 오른쪽 필사형 · 머리글 책 이름 · 「1장」은 한글로(enko_pieces 가 lang 을 안 단다)
        tr, en_tr, bk, pieces, missing, extra = load_pair_pieces(env, s)
        title, lang = bk['name'], 'ko'
    else:
        tr, bk, pieces, title, lang = load_pieces(env, s)
    if preview:
        first = pieces[0]['chapter']
        pieces = [p for p in pieces if p['chapter'] == first]
        missing = [m for m in missing if m[0] == first]
        extra = [m for m in extra if m[0] == first]
    out_dir = os.path.join(env['out_dir'], '_미리보기') if preview else env['out_dir']
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, '미리보기.html' if preview else out_file_name(s, tr, bk, en_tr))
    pdf_path = os.path.splitext(out_path)[0] + '.pdf' if (s['make_pdf'] and not preview) else None
    # ⚠️ 확인을 통과하기 전에는 진짜 이름에 쓰지 않는다 — 걸리거나 멈추면 틀어진 HTML 이 전에 잘 만든 같은 이름 파일을
    #    덮고 옛 PDF 는 그 옆에 남았다(검토 nb-2 · dc-4). 임시 이름에 HTML(· PDF)을 다 만든 뒤 PDF → HTML 차례로 바꾼다.
    work_html = _work_path(out_path, '.html')
    work_pdf = _work_path(out_path, '.pdf') if pdf_path else None

    _apply_common(s)
    for p in (out_path, work_html, pdf_path, work_pdf):
        if p:
            G.ensure_out_path_safe(p)          # 저장소 안이면 커밋에서 빠지는 자리만
    if pdf_path:
        _check_writable(pdf_path)
    _check_writable(out_path)
    G.ensure_fonts()
    for p in (s['body_font'], s['bold_font'], s['header_font'], s['footer_font']):
        if p and not os.path.exists(os.path.join(HERE, p)):
            raise UserError('서체 파일이 없습니다: %s' % p)
    chrome = find_chrome(env)
    unit = R.chapter_unit(bk['name'])
    rng = {'book': '전체', 'chapter': '%d%s' % (s['ch_from'], unit),
           'chapters': '%d~%d%s' % (min(s['ch_from'], s['ch_to']), max(s['ch_from'], s['ch_to']), unit)}[s['range_mode']]
    which = '%s+%s %s' % (tr['name'], en_tr['name'], PAIRS[s['pair']]) if en_tr else tr['name']
    say('%s · %s %s · %d절%s' % (which, bk['name'], rng, G.verse_count(pieces),
                                ' (미리보기 — 첫 장 · 2쪽까지)' if preview else ''))
    if missing:     # 번역마다 절 나눔이 달라 그럴 수 있다 — 멈추지 않고 그 절은 한글만 찍는다
        say('⚠ 영어 번역본 「%s」에 없는 절 %d개(한글만 찍음): %s%s' % (
            en_tr['name'], len(missing), ', '.join('%d:%d' % m for m in missing[:12]), ' …' if len(missing) > 12 else ''))
    if extra:       # 영어에만 있는 절 — 찍히지 않는다. 그 장은 두 번역의 절 나눔이 달라 앞 절들의 짝이 어긋났을 수 있다
        say('⚠ 한글 번역본 「%s」에 없는 영어 절 %d개(찍히지 않음): %s — 그 장은 절 나눔이 달라 짝이 어긋났을 수 있습니다' % (
            tr['name'], len(extra), ', '.join('%d:%d' % m for m in extra[:12]) + (' …' if len(extra) > 12 else '')))
    if lang == 'en' and not preview:
        warn_missing(env, tr, bk, pieces, s)
    say('줄을 재고 쪽을 나누는 중(크롬)…')
    max_pages = 2 if preview else None
    # 크롬 한 번을 얼마나 기다릴지 — 시편 전체(2,461절)가 이 PC 에서 28초 · 미리보기는 크롬 셋에 6~29초.
    # 크롬은 드물게 아예 멈추므로(_retry) 너무 길게 잡지 않되, 느린 PC 를 생각해 절 수만큼 넉넉히(시편 약 4분).
    G.CHROME_TIMEOUT_SEC = 60 if preview else int(90 + 0.06 * G.verse_count(pieces))
    G._chrome = _chrome_runner
    try:
        if s['layout'] == 'right':
            _patch_right(s)
            n_pages = _retry(lambda: _build_right(pieces, title, work_html, chrome, max_pages), '줄 재기')
        else:
            _apply_below(s)
            n_pages, _n_lines = _retry(lambda: D.build(pieces, title, work_html, chrome, max_pages), '줄 재기')
        if pdf_path:
            _check_cancel()
            say('PDF 를 만드는 중…')
            _retry(lambda: _make_pdf(work_html, work_pdf, chrome), 'PDF')
        _check_cancel()
        _swap_pair(work_html, out_path, work_pdf, pdf_path)   # 둘 다 바뀌거나 둘 다 옛것 그대로
    finally:
        for p in (work_html, work_pdf):
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
    say('완료 — %d쪽 · %s' % (n_pages, os.path.basename(out_path)))
    return {'html': out_path, 'pdf': pdf_path, 'pages': n_pages, 'verses': G.verse_count(pieces),
            'preview': preview, 'out_dir': env['out_dir']}


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == 'list':
        env = get_env()
        print(json.dumps({'env': env, 'translations': [dict(t, books=len(t['books'])) for t in translations(env)],
                          'fonts': list_fonts()}, ensure_ascii=False, indent=1))
        return
    if len(sys.argv) < 3 or sys.argv[1] != 'build':
        raise SystemExit('사용법: python notebook.py build <설정.json> [--preview] [--cancel <멈춤 표시 파일>] | list')
    global CANCEL_FILE
    rest = sys.argv[3:]
    if '--cancel' in rest and rest.index('--cancel') + 1 < len(rest):
        CANCEL_FILE = rest[rest.index('--cancel') + 1]
    try:
        raw = load_json(sys.argv[2], None)
        if raw is None:
            raise UserError('설정 파일이 없습니다: %s' % sys.argv[2])
        result = build(raw, preview='--preview' in rest)
    except Cancelled:
        print('!! 멈췄습니다', flush=True)
        sys.exit(2)
    except (UserError, P.SourceTextError, R.FontSettingError, ValueError) as e:
        print('!! %s' % e, flush=True)
        sys.exit(1)
    except OSError as e:     # 열린 파일 · 빠진 USB · 권한 — 트레이스백 대신 한 줄로(검토 nb-4)
        print('!! 파일을 읽거나 쓰지 못했습니다 — %s(%s)' % (e.filename or '', e.strerror or e), flush=True)
        sys.exit(1)
    except SystemExit as e:
        if e.code not in (None, 0):
            print(e.code if str(e.code).startswith('!!') else '!! %s' % e.code, flush=True)
        sys.exit(1)
    print('RESULT ' + json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
