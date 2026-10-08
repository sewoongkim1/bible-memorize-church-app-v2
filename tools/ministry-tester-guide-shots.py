# -*- coding: utf-8 -*-
"""사역관리 시험 사용 안내(tools/ministry-tester-guide-gen.py)의 화면 그림 찍기 — 개발 DB 전용 · 2026-10-02

■ 누구로 찍나 — 실명이 찍히면 안 된다(저장소가 공개다)
  성도님  : 앱 계정 「교구 사랑 3목장 김시험」 + 개발 교인명부에 같은 가짜 교인(교인ID 990000901) + 사역 이력 세 줄
  담당자  : 카카오 대신 이메일 계정(ca-seed-guide-…@example.test · 개발 시험과 같은 길) → 「사랑 1목장 시험담당」 · 역할 ministry
  ⚠️ 개발 DB 의 사역팀 정보에는 실명·번호가 든 줄(장학)이 있다 — 사역팀 정보 그림은 「찬양대」로 걸러 찍는다.

■ 준비
  1) 화면 두 벌을 내 포트로 띄운다(8000 은 다른 세션이 쓴다 · 끌 때는 내 PID 만):
       성경암송 origin/main 을 풀어 둔 폴더에서  python -m http.server 8791 --bind 127.0.0.1
       교회 어드민 origin/main 을 풀어 둔 폴더에서 python -m http.server 8792 --bind 127.0.0.1
     (localhost 라 둘 다 저절로 개발 DB 를 본다 · 공유 체크아웃은 origin 보다 뒤일 수 있어 git archive 로 푼 판을 쓴다)
  2) ~/.church-admin/dev.env(DEV_URL · DEV_ANON · DEV_SERVICE_KEY)

■ 차례(앞 단계가 만든 자료를 뒤 단계가 쓴다)
  python tools/ministry-tester-guide-shots.py prep      # 가짜 교인·사역 이력 · 담당자 이메일 계정
  python tools/ministry-tester-guide-shots.py app1      # 첫 화면 → 신청 → 사역 이력 → 정정 신청 두 건
  python tools/ministry-tester-guide-shots.py admin1    # 로그인 · 처음 오셨어요(승인 요청) · 승인 대기
  python tools/ministry-tester-guide-shots.py activate  # 승인 + 역할 ministry(총괄 관리자 대신)
  python tools/ministry-tester-guide-shots.py admin2    # 메뉴 · 🧪 시험 참여자 더하기 · 신청 현황
  python tools/ministry-tester-guide-shots.py admin3    # 📮 정정 신청 처리(빠진 사역 반영 · 그 밖에 확인 중) · 사역 이력 · 임명현황
  python tools/ministry-tester-guide-shots.py app2      # 처리 뒤 성도님 화면
  python tools/ministry-tester-guide-shots.py admin4    # 정정 신청 목록(전부) · 처리 창 · 사역팀 정보(찬양대)
  python tools/ministry-tester-guide-gen.py <찍은 폴더>  # 잘라서 JPG · HTML · PDF
  python tools/ministry-tester-guide-shots.py down      # ⚠️ 끝나면 꼭 — 넣은 것을 모두 지운다(담당자 계정까지)
  찍은 폴더: 환경 변수 GUIDE_SHOTS(없으면 %TEMP%/tester-guide-shots). 담당자 세션도 거기 둔다(커밋 금지).
  세션이 한 시간 넘게 지나면 `refresh` 를 한 번 돌린다.
"""
import io, json, os, sys, time, urllib.parse, urllib.request, urllib.error

OUT_DIR = os.environ.get('GUIDE_SHOTS') or os.path.join(os.environ.get('TEMP', '.'), 'tester-guide-shots')
os.makedirs(OUT_DIR, exist_ok=True)
OUT = OUT_DIR + os.sep
STATE = os.path.join(OUT_DIR, 'admin-session.json')
APP = 'http://127.0.0.1:8791/index.html'
ADMIN = 'http://127.0.0.1:8792/index.html'
W, H = 390, 844

ENV = {}
for l in io.open(os.path.expanduser('~/.church-admin/dev.env'), encoding='utf-8'):
    if '=' in l and not l.lstrip().startswith('#'):
        k, v = l.strip().split('=', 1)
        ENV[k] = v.strip().strip('"').strip("'")
URL, ANON, SVC = ENV['DEV_URL'], ENV['DEV_ANON'], ENV['DEV_SERVICE_KEY']
assert 'ktpwthwqzgcqcrmsafdo' in URL, '개발 프로젝트에만 돌린다: ' + URL
API = URL + '/functions/v1/api'

