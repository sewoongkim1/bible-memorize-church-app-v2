#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""보안 점검 — 기계가 볼 수 있는 것만 본다(성경암송 + 교회 어드민).

    python tools/security-check.py              # 운영을 공개 키로 읽기만 + 두 저장소의 origin/main
    python tools/security-check.py --env dev    # 개발 DB 를 본다
    python tools/security-check.py --history    # git 이력까지(느리다 · 달에 한 번)
    python tools/security-check.py --accept     # 지금 나온 것을 「본 것」으로 적어 둔다(다음부터는 새것만 알린다)

⚠️ 읽기만 한다. 쓰는 요청·관리자 암호·service_role 키를 쓰지 않는다 — 공개 키로 누구나 할 수 있는 것만 한다.
⚠️ 받은 행의 **내용은 찍지 않는다**(칸 이름과 개수만). 결과에 성도님 정보가 남으면 안 된다.
⚠️ 결과와 「본 것」 목록(baseline)은 **저장소 밖**에 쓴다. 이 저장소는 공개이고 사이트가 저장소 전체를
   배포한다 — 「여기가 열려 있다」를 적은 파일이 그대로 주소로 열린다.
   기본 자리 C:\\Projects\\보안점검 (환경변수 SECURITY_CHECK_DIR 로 바꾼다).
⚠️ 작업 폴더가 아니라 `origin/main` 을 읽는다. 공유 체크아웃은 수백 커밋 뒤처져 있기 일쑤라
   작업 폴더를 읽으면 옛 코드를 점검하게 된다(2026-10-08 에 164개 액션을 134개로 셌다).

