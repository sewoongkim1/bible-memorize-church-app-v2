# -*- coding: utf-8 -*-
"""성경 필사노트 만들기 화면 — 이 PC 에서만(127.0.0.1) 뜨는 작은 웹 화면.

    python ui.py              # 브라우저가 저절로 열린다(http://127.0.0.1:8770)
    (윈도: 필사노트_화면.bat 을 두 번 누른다)

화면은 ui/index.html 하나. 만들기는 notebook.py 를 **새 프로세스로** 띄운다 — notebook 이 render ·
dictation 의 모듈 값을 바꿔 넣으므로, 이 서버 안에서 부르면 앞 설정이 다음 만들기에 남는다.

⚠️ 지키는 것(2026-11-14 검토 sv-1 · sv-2 · sv-5 — 친구가 화면을 켜 둔 채 다른 사이트를 열 수 있다):
   - 127.0.0.1 에만 연다 · Host 머리가 127.0.0.1/localhost:<포트> 가 아니면 403(DNS 재바인딩).
   - 켤 때마다 비밀값을 새로 만들어 화면(/)을 열 때 SameSite=Strict 쿠키로 준다. /api · /files 는 그 쿠키가 있어야
     한다 — 다른 사이트의 img · 폼 · fetch 는 이 쿠키를 싣지 못한다. 서버를 다시 켜면 열린 화면은 새로 고쳐야 한다.
   - POST 는 Content-Type application/json 만 · Origin 이 있으면 이 주소만 · Sec-Fetch-Site cross-site 는 거절.
   - /files/ 의 경로는 파일 시스템에 닿기 전에 거른다(역슬래시 · 드라이브 문자 · UNC · '..').
⚠️ 끄기는 이 창을 닫거나 Ctrl+C — 만드는 중이던 작업은 멈춤 표시 파일로 스스로 정리하게 하고, 안 끝나면 PID 째 끈다.
"""
import hmac
import http.cookies
import http.server
import json
import os
import secrets
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
import uuid
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import notebook as NB

PORT = 8770
PING = 'bible-note-ui'
JOBS = {}
JOBS_LOCK = threading.Lock()
JOB_DIR = os.path.join(HERE, '_작업')
FONT_TYPES = {'.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf'}
FILE_TYPES = dict(FONT_TYPES, **{'.html': 'text/html; charset=utf-8', '.pdf': 'application/pdf'})
TOKEN = secrets.token_urlsafe(24)       # 켤 때마다 새로
COOKIE = 'nbui'
HOSTS = set()                           # 켤 때 채운다 — '127.0.0.1:<포트>' · 'localhost:<포트>'
MAX_BODY = 1 << 20
NEW_GROUP = getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0)


class Job:
    def __init__(self, preview):
        self.id = uuid.uuid4().hex[:12]
        self.preview = preview
        self.log = []
        self.status = 'running'
        self.result = None
        self.proc = None
        self.cancelled = False
        self.started = time.time()
        self.ended = None
        self.cancel_path = os.path.join(JOB_DIR, self.id + '.cancel')


def ping_text():
    return '%s|%s' % (PING, os.path.normcase(HERE))


# ── 파일 길 ─────────────────────────────────────────────────────────────
def safe_parts(rel):
    """/files/ 뒤의 상대 경로 → 조각 목록. 파일 시스템에 닿기 전에 거른다(걸리면 None).
    역슬래시는 빗금으로 본 뒤 — 빈 조각 · '.' · '..' · 드라이브 문자(':') · 맨 앞 빗금(UNC · 절대 경로)을 막는다.
    os.path.join 은 뒤가 절대 경로면 앞을 버리고, realpath 는 UNC 를 SMB 로 열어 본다(검토 sv-2 · sv-5)."""
    rel = rel.replace('\\', '/')
    if not rel or rel.startswith('/') or ':' in rel or '\x00' in rel:
        return None
    parts = rel.split('/')
    if any(p in ('', '.', '..') for p in parts):
        return None
    return parts


def resolve_inside(root, parts):
    """root 아래 그 조각의 실제 경로 — 문자열로 먼저 안쪽인지 본 뒤, 심볼릭 링크를 풀어 한 번 더 본다. 밖이면 None."""
    root = os.path.abspath(root)
    path = os.path.normpath(os.path.join(root, *parts))
    if not os.path.normcase(path).startswith(os.path.normcase(os.path.join(root, ''))):
        return None
    real_root, real = os.path.normcase(os.path.realpath(root)), os.path.realpath(path)
    try:
        if os.path.commonpath([real_root, os.path.normcase(real)]) != real_root:
            return None
    except ValueError:
        return None
    return real


