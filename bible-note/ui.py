# -*- coding: utf-8 -*-
"""성경 필사노트 만들기 화면 — 이 PC 에서만(127.0.0.1) 뜨는 작은 웹 화면.

    python ui.py              # 브라우저가 저절로 열린다(http://127.0.0.1:8770)
    (윈도: 필사노트_화면.bat 을 두 번 누른다)

화면은 ui/index.html 하나. 만들기는 notebook.py 를 **새 프로세스로** 띄운다 — notebook 이 render ·
dictation 의 모듈 값을 바꿔 넣으므로, 이 서버 안에서 부르면 앞 설정이 다음 만들기에 남는다.
⚠️ 127.0.0.1 에만 연다 — 같은 망의 다른 기기가 성경 본문이 든 파일을 열 수 없게.
⚠️ 끄기는 이 창을 닫거나 Ctrl+C. 만드는 중 「멈추기」는 이 서버가 띄운 프로세스(PID)만 끈다.
"""
import http.server
import json
import os
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
JOB_DIR = os.path.join(HERE, '_작업')
TYPES = {'.html': 'text/html; charset=utf-8', '.woff': 'font/woff', '.woff2': 'font/woff2',
         '.ttf': 'font/ttf', '.otf': 'font/otf', '.pdf': 'application/pdf'}


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


def file_url(path):
    """만든 파일의 절대 경로 → 이 서버 주소(/files/out/…). 저장 폴더 밖이면 None."""
    root = os.path.realpath(NB.get_env()['out_dir'])
    real = os.path.realpath(path)
    try:
        if os.path.commonpath([root, real]) != root:
            return None
    except ValueError:
        return None
    rel = os.path.relpath(real, root).replace(os.sep, '/')
    return '/files/out/' + urllib.parse.quote(rel)