여기서 **못 보는 것**(사람이나 Claude 가 코드를 읽어야 한다)은 docs/notes/security-check.md 의 「손으로 보는 것」.
끝 코드: 새로 나온 「위험」·「검토」가 있으면 1, 없으면 0.
"""
import argparse
import base64
import datetime
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADMIN = os.environ.get("CHURCH_ADMIN_DIR", r"C:\Projects\church-admin")
OUT = os.environ.get("SECURITY_CHECK_DIR", r"C:\Projects\보안점검")

# 공개 키 — js/config.js 에 있는 그 값이다(누구나 가진 것).
ENVS = {
    "prod": ("https://xnomlgydifiqiybervtf.supabase.co", "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-"),
    "dev": ("https://ktpwthwqzgcqcrmsafdo.supabase.co", "sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"),
}
SITES = ["https://gocheok.onlybible.kr", "https://admin.onlybible.kr"]

# 응답·표에 이 칸이 보이면 「위험」 — user_id 하나면 그 사람 행세가 된다(CLAUDE.md 「보안」 절).
SENSITIVE = {"user_id", "identity_key", "phone", "tel", "mobile", "endpoint", "p256dh", "token",
             "pw", "password", "secret", "email", "person_id", "kakao_id", "birth", "address"}

# 로그인·암호 없이 부르는 읽기 액션 — 응답에 위 칸이 실려 나오는지 본다. ⚠️ 쓰는 액션을 넣지 말 것.
PUBLIC_READS = ["ranking", "guRanking", "getVerses", "getConfig", "verseCounts", "boardList", "eventBoard",
                "eventOpenList", "eventRosterPublic", "getBlessings", "getPassages", "ministryCatalog",
                "eduList", "dutyList", "getWeeklyVerse", "getTodayMeditation", "getTodayBlessing", "getTodayPsalm"]

# 사이트에서 열리면 안 되는 주소(200 이면 위험)
MUST_404 = ["/.env", "/.env.dev", "/.env.local", "/.git/config", "/.git/HEAD", "/migrate/v1dump.json",
            "/board.json", "/supabase/.temp/project-ref", "/signing-key-info.txt", "/android-app/signing-key-info.txt"]

SECRET_PATTERNS = [
    ("Supabase secret 키", r"sb_secret_[A-Za-z0-9_-]{20,}"),
    ("JWT", r"eyJhbGciOi[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}"),
    ("개인 키(PEM)", r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    ("GitHub 토큰", r"ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}"),
    ("Anthropic 키", r"sk-ant-[A-Za-z0-9_-]{20,}"),
    ("Google 키", r"AIza[0-9A-Za-z_-]{35}"),
    ("텔레그램 봇 토큰", r"[0-9]{8,10}:AA[A-Za-z0-9_-]{33}"),
    ("Resend 키", r"re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}"),
    ("AWS 키", r"AKIA[0-9A-Z]{16}"),
]
RISKY_NAME = re.compile(r"(^|/)\.env($|\.)|\.(keystore|jks|p8|p12|pfx|pem)$|signing-key|service[-_]?account.*\.json$", re.I)
DOC_EXT = re.compile(r"\.(xlsx|xls|csv|docx|hwp|hwpx)$", re.I)
PHONE = r"01[016-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}"
PHONE_LIMIT = 5      # 한 파일에 서로 다른 휴대폰 번호가 이만큼이면 명단일 수 있다
GUARDS = re.compile(r"\b(adminError|staffRoleError|ministryAdminError|contentError|churchAdminInternal|sameSecret)\(")


def git(repo, *a, ok=(0,)):
    r = subprocess.run(["git", "-C", repo, "-c", "core.quotepath=off", *a], capture_output=True)
    if r.returncode not in ok:
        raise RuntimeError("git %s: %s" % (" ".join(a[:3]), r.stderr.decode("utf-8", "replace")[:300]))
    return r.stdout.decode("utf-8", "replace")


class Repo:
    def __init__(self, name, path, ref):
        self.name, self.path, self.ref = name, path, ref
        self._files = None

    def files(self):
        if self._files is None:
            self._files = [f for f in git(self.path, "ls-tree", "-r", "--name-only", self.ref).splitlines() if f]
        return self._files

    def show(self, path):
        return git(self.path, "show", "%s:%s" % (self.ref, path))

    def grep(self, pattern, *paths, only=False):
        """(파일, 줄 번호, 글) 목록. only=True 면 맞은 부분만."""
        args = ["grep", "-I", "-n", "-E"] + (["-o"] if only else []) + ["-e", pattern, self.ref, "--"]
        args += list(paths) or ["."]
        out = []
        pre = self.ref + ":"
        for line in git(self.path, *args, ok=(0, 1)).splitlines():
            if not line.startswith(pre):
                continue
            p = line[len(pre):].split(":", 2)
            if len(p) == 3 and not p[0].startswith(("node_modules/", "vendor/")):
                out.append((p[0], p[1], p[2]))
        return out


def http(method, url, headers=None, body=None, timeout=25):
    h = {"User-Agent": "security-check/1 (+gocheok.onlybible.kr)"}
    h.update(headers or {})
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        h["Content-Type"] = "application/json"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method=method, headers=h, data=data), timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:      # 연결 실패 — 0 으로 돌려 「못 봤다」로 적는다
        return 0, str(e).encode("utf-8")


class Report:
    def __init__(self):
        self.items = []      # (절, 열쇠, 등급, 글)
        self.notes = {}      # 절 → 한 줄 요약

    def add(self, sec, key, level, text):
        self.items.append((sec, "%s|%s" % (sec, key), level, text))


# ── A. DB 를 공개 키로 직접 읽을 수 있나 ──────────────────────────────────────
def sql_texts(repos):
    out = []
    for r in repos:
        for f in r.files():
            if f.endswith(".sql") and f.startswith("supabase/"):
                out.append((r.name + ":" + f, r.show(f)))
    return out


def relation_names(repos, sqls):
    names = set()
    for _, t in sqls:
        for m in re.finditer(r"create\s+(?:or\s+replace\s+)?(?:materialized\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?(?:public\.)?\"?([a-z_][a-z0-9_]*)", t, re.I):
            names.add(m.group(1).lower())
    for r in repos:
        for _, _, s in r.grep(r"\.from\(\s*[\"'][a-z_][a-z0-9_]*[\"']", "supabase/functions", only=True):
            m = re.search(r"[\"']([a-z_][a-z0-9_]*)", s)
            if m:
                names.add(m.group(1))
    return sorted(names - {"if", "as", "select"})


def check_db(rep, repos, sqls, env):
    url, anon = ENVS[env]
    h = {"apikey": anon, "Authorization": "Bearer " + anon}
    names = relation_names(repos, sqls)
    opened = empty = closed = failed = 0
    for n in names:
        st, body = http("GET", "%s/rest/v1/%s?select=*&limit=1" % (url, n), h)
        if st == 200:
            try:
                rows = json.loads(body)
            except Exception:
                rows = []
            if rows:
                opened += 1
                cols = sorted(rows[0].keys())
                hot = sorted(set(cols) & SENSITIVE)
                rep.add("A", "open|%s|%s" % (env, n), "위험" if hot else "검토",
                        "`%s` — 공개 키로 행이 온다 · 칸 %d개%s" % (n, len(cols), " · **민감한 칸: %s**" % ", ".join(hot) if hot else " (%s)" % ", ".join(cols[:8])))
            else:
                empty += 1
        elif st == 0:
            failed += 1
        else:
            closed += 1
    # storage — 칸 안 목록이 공개 키로 보이나(사진 주소를 통째로 긁어 갈 수 있다)
    buckets = set()
    for r in repos:
        for _, _, s in r.grep(r"storage\s*\.from\(\s*[\"'][A-Za-z0-9_-]+|object/public/[A-Za-z0-9_-]+", only=True):
            buckets.add(re.split(r"[\"'/]", s)[-1])
    for b in sorted(buckets):
        st, body = http("POST", "%s/storage/v1/object/list/%s" % (url, b), h, {"prefix": "", "limit": 1})
        try:
            got = json.loads(body) if st == 200 else []
        except Exception:
            got = []
        if got:
            rep.add("A", "bucket|%s|%s" % (env, b), "위험", "storage 칸 `%s` — 공개 키로 파일 목록이 보인다" % b)
    rep.notes["A"] = "%s · 이름 %d개 — 행이 옴 %d · 빈 응답 %d · 막힘/없음 %d%s · storage 칸 %d개" % (
        env, len(names), opened, empty, closed, " · 못 봄 %d" % failed if failed else "", len(buckets))


# ── B. 누가 무엇을 부를 수 있나(액션 목록) ────────────────────────────────────
def api_surface(src):
    """성경암송 api — 액션 → (분류, 근거). 분류: 관리자·담당자 / 내부 / user_id / 공개"""
    funcs = {}
    for m in re.finditer(r"^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(", src, re.M):
        end = src.find("\n}\n", m.start())
        funcs[m.group(1)] = src[m.start(): end if end > 0 else len(src)]
    sw = src.find("switch (body.action)")
    cases = list(re.finditer(r"^\s*case\s+\"(\w+)\"\s*:", src[sw:], re.M))
    out = {}
    for i, c in enumerate(cases):
        block = src[sw + c.start(): sw + (cases[i + 1].start() if i + 1 < len(cases) else c.start() + 600)]
        text = block
        for fn in re.findall(r"\b(\w+)\(", block):
            if fn in funcs:
                text += funcs[fn]
        g = sorted(set(GUARDS.findall(text)))
        if any(x in g for x in ("churchAdminInternal", "sameSecret")):
            cat = "내부"
        elif g:
            cat = "관리자·담당자"
        elif re.search(r"\buser_id\b|identity_key", text):
            cat = "user_id"
        else:
            cat = "공개"
        out[c.group(1)] = (cat, ",".join(g))
    return out


def admin_surface(src):
    """교회 어드민 — authz.ts 의 ACTION_ROLES(없으면 unknown-action 으로 막힌다)"""
    m = re.search(r"ACTION_ROLES[^=]*=\s*\{(.*?)\n\};", src, re.S)
    out = {}
    for a, role in re.findall(r"^\s+(\w+):\s*(null|\"[^\"]+\"|\[[^\]]*\]|[A-Z_]+)\s*,", m.group(1) if m else "", re.M):
        out[a] = role.replace('"', "")
    return out


def check_surface(rep, v2, adm, env, probe):
    api = api_surface(v2.show("supabase/functions/api/index.ts"))
    count = {}
    for a, (cat, why) in sorted(api.items()):
        count[cat] = count.get(cat, 0) + 1
        # 암호 확인이 없는 액션은 하나하나 사람이 본 뒤 「본 것」으로 넘긴다 — 분류가 바뀌면 다시 뜬다
        rep.add("B", "api|%s|%s" % (a, cat), "정보" if cat in ("관리자·담당자", "내부") else "검토",
                "api `%s` — %s%s" % (a, cat, " (%s)" % why if why else ""))
    roles = admin_surface(adm.show("supabase/functions/church-admin/authz.ts"))
    for a, role in sorted(roles.items()):
        rep.add("B", "admin|%s|%s" % (a, role), "검토" if role == "null" else "정보",
                "church-admin `%s` — %s" % (a, "로그인만(역할 없음)" if role == "null" else "역할 " + role))
    rep.notes["B"] = "api 액션 %d개(%s) · church-admin 액션 %d개(역할 없는 것 %d)" % (
        len(api), " · ".join("%s %d" % kv for kv in sorted(count.items())), len(roles),
        sum(1 for r in roles.values() if r == "null"))

    url, anon = ENVS[env]
    h = {"apikey": anon, "Authorization": "Bearer " + anon}
    seen = 0
    for a in PUBLIC_READS:
        if a not in api:
            continue
        st, body = http("POST", url + "/functions/v1/api", h, {"action": a})
        try:
            data = json.loads(body)
        except Exception:
            continue
        seen += 1
        hot = set()

        def walk(x, depth=0):
            if depth > 8:
                return
            if isinstance(x, dict):
                for k, v in x.items():
                    # 참·거짓은 「이 칸을 받는다」는 깃발이지 값이 아니다(eventOpenList 의 needs.phone)
                    if k.lower() in SENSITIVE and not isinstance(v, bool) and v not in (None, "", [], {}):
                        hot.add(k)
                    walk(v, depth + 1)
            elif isinstance(x, list):
                for v in x[:200]:
                    walk(v, depth + 1)
        walk(data)
        if hot:
            rep.add("B", "leak|%s|%s|%s" % (env, a, ",".join(sorted(hot))), "위험",
                    "api `%s` 응답에 **%s** 가 실려 나온다(암호·로그인 없이 부른 것)" % (a, ", ".join(sorted(hot))))
    rep.notes["B"] += " · 공개 읽기 %d개의 응답을 훑음" % seen

    if probe:
        # 틀린 암호로 관리자·담당자 액션을 부른다 — 개발에서만(확인이 몸통 뒤쪽에 있으면 그 앞의 일이 일어난다)
        if env != "dev":
            rep.notes["B"] += " · ⚠️ --probe-guards 는 --env dev 에서만 돈다"
        else:
            bad = 0
            for a, (cat, _) in sorted(api.items()):
                if cat != "관리자·담당자":
                    continue
                st, body = http("POST", url + "/functions/v1/api", h, {"action": a, "pw": "x-wrong-password-x"})
                try:
                    d = json.loads(body)
                except Exception:
                    d = {}
                if st == 200 and d.get("ok") is not False and "error" not in d:
                    bad += 1
                    rep.add("B", "guard|%s" % a, "위험", "api `%s` — 틀린 암호인데 거절하지 않았다(HTTP %d)" % (a, st))
            rep.notes["B"] += " · 틀린 암호 시험: 통과해 버린 것 %d" % bad


# ── C. 공개 저장소에 들어간 것 ────────────────────────────────────────────────
def mask(s):
    return s[:8] + "…(%d자)" % len(s)


def jwt_role(tok):
    try:
        p = tok.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4))).get("role", "")
    except Exception:
        return ""


def check_repo(rep, repos, history):
    n = 0
    for r in repos:
        for kind, pat in SECRET_PATTERNS:
            for f, ln, s in r.grep(pat, only=True):
                if kind == "JWT":
                    role = jwt_role(s)
                    if role != "service_role":
                        continue      # anon JWT 는 공개 키다
                    kind2 = "service_role JWT"
                else:
                    kind2 = kind
                if kind.startswith("개인 키"):
                    # 머리글 다음 줄에 base64 몸통이 이어져야 진짜 키다 — 머리글을 떼어 내는 코드·설명 글은 넘긴다
                    after = "\n".join(r.show(f).splitlines()[int(ln): int(ln) + 2])
                    if not re.search(r"[A-Za-z0-9+/=]{48,}", after):
                        continue
                n += 1
                rep.add("C", "secret|%s|%s|%s" % (r.name, f, kind2), "위험", "%s `%s:%s` — %s `%s`" % (r.name, f, ln, kind2, mask(s)))
        for f in r.files():
            if RISKY_NAME.search(f) and not f.endswith(".env.example"):
                rep.add("C", "name|%s|%s" % (r.name, f), "검토", "%s `%s` — 키·비밀 파일로 보이는 이름" % (r.name, f))
            elif DOC_EXT.search(f):
                rep.add("C", "doc|%s|%s" % (r.name, f), "검토", "%s `%s` — 표·문서 파일(명단·내부 문서일 수 있다 · 사이트에서 그대로 열린다)" % (r.name, f))
        phones = {}
        for f, _, s in r.grep(PHONE, only=True):
            phones.setdefault(f, set()).add(re.sub(r"\D", "", s))
        for f, nums in sorted(phones.items()):
            if len(nums) >= PHONE_LIMIT:
                rep.add("C", "phone|%s|%s" % (r.name, f), "검토", "%s `%s` — 서로 다른 휴대폰 번호 %d개" % (r.name, f, len(nums)))
        if history:
            pat = "|".join(p for k, p in SECRET_PATTERNS)      # 「service_role」 낱말은 넣지 않는다 — grant 문마다 걸린다
            hits = [l for l in git(r.path, "log", "--all", "--format=%h %ad %s", "--date=short", "-E", "-G", pat).splitlines() if l]
            for l in hits[:30]:
                rep.add("C", "hist|%s|%s" % (r.name, l.split()[0]), "검토", "%s 이력 `%s` — 키처럼 생긴 줄을 넣거나 뺀 커밋" % (r.name, l[:90]))
            added = git(r.path, "log", "--all", "--diff-filter=A", "--name-only", "--format=").splitlines()
            now = set(r.files())
            for f in sorted(set(x for x in added if x and RISKY_NAME.search(x) and x not in now)):
                rep.add("C", "histname|%s|%s" % (r.name, f), "검토", "%s 이력에만 남은 파일 `%s` — 지워도 기록에 있다" % (r.name, f))
    rep.notes["C"] = "두 저장소의 추적 파일 %d개 · 키 모양 %d건%s" % (sum(len(r.files()) for r in repos), n, " · 이력 포함" if history else " · 이력은 --history")


# ── D. 사이트에서 열리면 안 되는 주소 ─────────────────────────────────────────
def check_live(rep):
    bad = 0
    for site in SITES:
        for p in MUST_404:
            st, body = http("GET", site + p)
            if st == 200 and len(body) > 0:
                bad += 1
                rep.add("D", "live|%s%s" % (site, p), "위험", "`%s%s` 가 열린다(HTTP 200 · %d바이트)" % (site, p, len(body)))
    rep.notes["D"] = "주소 %d개 — 열린 것 %d" % (len(SITES) * len(MUST_404), bad)


# ── E. SQL 파일로 보는 RLS·뷰·권한(파일 기준 — 진짜 DB 상태는 A 가 본다) ───────
def check_sql(rep, sqls):
    alltext = "\n".join(t for _, t in sqls)
    low = alltext.lower()
    tables = {}
    views = {}
    for src, t in sqls:
        for m in re.finditer(r"create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?\"?([a-z_][a-z0-9_]*)", t, re.I):
            tables.setdefault(m.group(1).lower(), src)
        for m in re.finditer(r"create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:public\.)?\"?([a-z_][a-z0-9_]*)", t, re.I):
            views.setdefault(m.group(1).lower(), src)
    looped = set()      # do $$ foreach t in array[...] loop execute format('alter table public.%I enable row level security', t)
    for _, t in sqls:
        if re.search(r"format\(\s*'alter\s+table\s+(?:public\.)?%I\s+enable\s+row\s+level\s+security", t, re.I):
            looped |= set(x.lower() for x in re.findall(r"'([a-z_][a-z0-9_]*)'", t))
    for n, src in sorted(tables.items()):
        if n in looped:
            continue
        if not re.search(r"alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?\"?%s\"?\s+enable\s+row\s+level\s+security" % re.escape(n), low):
            rep.add("E", "rls|%s" % n, "검토", "표 `%s` — SQL 파일 어디에도 `enable row level security` 가 없다(%s)" % (n, src))
    for n, src in sorted(views.items()):
        inv = re.search(r"view\s+(?:public\.)?%s\b[^;]*security_invoker" % re.escape(n), low)
        rev = re.search(r"revoke\s+[^;]*\bon\s+(?:table\s+)?[^;]*\b%s\b[^;]*from[^;]*anon" % re.escape(n), low)
        if not (inv and rev):
            rep.add("E", "view|%s" % n, "검토", "뷰 `%s` — %s(%s)" % (
                n, " · ".join(x for x in ["security_invoker 없음" if not inv else "", "anon revoke 없음" if not rev else ""] if x), src))
    for src, t in sqls:
        for m in re.finditer(r"^[^\n-]*\bto\s+authenticated\b[^\n]*", t, re.I | re.M):
            line = m.group(0).strip()
            if "legacy_app_users" in t[m.start(): m.start() + 600]:
                continue      # 다른 앱 표를 그 앱 허가 명단에 묶은 것(002_gate_legacy_app_tables.sql)
            rep.add("E", "authn|%s|%s" % (src, line[:60]), "검토", "`%s` — `to authenticated` (카카오 계정만 있으면 누구나): `%s`" % (src, line[:90]))
        for m in re.finditer(r"create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)[^;]*?security\s+definer", t, re.I | re.S):
            fn = m.group(1).lower()
            if not re.search(r"revoke\s+[^;]*function\s+(?:public\.)?%s\b[^;]*from[^;]*(anon|public)" % re.escape(fn), low):
                rep.add("E", "definer|%s" % fn, "검토", "함수 `%s` — SECURITY DEFINER 인데 anon·public revoke 가 파일에 없다(%s)" % (fn, src))
    rep.notes["E"] = "SQL 파일 %d개 · 표 %d · 뷰 %d" % (len(sqls), len(tables), len(views))


# ── F. 화면 — HTML 을 끼워 넣는 자리 수와 바깥 스크립트 ────────────────────────
def check_front(rep, repos, base):
    old = base.get("counts", {})
    counts = {}
    for r in repos:
        per = {}
        for f, _, _ in r.grep(r"innerHTML|insertAdjacentHTML|outerHTML\s*=|document\.write\(|\beval\(|new Function\(", "*.js", "*.html"):
            if not f.startswith(("tests/", "tools/", "docs/", "guide/", "booklet/", "자료/", "bible-note/")):
                per[f] = per.get(f, 0) + 1
        for f, c in per.items():
            k = r.name + ":" + f
            counts[k] = c
            if k in old and c > old[k]:
                rep.add("F", "sink|%s|%d" % (k, c), "검토", "`%s` — HTML 을 끼워 넣는 자리가 늘었다(%d → %d) · 새 자리에 성도님 입력이 들어가는지 볼 것" % (k, old[k], c))
            elif k not in old and old:
                rep.add("F", "sink|%s|new" % k, "검토", "`%s` — 새 파일 · HTML 을 끼워 넣는 자리 %d곳" % (k, c))
        for f, _, s in r.grep(r"<script[^>]+src=[\"']https?://[^/\"']+", "*.html", only=True):
            host = re.search(r"https?://([^/\"']+)", s).group(1)
            if not f.startswith(("docs/", "guide/", "booklet/", "자료/", "tools/", "tests/")):
                rep.add("F", "ext|%s|%s|%s" % (r.name, f, host), "검토", "%s `%s` — 바깥 스크립트 `%s`" % (r.name, f, host))
    rep.notes["F"] = "HTML 을 끼워 넣는 자리 %d곳(파일 %d개)" % (sum(counts.values()), len(counts))
    return counts


# ── 결과 ──────────────────────────────────────────────────────────────────────
TITLES = {"A": "A. DB 를 공개 키로 직접 읽을 수 있나", "B": "B. 누가 무엇을 부를 수 있나(액션)", "C": "C. 공개 저장소에 들어간 것",
          "D": "D. 사이트에서 열리면 안 되는 주소", "E": "E. SQL 파일의 RLS·뷰·권한", "F": "F. 화면(HTML 끼워 넣기·바깥 스크립트)"}


def main():
    ap = argparse.ArgumentParser(description="보안 점검(읽기만)")
    ap.add_argument("--env", choices=["prod", "dev"], default="prod")
    ap.add_argument("--ref", default="origin/main", help="읽을 git 자리(기본 origin/main)")
    ap.add_argument("--no-fetch", action="store_true")
    ap.add_argument("--history", action="store_true", help="git 이력까지 본다(느리다)")
    ap.add_argument("--probe-guards", action="store_true", help="틀린 암호로 관리자 액션을 불러 본다(개발에서만)")
    ap.add_argument("--accept", action="store_true", help="지금 나온 것을 모두 「본 것」으로 적는다")
    ap.add_argument("--only", default="ABCDEF", help="돌릴 절(예 ACD)")
    ap.add_argument("--ci", action="store_true",
                    help="GitHub Actions 용 — 「위험」만 실패로 치고, 내용은 기록에 찍지 않고 텔레그램으로만 보낸다(Actions 기록은 공개다)")
    a = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    repos = [Repo("성경암송", ROOT, a.ref), Repo("교회어드민", ADMIN, a.ref)]
    if not a.no_fetch:
        for r in repos:
            git(r.path, "fetch", "-q", "origin")
    os.makedirs(os.path.join(OUT, "결과"), exist_ok=True)
    base_path = os.path.join(OUT, "baseline.json")
    base = json.load(open(base_path, encoding="utf-8")) if os.path.exists(base_path) else {}
    seen = base.get("seen", {})

    rep = Report()
    sqls = sql_texts(repos) if set(a.only) & set("AE") else []
    counts = None
    if "A" in a.only: check_db(rep, repos, sqls, a.env)
    if "B" in a.only: check_surface(rep, repos[0], repos[1], a.env, a.probe_guards)
    if "C" in a.only: check_repo(rep, repos, a.history)
    if "D" in a.only: check_live(rep)
    if "E" in a.only: check_sql(rep, sqls)
    if "F" in a.only: counts = check_front(rep, repos, base)

    today = datetime.date.today().isoformat()
    new = [(s, k, lv, t) for s, k, lv, t in rep.items if lv != "정보" and k not in seen]
    known = [(s, k, lv, t) for s, k, lv, t in rep.items if lv != "정보" and k in seen]
    gone = sorted(k for k in seen if k[0] in a.only and k not in {i[1] for i in rep.items})

    L = ["# 보안 점검 결과 — %s" % today, "",
         "- 대상: %s DB(공개 키 · 읽기만) · 성경암송 `%s` %s · 교회 어드민 `%s` %s" % (
             "운영" if a.env == "prod" else "개발", a.ref, git(ROOT, "rev-parse", "--short", a.ref).strip(),
             a.ref, git(ADMIN, "rev-parse", "--short", a.ref).strip()),
         "- **새로 나온 것 %d건**(위험 %d · 검토 %d) · 이미 본 것 %d건 · 사라진 것 %d건" % (
             len(new), sum(1 for x in new if x[2] == "위험"), sum(1 for x in new if x[2] == "검토"), len(known), len(gone)),
         "- ⚠️ 이 파일은 저장소에 넣지 않는다(공개 저장소 · 사이트가 통째로 배포한다).", ""]
    for sec in "ABCDEF":
        if sec not in a.only:
            continue
        L += ["## " + TITLES[sec], "", "요약: " + rep.notes.get(sec, "-"), ""]
        mine = [x for x in new if x[0] == sec]
        for lv in ("위험", "검토"):
            rows = [x for x in mine if x[2] == lv]
            if rows:
                L += ["**새로 나온 것 — %s %d건**" % (lv, len(rows)), ""] + ["- [ ] %s" % x[3] for x in rows] + [""]
        if not mine:
            L += ["새로 나온 것 없음.", ""]
        old_rows = [x for x in known if x[0] == sec]
        if old_rows:
            L += ["<details><summary>이미 본 것 %d건</summary>" % len(old_rows), ""]
            L += ["- %s — _%s_" % (x[3], seen.get(x[1], "")) for x in old_rows] + ["", "</details>", ""]
    if gone:
        L += ["## 사라진 것(전에는 있었고 지금은 없다)", ""] + ["- `%s`" % k for k in gone] + [""]
    out_path = os.path.join(OUT, "결과", "%s-%s.md" % (today, a.env))
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(L))

    for sec in "ABCDEF":
        if sec in a.only:
            mine = [x for x in new if x[0] == sec]
            print("%s  %s\n     %s\n     새로 나온 것: 위험 %d · 검토 %d" % (
                "❌" if any(x[2] == "위험" for x in mine) else ("⚠️ " if mine else "✅"), TITLES[sec], rep.notes.get(sec, "-"),
                sum(1 for x in mine if x[2] == "위험"), sum(1 for x in mine if x[2] == "검토")))
    print("\n결과: %s" % out_path)

    if counts is not None and "counts" not in base and not a.ci:
        # 처음 돌린 날의 수를 기준으로 삼는다 — F 는 「지난번보다 늘었나」만 보므로 기준이 없으면 영영 조용하다
        base["counts"] = counts
        with open(base_path, "w", encoding="utf-8") as f:
            json.dump(base, f, ensure_ascii=False, indent=1, sort_keys=True)

    if a.ci:
        # 「본 것」 목록이 없는 자리(Actions)에서 돈다 — 「검토」는 전부 새것으로 보이므로 「위험」만 가린다.
        # ⚠️ 무엇이 열렸는지는 여기 찍지 않는다(공개 저장소의 Actions 기록은 누구나 읽는다). 수만 찍고 내용은 텔레그램으로.
        danger = [x for x in rep.items if x[2] == "위험"]
        tok, chat = os.environ.get("TG_TOKEN"), os.environ.get("TG_CHAT")
        if danger and tok and chat:
            msg = "🔐 보안 점검 — 위험 %d건\n\n" % len(danger)
            msg += "\n".join("• " + x[3].replace("`", "").replace("**", "") for x in danger[:15])
            st, _ = http("POST", "https://api.telegram.org/bot%s/sendMessage" % tok, None, {"chat_id": chat, "text": msg[:3800]})
            print("텔레그램 경보: HTTP %d" % st)
        print("위험 %d건" % len(danger))
        return 1 if danger else 0

    if a.accept:
        for s, k, lv, t in rep.items:
            if lv != "정보" and k not in seen:
                seen[k] = today + " 봄"
        for k in gone:
            seen.pop(k, None)
        base["seen"] = seen
        if counts is not None:
            base["counts"] = counts
        with open(base_path, "w", encoding="utf-8") as f:
            json.dump(base, f, ensure_ascii=False, indent=1, sort_keys=True)
        print("「본 것」 %d건으로 적었다: %s" % (len(seen), base_path))
        return 0
    return 1 if new else 0


if __name__ == "__main__":
    sys.exit(main())