def job_url(job_id, out_dir, path):
    """만든 파일 → 이 서버 주소(/files/job/<작업>/<저장 폴더 안 상대 경로>). 작업이 쓴 저장 폴더에 묶는다 —
    만드는 중이나 뒤에 저장 폴더를 바꿔도 결과 주소가 맞는다(검토 sv-7)."""
    try:
        rel = os.path.relpath(os.path.abspath(path), os.path.abspath(out_dir))
    except ValueError:      # 다른 드라이브
        return None
    if rel == os.curdir or rel.split(os.sep)[0] == os.pardir:
        return None
    return '/files/job/%s/%s' % (job_id, urllib.parse.quote(rel.replace(os.sep, '/')))


# ── 작업 ───────────────────────────────────────────────────────────────
def run_job(job, settings):
    os.makedirs(JOB_DIR, exist_ok=True)
    path = os.path.join(JOB_DIR, job.id + '.json')
    try:
        if job.cancelled:       # 프로세스를 띄우기 전에 멈추기를 눌렀다
            job.status = 'cancelled'
            return
        NB.save_json(path, settings)
        cmd = [sys.executable, os.path.join(HERE, 'notebook.py'), 'build', path, '--cancel', job.cancel_path]
        if job.preview:
            cmd.append('--preview')
        env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUTF8='1')
        # 새 프로세스 그룹 — 콘솔의 Ctrl+C 가 자식에게 바로 가지 않게(자식은 멈춤 표시 파일을 보고 스스로 정리한다 · 검토 sv-8)
        job.proc = subprocess.Popen(cmd, cwd=HERE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env,
                                    creationflags=NEW_GROUP)
        if job.cancelled:
            open(job.cancel_path, 'w').close()
        for raw in job.proc.stdout:
            line = raw.decode('utf-8', 'replace').rstrip()
            if line.startswith('RESULT '):
                try:
                    res = json.loads(line[7:])
                    res['url'] = job_url(job.id, res['out_dir'], res['html'])
                    res['pdf_url'] = job_url(job.id, res['out_dir'], res['pdf']) if res.get('pdf') else None
                    job.result = res
                except (ValueError, KeyError, TypeError) as e:
                    job.log.append('!! 만든 결과를 읽지 못했습니다 — %s' % e)
            elif line.strip() and len(job.log) < 500:
                job.log.append(line)
        rc = job.proc.wait()
        if job.cancelled:
            job.status = 'cancelled'
        else:
            job.status = 'done' if rc == 0 and job.result else 'error'
            if job.status == 'error' and not any(l.startswith('!!') for l in job.log):
                job.log.append('!! 만들기가 멈췄습니다(코드 %s) — 위 기록을 확인해 주세요' % rc)
    except Exception as e:
        job.status = 'error'
        job.log.append('!! %s' % e)
    finally:
        job.ended = time.time()
        for p in (path, job.cancel_path):
            try:
                os.remove(p)
            except OSError:
                pass


def _kill_tree(proc):
    if os.name == 'nt':
        subprocess.run(['taskkill', '/T', '/F', '/PID', str(proc.pid)], capture_output=True)
    else:
        proc.terminate()


def cancel_job(job, wait=False, grace=20):
    """「멈추기」 — 멈춤 표시 파일을 두면 notebook 이 크롬을 끄고 임시 파일을 지운 뒤 스스로 끝난다(0.5초마다 본다).
    grace 초 안에 안 끝나면 그때만 이 서버가 띄운 프로세스 나무(PID)째 끈다 — 이때는 임시 파일이 남을 수 있다.
    프로세스가 생기기 전이면 표시만 해 두고 run_job 이 띄우지 않는다."""
    if job.status != 'running':
        return
    job.cancelled = True
    try:
        os.makedirs(JOB_DIR, exist_ok=True)
        open(job.cancel_path, 'w').close()
    except OSError:
        pass
    proc = job.proc
    if proc is None or proc.poll() is not None:
        return

    def fallback():
        try:
            proc.wait(timeout=grace)
        except subprocess.TimeoutExpired:
            _kill_tree(proc)
    if wait:
        fallback()
    else:
        threading.Thread(target=fallback, daemon=True).start()