PID = 990000901                      # 개발 시험 번호대(시험 파일들은 990000001~074 를 쓴다)
TAG = 'guide-demo-20261002'          # 넣은 사역 이력 줄의 source_file — 지울 때 이것으로 고른다
NAME = '김시험'
IDENT = '교구|사랑|3|||' + NAME
HIST = [(2026, '찬양위원회', '시온성가대', ''), (2025, '찬양위원회', '시온성가대', ''), (2024, '봉사위원회', '주차안내팀', '부팀장')]


# ── 개발 DB ──────────────────────────────────────────────
def req(method, path, body=None, key=SVC, extra=None):
    h = {'apikey': key, 'Content-Type': 'application/json; charset=utf-8'}
    if not key.startswith('sb_'):
        h['Authorization'] = 'Bearer ' + key
    h.update(extra or {})
    data = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
    try:
        with urllib.request.urlopen(urllib.request.Request(URL + path, data=data, method=method, headers=h)) as f:
            t = f.read().decode('utf-8')
            return f.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')


def save_session(email, pw, auth_id):
    s, sess = req('POST', '/auth/v1/token?grant_type=password', {'email': email, 'password': pw}, key=ANON)
    sess.setdefault('expires_at', int(time.time()) + int(sess.get('expires_in', 3600)))
    io.open(STATE, 'w', encoding='utf-8').write(json.dumps({'session': sess, 'auth_id': auth_id, 'email': email, 'pw': pw}))
    print('session', s)


def prep():
    print('church_people', req('POST', '/rest/v1/church_people', {
        'person_id': PID, 'name': NAME, 'name_key': NAME, 'position': '집사', 'kind2': '장년',
        'mok1': '사랑', 'mok3': '사랑-3', 'mok_path': '사랑-3'}, extra={'Prefer': 'return=minimal'}))
    rows = [{'year': y, 'committee': c, 'team': t, 'role_title': rt, 'name': NAME, 'position': '집사', 'mok': '사랑-3',
             'renewal': '유지', 'person_id': PID, 'link_how': 'manual', 'match_basis': '시험', 'source': 'admin',
             'source_file': TAG, 'src_key': '%s|%d|%s|%s' % (TAG, y, c, t)} for y, c, t, rt in HIST]
    print('ministry_history', req('POST', '/rest/v1/ministry_history', rows, extra={'Prefer': 'return=minimal'}))
    email, pw = 'ca-seed-guide-%d@example.test' % int(time.time()), 'G%d!x' % int(time.time() * 1000)
    s, u = req('POST', '/auth/v1/admin/users', {'email': email, 'password': pw, 'email_confirm': True})
    print('auth user', s)
    save_session(email, pw, u['id'])


def refresh():
    st = json.load(io.open(STATE, encoding='utf-8'))
    save_session(st['email'], st['pw'], st['auth_id'])


