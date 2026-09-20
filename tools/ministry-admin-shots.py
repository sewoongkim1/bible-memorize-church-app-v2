# 사역 어드민에 들어가는 길 — 화면 넉 장(개발 DB · 시험 계정이라 실명이 안 찍힌다)
import io, json, urllib.request
from playwright.sync_api import sync_playwright

OUT = r'C:/Users/sewki/AppData/Local/Temp/claude/c--Projects-bible-memorize-church-app-v2/00d2bd19-8943-4271-9ad2-8e9f9b3a2a43/scratchpad/word/'
URL = 'https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api'
A = 'sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y'
ENV = r'C:\Projects\bible-memorize-church-app-v2\.env.dev'
MIN = [l.split('=', 1)[1].strip() for l in io.open(ENV, encoding='utf-8') if l.startswith('PROD_MINISTRY_SECRET=')][0]

def call(b):
    r = urllib.request.Request(URL, data=json.dumps(b, ensure_ascii=False).encode('utf-8'),
                               headers={'Content-Type': 'application/json; charset=utf-8',
                                        'Authorization': 'Bearer ' + A, 'apikey': A})
    return json.loads(urllib.request.urlopen(r).read())

lr = call({'action': 'login', 'type': '교구', 'gu': '사랑', 'mok': '1', 'name': '사역담당시험'})
user = dict(lr['user'], user_id=lr['user_id'])
staff = {'type': '교구', 'gu': '사랑', 'mok': '1', 'bu': '', 'grade': '', 'name': '사역담당시험'}

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 840}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('memorize-user', %s);" % json.dumps(json.dumps(user, ensure_ascii=False)))
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))

    # ① 설정 — 「관리 페이지」 단추
    pg.goto('http://localhost:8790/index.html')
    pg.wait_for_function("!!(typeof renderSettings === 'function')")
    pg.wait_for_timeout(2500)              # 인트로가 끝난 뒤에 그린다
    pg.evaluate("renderSettings()"); pg.wait_for_timeout(1200)
    el = pg.query_selector('#open-manage')
    el.scroll_into_view_if_needed(); pg.wait_for_timeout(300)
    box = el.bounding_box()
    pg.screenshot(path=OUT + 'a1_settings.png',
                  clip={'x': 8, 'y': max(0, box['y'] - 120), 'width': 374, 'height': 260})
    print('① 설정', box['height'])

    # ② 관리 메뉴 — 두 단추
    pg.evaluate("renderManageMenu(()=>{})"); pg.wait_for_timeout(800)
    card = pg.query_selector('.summary-card')
    card.screenshot(path=OUT + 'a2_manage.png')
    print('② 관리 메뉴', [x.inner_text() for x in pg.query_selector_all('.summary-card a.summary-install')])

    # ③ 사역관리 로그인 — 앱 로그인 정보 + 암호만
    pg.goto('http://localhost:8790/admin-stats.html?only=ministry')
    pg.wait_for_selector('.login-card', timeout=15000); pg.wait_for_timeout(800)
    pg.query_selector('.login-card').screenshot(path=OUT + 'a3_login.png')
    print('③ 로그인', pg.inner_text('.login-card').split(chr(10))[:3])

    # ④ 사역 메뉴 — 카드 넷(암호를 넣고 들어간 뒤)
    pg.fill('#pw', MIN)
    pg.click('#login')
    pg.wait_for_selector('#rep-ministry', timeout=20000); pg.wait_for_timeout(1500)
    pg.evaluate("window.scrollTo(0,0)")
    pg.screenshot(path=OUT + 'a4_menu.png', clip={'x': 0, 'y': 60, 'width': 390, 'height': 700})
    print('④ 사역 메뉴', [x.inner_text() for x in pg.query_selector_all('.rep-card .ti')])
    print('errors', errs)
    b.close()