def shutdown_jobs(grace):
    """서버를 끌 때 — 돌고 있는 작업마다 멈춤 표시 → grace 초 기다림 → 남으면 나무째."""
    with JOBS_LOCK:
        running = [j for j in JOBS.values() if j.status == 'running']
    for j in running:
        cancel_job(j)
    deadline = time.time() + grace
    for j in running:
        if j.proc and j.proc.poll() is None:
            try:
                j.proc.wait(timeout=max(0.1, deadline - time.time()))
            except subprocess.TimeoutExpired:
                _kill_tree(j.proc)


def running_job():
    with JOBS_LOCK:
        for j in JOBS.values():
            if j.status == 'running':
                return {'id': j.id, 'preview': j.preview, 'seconds': round(time.time() - j.started)}
    return None


def state():
    """화면 처음 · 환경 저장 뒤. ⚠️ 한 조각(_환경.json · 번역본.json · 설정묶음.json · _마지막설정.json)이 틀려도 화면 전체가
    멈추지 않게 조각마다 받고, 틀린 것은 warnings 로 알린다(검토 js-2 · sv-4)."""
    warnings = []
    env = NB.get_env(warnings)
    trs = NB.translations(env, warnings)
    try:
        presets = NB.load_presets()
    except NB.UserError as e:
        warnings.append('%s — 저장한 설정 묶음을 쓸 수 없습니다' % e)
        presets = {}
    try:
        last = NB.load_last()
    except NB.UserError as e:
        warnings.append('%s — 처음 값으로 엽니다' % e)
        last = None
    return {
        'env': env, 'env_status': NB.env_status(env), 'translations': trs,
        'fonts': NB.list_fonts(), 'catalog': NB.font_catalog_state(),
        'defaults': NB.defaults(), 'layout_defaults': NB.layout_defaults(), 'size_steps': NB.SIZE_STEPS,
        'presets': presets, 'last': last if isinstance(last, dict) else None, 'rules': NB.RULES,
        'look_excluded': list(NB.LOOK_KEYS_EXCLUDED), 'warnings': warnings, 'running': running_job(),
    }


def open_path(path):
    if os.name == 'nt':
        os.startfile(path)
    else:
        subprocess.Popen(['open' if sys.platform == 'darwin' else 'xdg-open', path])