def run_job(job, settings):
    os.makedirs(JOB_DIR, exist_ok=True)
    path = os.path.join(JOB_DIR, job.id + '.json')
    NB.save_json(path, settings)
    cmd = [sys.executable, os.path.join(HERE, 'notebook.py'), 'build', path, '--cancel', job.cancel_path]
    if job.preview:
        cmd.append('--preview')
    env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUTF8='1')
    try:
        job.proc = subprocess.Popen(cmd, cwd=HERE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
        for raw in job.proc.stdout:
            line = raw.decode('utf-8', 'replace').rstrip()
            if line.startswith('RESULT '):
                res = json.loads(line[7:])
                res['url'] = file_url(res['html'])
                res['pdf_url'] = file_url(res['pdf']) if res.get('pdf') else None
                job.result = res
            elif line.strip():
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


def cancel_job(job, wait=False):
    """「멈추기」 — 멈춤 표시 파일을 두면 notebook 이 크롬을 끄고 임시 파일을 지운 뒤 스스로 끝난다(0.5초마다 본다).
    20초 안에 안 끝나면 그때만 이 서버가 띄운 프로세스 나무(PID)째 끈다 — 이때는 임시 파일(_dict_draft_ …)이 남을 수 있다.
    예전엔 처음부터 나무째 꺼서 2.9MB 짜리 실측 사본이 bible-note/ 에 남았다(2026-11-14 화면 시험)."""
    if not (job.proc and job.proc.poll() is None):
        return
    job.cancelled = True
    try:
        os.makedirs(JOB_DIR, exist_ok=True)
        open(job.cancel_path, 'w').close()
    except OSError:
        pass

    def fallback():
        try:
            job.proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            if os.name == 'nt':
                subprocess.run(['taskkill', '/T', '/F', '/PID', str(job.proc.pid)], capture_output=True)
            else:
                job.proc.terminate()
    if wait:
        fallback()
    else:
        threading.Thread(target=fallback, daemon=True).start()


def state():
    env = NB.get_env()
    return {
        'env': env, 'env_status': NB.env_status(env),
        'translations': NB.translations(env),
        'fonts': NB.list_fonts(), 'catalog': NB.font_catalog_state(),
        'defaults': NB.defaults(), 'layout_defaults': NB.layout_defaults(), 'size_steps': NB.SIZE_STEPS,
        'presets': NB.load_presets(), 'last': NB.load_last(), 'rules': NB.RULES,
        'look_excluded': list(NB.LOOK_KEYS_EXCLUDED),
    }


def open_path(path):
    if os.name == 'nt':
        os.startfile(path)
    else:
        subprocess.Popen(['open' if sys.platform == 'darwin' else 'xdg-open', path])


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8')

    def _body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return json.loads(self.rfile.read(n).decode('utf-8') or '{}') if n else {}

    def _serve_file(self, root_key, rel):
        if root_key == 'note':
            root = HERE
            if not (rel.startswith('fonts/') and rel.count('/') == 1):
                return self._send(404, b'not found', 'text/plain')
        elif root_key == 'out':
            root = NB.get_env()['out_dir']
        else:
            return self._send(404, b'not found', 'text/plain')
        root = os.path.realpath(root)
        real = os.path.realpath(os.path.join(root, rel))
        ext = os.path.splitext(real)[1].lower()
        try:
            inside = os.path.commonpath([root, real]) == root
        except ValueError:
            inside = False
        if not inside or ext not in TYPES or not os.path.isfile(real):
            return self._send(404, b'not found', 'text/plain')
        with open(real, 'rb') as f:
            self._send(200, f.read(), TYPES[ext])

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        p = u.path
        try:
            if p in ('/', '/index.html'):
                with open(os.path.join(HERE, 'ui', 'index.html'), 'rb') as f:
                    return self._send(200, f.read(), 'text/html; charset=utf-8')
            if p == '/api/ping':
                return self._send(200, PING.encode(), 'text/plain')
            if p == '/api/state':
                return self._json(state())
            if p == '/api/chapters':
                n = NB.chapter_count(NB.get_env(), q.get('tr', [''])[0], q.get('book', [''])[0])
                return self._json({'chapters': n})
            if p == '/api/job':
                job = JOBS.get(q.get('id', [''])[0])
                if not job:
                    return self._json({'error': '작업을 못 찾았습니다'}, 404)
                return self._json({'status': job.status, 'log': job.log, 'result': job.result,
                                   'seconds': round((job.ended or time.time()) - job.started)})
            if p.startswith('/files/'):
                parts = urllib.parse.unquote(p[len('/files/'):]).split('/', 1)
                return self._serve_file(parts[0], parts[1] if len(parts) > 1 else '')
            return self._send(404, b'not found', 'text/plain')
        except (NB.UserError, NB.P.SourceTextError) as e:
            return self._json({'error': str(e)}, 400)

    def do_POST(self):
        p = urllib.parse.urlparse(self.path).path
        try:
            data = self._body()
            if p == '/api/build':
                if any(j.status == 'running' for j in JOBS.values()):
                    return self._json({'error': '만드는 중인 것이 있습니다 — 끝나거나 멈춘 뒤에 눌러 주세요'}, 409)
                NB.normalize(data.get('settings'))   # 틀린 값은 프로세스를 띄우기 전에
                job = Job(bool(data.get('preview')))
                JOBS[job.id] = job
                threading.Thread(target=run_job, args=(job, data.get('settings')), daemon=True).start()
                return self._json({'id': job.id})
            if p == '/api/cancel':
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


def already_running(port):
    try:
        with urllib.request.urlopen('http://127.0.0.1:%d/api/ping' % port, timeout=1) as r:
            return r.read().decode() == PING
    except Exception:
        return False


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    for port in range(PORT, PORT + 10):
        if already_running(port):
            url = 'http://127.0.0.1:%d/' % port
            print('이미 열려 있습니다 — %s' % url)
            webbrowser.open(url)
            return
        try:
            server = http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler)
            break
        except OSError:
            continue
    else:
        raise SystemExit('!! 빈 포트를 못 찾았습니다(%d~%d)' % (PORT, PORT + 9))
    url = 'http://127.0.0.1:%d/' % server.server_address[1]
    print('필사노트 만들기 화면 — %s' % url)
    print('끄려면 이 창을 닫거나 Ctrl+C')
    if '--no-browser' not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        for job in JOBS.values():
            cancel_job(job, wait=True)


if __name__ == '__main__':
    main()