def activate():
    st = json.load(io.open(STATE, encoding='utf-8'))
    s, m = req('GET', '/rest/v1/admin_members?select=id&auth_user_id=eq.' + st['auth_id'])
    mid = m[0]['id']
    print('activate', req('PATCH', '/rest/v1/admin_members?id=eq.' + mid,
                          {'status': 'active', 'approved_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())},
                          extra={'Prefer': 'return=minimal'}))
    print('role', req('POST', '/rest/v1/admin_role_grants', {'member_id': mid, 'role_id': 'ministry'},
                      extra={'Prefer': 'return=minimal'}))


def down():
    s, users = req('GET', '/rest/v1/users?select=id&identity_key=eq.' + urllib.parse.quote(IDENT))
    for x in users if isinstance(users, list) else []:      # 이 소속의 김시험 한 계정만(다른 시험 계정은 건드리지 않는다)
        print('requests', req('DELETE', '/rest/v1/ministry_history_requests?user_id=eq.' + x['id']))
        print('orders', req('DELETE', '/rest/v1/ministry_orders?user_id=eq.' + x['id']))
        print('user', req('DELETE', '/rest/v1/users?id=eq.' + x['id']))
    s, cfg = req('GET', '/rest/v1/app_config?select=value&key=eq.ministryTesters')
    if isinstance(cfg, list) and cfg:                        # 시험 참여자 명단에서 이분만 뺀다
        keep = [k for k in (cfg[0]['value'] or []) if k != IDENT]
        print('testers', req('PATCH', '/rest/v1/app_config?key=eq.ministryTesters', {'value': keep},
                             extra={'Prefer': 'return=minimal'}))
    print('history', req('DELETE', '/rest/v1/ministry_history?person_id=eq.%d' % PID))   # 반영으로 생긴 req: 줄까지
    print('history(tag)', req('DELETE', '/rest/v1/ministry_history?source_file=eq.' + TAG))
    print('church_people', req('DELETE', '/rest/v1/church_people?person_id=eq.%d' % PID))
    if os.path.exists(STATE):
        st = json.load(io.open(STATE, encoding='utf-8'))
        print('auth user', req('DELETE', '/auth/v1/admin/users/' + st['auth_id']))   # admin_members·역할은 cascade
        os.remove(STATE)


# ── 화면 ────────────────────────────────────────────────
def call(b):
    r = urllib.request.Request(API, data=json.dumps(b, ensure_ascii=False).encode('utf-8'),
                               headers={'Content-Type': 'application/json; charset=utf-8',
                                        'Authorization': 'Bearer ' + ANON, 'apikey': ANON})
    return json.loads(urllib.request.urlopen(r).read())


def app_user():
    lr = call({'action': 'login', 'type': '교구', 'gu': '사랑', 'mok': '3', 'name': NAME})
    return dict(lr['user'], user_id=lr['user_id'])


def shot(pg, name, clip=None, full=False):
    pg.screenshot(path=OUT + name + '.png', clip=clip, full_page=full)
    print('  ->', name)


def app_page(p):
    b = p.chromium.launch(channel='chrome', headless=True)
    ctx = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2, locale='ko-KR')
    ctx.add_init_script("localStorage.setItem('memorize-user', %s); localStorage.setItem('memorize-intro-seen', '1');"
                        % json.dumps(json.dumps(app_user(), ensure_ascii=False)))
    pg = ctx.new_page()
    pg.goto(APP)
    pg.wait_for_function("typeof renderSummary === 'function'")
    pg.wait_for_timeout(3500)
    # 「개발 DB」 띠 · 첫 화면에 저절로 뜨는 창(오늘의 묵상 등)은 그림에서 뺀다
    pg.add_style_tag(content='#dev-env-mark,.cheer-overlay{display:none!important}')
    pg.evaluate("renderSummary()"); pg.wait_for_timeout(1500)
    for txt in ['나중에 볼게요', '닫기']:
        loc = pg.get_by_text(txt, exact=True)
        if loc.count() and loc.first.is_visible():
            loc.first.click(); pg.wait_for_timeout(500)
    return b, pg


def close_min_alert(pg):
    loc = pg.locator('.min-alert-wrap button')
    if loc.count() and loc.first.is_visible():
        loc.first.click(); pg.wait_for_timeout(400)


def clip_to(pg, sel, pad=18):
    bb = pg.locator(sel).bounding_box()
    return {'x': 0, 'y': 0, 'width': W, 'height': bb['y'] + bb['height'] + pad}