# ── 요청 ───────────────────────────────────────────────────────────────
class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype, extra=None):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8')

    def _deny(self, why, reload=False):
        self._json({'error': why, 'reload': reload}, 403)
        return False

    def _guard(self, token=True, post=False):
        """다른 사이트 · 다른 이름(Host)으로 온 요청을 거른다(검토 sv-1). 통과하면 True."""
        if (self.headers.get('Host') or '').lower() not in HOSTS:
            return self._deny('이 주소로는 열 수 없습니다(Host)')
        if (self.headers.get('Sec-Fetch-Site') or '').lower() == 'cross-site':
            return self._deny('다른 사이트에서 온 요청은 받지 않습니다')
        if post:
            origin = self.headers.get('Origin')
            if origin and origin.lower() not in {'http://' + h for h in HOSTS}:
                return self._deny('다른 사이트에서 온 요청은 받지 않습니다(Origin)')
            if not (self.headers.get('Content-Type') or '').lower().startswith('application/json'):
                return self._deny('JSON 요청만 받습니다')
        if token:
            jar = http.cookies.SimpleCookie()
            try:
                jar.load(self.headers.get('Cookie') or '')
            except http.cookies.CookieError:
                pass
            got = jar[COOKIE].value if COOKIE in jar else ''
            if not hmac.compare_digest(got, TOKEN):
                return self._deny('화면 서버가 다시 켜졌습니다 — 화면을 새로 고쳐 주세요(F5)', reload=True)
        return True

    def _body(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > MAX_BODY:
            raise NB.UserError('요청이 너무 큽니다')
        if not n:
            return {}
        try:
            data = json.loads(self.rfile.read(n).decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            raise NB.UserError('요청 본문이 JSON 이 아닙니다')
        if not isinstance(data, dict):
            raise NB.UserError('요청 본문이 JSON 객체가 아닙니다')
        return data

    def _serve_file(self, kind, rest):
        parts = safe_parts(rest)
        if parts is None:
            return self._send(404, b'not found', 'text/plain')
        if kind == 'note':                       # 서체 견본 — bible-note/fonts/<파일> 하나만
            if len(parts) != 2 or parts[0] != 'fonts':
                return self._send(404, b'not found', 'text/plain')
            root, types = HERE, FONT_TYPES
        elif kind == 'job':                      # 만든 결과 — 그 작업이 쓴 저장 폴더 안만
            with JOBS_LOCK:
                job = JOBS.get(parts[0])
            if not job or not job.result or len(parts) < 2:
                return self._send(404, b'not found', 'text/plain')
            root, types, parts = job.result['out_dir'], FILE_TYPES, parts[1:]
        else:
            return self._send(404, b'not found', 'text/plain')
        real = resolve_inside(root, parts)
        ext = os.path.splitext(real or '')[1].lower()
        if not real or ext not in types or not os.path.isfile(real):
            return self._send(404, b'not found', 'text/plain')
        with open(real, 'rb') as f:
            self._send(200, f.read(), types[ext], {'X-Frame-Options': 'SAMEORIGIN'})

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        p = u.path
        try:
            if p == '/api/ping':                  # 다른 ui.py 가 「이미 켜져 있나」 볼 때 — 쿠키 없이
                if (self.headers.get('Host') or '').lower() not in HOSTS:
                    return self._deny('이 주소로는 열 수 없습니다(Host)')
                return self._send(200, ping_text().encode('utf-8'), 'text/plain; charset=utf-8')
            if p in ('/', '/index.html'):
                if (self.headers.get('Host') or '').lower() not in HOSTS:
                    return self._deny('이 주소로는 열 수 없습니다(Host)')
                with open(os.path.join(HERE, 'ui', 'index.html'), 'rb') as f:
                    return self._send(200, f.read(), 'text/html; charset=utf-8', {
                        'Set-Cookie': '%s=%s; Path=/; SameSite=Strict; HttpOnly' % (COOKIE, TOKEN),
                        'X-Frame-Options': 'DENY'})
            if not self._guard():
                return
            if p == '/api/state':
                return self._json(state())
            if p == '/api/env':                   # 상태 전체가 실패할 때 화면이 환경 칸만이라도 채우게
                warnings = []
                env = NB.get_env(warnings)
                return self._json({'env': env, 'env_status': NB.env_status(env), 'warnings': warnings})
            if p == '/api/chapters':
                n = NB.chapter_count(NB.get_env(), q.get('tr', [''])[0], q.get('book', [''])[0])
                return self._json({'chapters': n})
            if p == '/api/job':
                with JOBS_LOCK:
                    job = JOBS.get(q.get('id', [''])[0])
                if not job:
                    return self._json({'error': '작업을 못 찾았습니다(서버가 다시 켜졌을 수 있습니다)'}, 404)
                return self._json({'status': job.status, 'log': list(job.log), 'result': job.result,
                                   'preview': job.preview,
                                   'seconds': round((job.ended or time.time()) - job.started)})
            if p.startswith('/files/'):
                kind, _sep, rest = urllib.parse.unquote(p[len('/files/'):]).partition('/')
                return self._serve_file(kind, rest)
            return self._send(404, b'not found', 'text/plain')
        except (NB.UserError, NB.P.SourceTextError) as e:
            return self._json({'error': str(e)}, 400)
        except Exception as e:   # 연결을 그냥 끊지 말고 원인을 보이게(검토 sv-4)
            return self._json({'error': '뜻밖의 오류 — %s' % e}, 500)

    def do_POST(self):
        p = urllib.parse.urlparse(self.path).path
        try:
            if not self._guard(post=True):
                return
            data = self._body()
            if p == '/api/build':
                NB.normalize(data.get('settings'))   # 틀린 값은 프로세스를 띄우기 전에
                with JOBS_LOCK:
                    busy = next((j for j in JOBS.values() if j.status == 'running'), None)
                    if busy:
                        return self._json({'error': '만드는 중인 것이 있습니다 — 끝나거나 멈춘 뒤에 눌러 주세요',
                                           'running': {'id': busy.id, 'preview': busy.preview}}, 409)
                    job = Job(bool(data.get('preview')))
                    JOBS[job.id] = job
                    old = sorted((j for j in JOBS.values() if j.status != 'running'), key=lambda j: j.started)
                    for j in old[:-50]:          # 끝난 작업은 50개까지만 둔다
                        JOBS.pop(j.id, None)
                threading.Thread(target=run_job, args=(job, data.get('settings')), daemon=True).start()
                return self._json({'id': job.id})
            if p == '/api/cancel':
                with JOBS_LOCK:
                    job = JOBS.get(data.get('id'))
                if job:
                    cancel_job(job)
                return self._json({'ok': True})
            if p == '/api/last':
                NB.save_last(data.get('settings') or {})
                return self._json({'ok': True})
            if p == '/api/presets/save':
                return self._json({'presets': NB.save_preset(data.get('name'), data.get('settings'))})
            if p == '/api/presets/delete':
                return self._json({'presets': NB.delete_preset(data.get('name'))})
            if p == '/api/env':
                if running_job():
                    raise NB.UserError('만드는 중에는 환경을 바꿀 수 없습니다 — 끝나거나 멈춘 뒤에')
                NB.save_env(data)
                return self._json(state())
            if p == '/api/fonts/download':
                NB.download_font(data.get('key'))
                return self._json({'fonts': NB.list_fonts(), 'catalog': NB.font_catalog_state()})
            if p == '/api/open':
                env = NB.get_env()
                what = data.get('what')
                if what == 'out_dir':
                    os.makedirs(env['out_dir'], exist_ok=True)
                    open_path(env['out_dir'])
                elif what == 'fonts':
                    os.makedirs(NB.FONT_DIR, exist_ok=True)
                    open_path(NB.FONT_DIR)
                elif what == 'bible_dir' and os.path.isdir(env['bible_dir']):
                    open_path(env['bible_dir'])
                else:
                    return self._json({'error': '열 수 없는 자리입니다'}, 400)
                return self._json({'ok': True})
            return self._send(404, b'not found', 'text/plain')
        except (NB.UserError, NB.P.SourceTextError, NB.R.FontSettingError) as e:
            return self._json({'error': str(e)}, 400)
        except Exception as e:   # 화면에 보이게(트레이스백 대신)
            return self._json({'error': '뜻밖의 오류 — %s' % e}, 500)


class Server(http.server.ThreadingHTTPServer):
    """⚠️ 포트를 혼자 쓴다 — 기본(allow_reuse_address)이면 윈도에서 두 서버가 같은 포트를 함께 들어, 만들기와 진행
    물음이 다른 서버로 갈렸다(검토 sv-6). 다른 프로그램이 쓰는 포트도 OSError 가 나야 다음 포트로 간다."""
    allow_reuse_address = False
    daemon_threads = True

    def server_bind(self):
        if os.name == 'nt' and hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def already_running(port):
    """그 포트에 「이 폴더의」 화면 서버가 떠 있나 — 다른 체크아웃의 ui.py 는 아니라고 본다."""
    try:
        with urllib.request.urlopen('http://127.0.0.1:%d/api/ping' % port, timeout=1) as r:
            return r.read().decode('utf-8', 'replace') == ping_text()
    except Exception:
        return False


_CTRL_HANDLER = None


def _install_close_handler():
    """콘솔 창 X · 로그오프 · 끄기에도 만들던 작업을 정리한다 — 그냥 두면 finally 가 돌지 않아 크롬과 임시 파일이 남았다
    (검토 sv-8). Ctrl+C 는 파이썬 기본 처리(KeyboardInterrupt → main 의 finally)로 넘긴다."""
    global _CTRL_HANDLER
    if os.name != 'nt':
        return
    try:
        import ctypes
        from ctypes import wintypes
        HANDLER = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.DWORD)

        def handler(kind):
            if kind in (2, 5, 6):          # CTRL_CLOSE · CTRL_LOGOFF · CTRL_SHUTDOWN — 윈도는 몇 초만 기다려 준다
                shutdown_jobs(grace=4)
                return True
            return False
        _CTRL_HANDLER = HANDLER(handler)   # 참조를 쥐고 있어야 지워지지 않는다
        ctypes.windll.kernel32.SetConsoleCtrlHandler(_CTRL_HANDLER, True)
    except Exception:
        pass


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    server = None
    for port in range(PORT, PORT + 10):
        if already_running(port):
            url = 'http://127.0.0.1:%d/' % port
            print('이미 열려 있습니다 — %s' % url)
            if '--no-browser' not in sys.argv:
                webbrowser.open(url)
            return
        try:
            server = Server(('127.0.0.1', port), Handler)
            break
        except OSError:
            continue
    if server is None:
        raise SystemExit('!! 빈 포트를 못 찾았습니다(%d~%d)' % (PORT, PORT + 9))
    port = server.server_address[1]
    HOSTS.update({'127.0.0.1:%d' % port, 'localhost:%d' % port})
    _install_close_handler()
    url = 'http://127.0.0.1:%d/' % port
    print('필사노트 만들기 화면 — %s' % url)
    print('끄려면 이 창을 닫거나 Ctrl+C')
    if '--no-browser' not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        shutdown_jobs(grace=8)


if __name__ == '__main__':
    main()