def app1(p):
    b, pg = app_page(p)
    t = pg.locator('.grp-title', has_text='사역현황').first
    t.scroll_into_view_if_needed(); pg.evaluate("window.scrollBy(0, -120)"); pg.wait_for_timeout(300)
    bt, bh = t.bounding_box(), pg.locator('#open-ministry-history').bounding_box()
    shot(pg, 'a1_home', clip={'x': 0, 'y': bt['y'] - 22, 'width': W, 'height': bh['y'] + bh['height'] - bt['y'] + 44})
    pg.click('#open-ministry'); pg.wait_for_selector('.min-acc-h', timeout=20000); pg.wait_for_timeout(800)
    shot(pg, 'a2_pick')
    pg.click('#min-policy-open'); pg.wait_for_timeout(600)
    shot(pg, 'a3_policy')
    pg.locator('[data-dclose]').first.click(); pg.wait_for_timeout(400)
    # 찬양부 할렐루야찬양대 + 방송전산부 방송실 운영 — 찬양대 둘은 겸할 수 없다(신청안내 4번)
    pg.locator('.min-acc-h', has_text='찬양부').first.click(); pg.wait_for_timeout(600)
    pg.locator('.min-acc.open .min-team[data-team]', has_text='할렐루야찬양대').first.click(); pg.wait_for_timeout(400)
    h = pg.locator('.min-acc-h', has_text='찬양부').first
    h.scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    pg.evaluate("window.scrollBy(0, %d)" % (h.bounding_box()['y'] - 70)); pg.wait_for_timeout(400)
    shot(pg, 'a4_picked')
    pg.locator('.min-acc.open .min-more').first.click(); pg.wait_for_timeout(700)
    shot(pg, 'a5_detail')
    pg.locator('.min-d-wrap', has_text='닫기').get_by_text('닫기', exact=True).last.click(); pg.wait_for_timeout(400)
    pg.locator('.min-acc-h', has_text='방송전산부').first.click(); pg.wait_for_timeout(600)
    pg.locator('.min-acc.open .min-team[data-team]', has_text='방송실 운영').first.click(); pg.wait_for_timeout(400)
    pg.click('#min-next'); pg.wait_for_selector('#min-submit', timeout=10000); pg.wait_for_timeout(500)
    pg.select_option('#min-pos', '집사')
    pg.fill('#min-phone', '01012345678'); pg.wait_for_timeout(300)
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(300)
    shot(pg, 'a6_confirm', clip=clip_to(pg, '#min-back'))
    pg.click('#min-submit'); pg.wait_for_selector('.min-screen .pl-steps', timeout=20000); pg.wait_for_timeout(1200)
    close_min_alert(pg)
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(300)
    last = pg.locator('.min-screen > *:not(.min-acts)').last.bounding_box()   # 아래 고정 단추가 내용 바로 밑에 오게
    pg.set_viewport_size({'width': W, 'height': int(last['y'] + last['height'] + 110)}); pg.wait_for_timeout(500)
    shot(pg, 'a7_done')
    pg.set_viewport_size({'width': W, 'height': H})
    pg.evaluate("renderSummary()"); pg.wait_for_timeout(1200)
    pg.click('#open-ministry-history'); pg.wait_for_selector('.mh-screen', timeout=30000); pg.wait_for_timeout(800)
    shot(pg, 'a8_history', clip=clip_to(pg, '#mh-exit'))
    pg.locator('.mh-year', has_text='2024').locator('.mh-fix').first.click(); pg.wait_for_timeout(600)
    pg.locator('.mh-kind', has_text='그 밖에').click(); pg.wait_for_timeout(200)
    pg.fill('#mh-detail', '2024년에는 부팀장이 아니라 팀원으로 섬겼어요'); pg.wait_for_timeout(300)
    shot(pg, 'a9_fix')
    pg.locator('.min-d-wrap [data-ok]').click(); pg.wait_for_timeout(2500)
    close_min_alert(pg)
    pg.click('#mh-missing'); pg.wait_for_timeout(600)
    pg.fill('#mh-year', '2023'); pg.fill('#mh-committee', '교육위원회'); pg.fill('#mh-team', '유년부')
    pg.fill('#mh-detail', '2023년 유년부 교사로 섬겼어요'); pg.wait_for_timeout(300)
    shot(pg, 'a11_missing')
    pg.locator('.min-d-wrap [data-ok]').click(); pg.wait_for_timeout(2500)
    close_min_alert(pg)
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(300)
    shot(pg, 'a12_requests', clip=clip_to(pg, '#mh-exit'))
    b.close()


def app2(p):
    b, pg = app_page(p)
    pg.click('#open-ministry-history'); pg.wait_for_selector('.mh-screen', timeout=30000); pg.wait_for_timeout(800)
    shot(pg, 'a13_answered', clip=clip_to(pg, '#mh-exit'))
    b.close()


def admin_page(p, with_session=True):
    b = p.chromium.launch(channel='chrome', headless=True)
    ctx = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2, locale='ko-KR')
    if with_session:
        st = json.load(io.open(STATE, encoding='utf-8'))
        ctx.add_init_script("localStorage.setItem('church-admin-auth', %s);" % json.dumps(json.dumps(st['session'])))
    pg = ctx.new_page()
    return b, pg


def admin_open(pg, wait):
    pg.goto(ADMIN); pg.wait_for_selector(wait, timeout=30000)
    pg.add_style_tag(content='#dev-env-mark{display:none!important}'); pg.wait_for_timeout(800)


def go(pg, hash_, wait):
    pg.evaluate("location.hash = %s" % json.dumps(hash_)); pg.wait_for_selector(wait, timeout=30000); pg.wait_for_timeout(1500)
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(300)


def admin1(p):
    b, pg = admin_page(p, with_session=False)
    admin_open(pg, '.gate .kakao')
    shot(pg, 'b1_login', clip=clip_to(pg, '.gate .card', 24))
    b.close()
    b, pg = admin_page(p)
    admin_open(pg, '.gate form')
    pg.click('[data-pick="gu"]'); pg.wait_for_timeout(500)
    pg.locator('.pk-opt', has_text='사랑').first.click(); pg.wait_for_timeout(400)
    pg.fill('input[name="mok"]', '1'); pg.fill('input[name="name"]', '시험담당'); pg.wait_for_timeout(300)
    shot(pg, 'b2_register', clip=clip_to(pg, '.gate .card', 24))
    pg.click('form button[type="submit"]'); pg.wait_for_timeout(2500)
    shot(pg, 'b3_pending', clip=clip_to(pg, '.gate .card', 24))
    b.close()


def admin2(p):
    b, pg = admin_page(p)
    admin_open(pg, '.home-card')
    pg.click('header .menu'); pg.wait_for_timeout(600)
    shot(pg, 'b4b_nav')
    pg.evaluate("document.body.classList.remove('nav-open'); document.querySelector('.nav-dim').hidden = true")
    go(pg, '#/testers', '.mt-find')
    pg.fill('.mt-find input', NAME); pg.click('.mt-find button[type="submit"]'); pg.wait_for_timeout(2500)
    btn = pg.locator('.mt-res .card', has_text='사랑').locator('[data-act="add"]')
    if btn.count():
        btn.first.click(); pg.wait_for_timeout(2500)
    shot(pg, 'b5_testers', full=True)
    go(pg, '#/status', '.mn-q')
    pg.fill('.mn-q', NAME); pg.wait_for_timeout(1200)
    shot(pg, 'b6_status', full=True)
    pg.locator('[data-act="drop"]').first.click(); pg.wait_for_timeout(600)
    shot(pg, 'b6_status_drop', full=True)
    b.close()


def admin3(p):
    b, pg = admin_page(p)
    admin_open(pg, '.home-card')
    go(pg, '#/mn-requests', '.hr-row')
    pg.locator('.hr-row', has_text='빠진 사역').first.click(); pg.wait_for_selector('.be-box', timeout=10000); pg.wait_for_timeout(600)
    pg.locator('.hr-st-btn[data-st="반영"]').click(); pg.wait_for_timeout(500)
    pg.fill('#hr-ans', '유년부 담당 교역자님께 확인하고 2023년 기록에 넣었어요')
    pg.locator('.be-ok').click(); pg.wait_for_timeout(3000)
    pg.locator('.hr-row', has_text='그 밖에').first.click(); pg.wait_for_selector('.be-box', timeout=10000); pg.wait_for_timeout(600)
    pg.locator('.hr-st-btn[data-st="확인 중"]').click(); pg.wait_for_timeout(300)
    pg.fill('#hr-ans', '봉사위원회에 확인하고 있어요')
    pg.locator('.be-ok').click(); pg.wait_for_timeout(3000)
    go(pg, '#/mn-history', '.mh-list')
    pg.fill('input.search', NAME); pg.wait_for_timeout(2000)
    shot(pg, 'b9_history', full=True)
    go(pg, '#/appointed', '.page-title'); pg.wait_for_timeout(1500)
    shot(pg, 'b11_appointed')        # 아래 명단은 자른다(개발 DB 시험 이름) — 생성기가 위 610px 만 쓴다
    b.close()


def admin4(p):
    b, pg = admin_page(p)
    admin_open(pg, '.home-card')
    go(pg, '#/mn-requests', '.hr-filter')
    pg.click('.hr-filter'); pg.wait_for_timeout(500)
    pg.locator('.pk-opt', has_text='전부').first.click(); pg.wait_for_timeout(2000)
    shot(pg, 'b7_requests_all', full=True)
    pg.locator('.hr-row', has_text='빠진 사역').first.click(); pg.wait_for_selector('.be-box', timeout=10000); pg.wait_for_timeout(800)
    pg.evaluate("document.querySelector('.hr-line-box') && document.querySelector('.hr-line-box').scrollIntoView({block:'start'})")
    pg.wait_for_timeout(300)
    shot(pg, 'b8_missing_line')
    pg.locator('.be-cancel').click(); pg.wait_for_timeout(800)
    pg.locator('.hr-row', has_text='그 밖에').first.click(); pg.wait_for_selector('.be-box', timeout=10000); pg.wait_for_timeout(800)
    pg.evaluate("document.querySelector('.be-body').scrollTop = 0"); pg.wait_for_timeout(300)
    shot(pg, 'b8_other')
    pg.locator('.be-cancel').click(); pg.wait_for_timeout(800)
    go(pg, '#/catalog', '.page-title'); pg.wait_for_timeout(1500)
    pg.locator('input[type="search"]').first.fill('찬양대'); pg.wait_for_timeout(1500)   # ⚠️ 실명 줄(장학)이 안 보이게
    shot(pg, 'b10_catalog')
    b.close()


if __name__ == '__main__':
    step = sys.argv[1]
    if step in ('prep', 'refresh', 'activate', 'down'):
        globals()[step]()
    else:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            globals()[step](p)
    print('찍은 폴더:', OUT_DIR)
