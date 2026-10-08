# -*- coding: utf-8 -*-
"""사이트(gocheok.onlybible.kr)로 내보낼 파일만 모은다 — 화면이 쓰는 것만 나간다(2026-10-08).

    python tools/site.py _site      # 배포(.github/workflows/deploy.yml)가 이렇게 부른다
    python tools/site.py            # 무엇이 나가는지 세어만 본다

전에는 저장소를 통째로 올려서 CLAUDE.md·docs/·supabase/(SQL·서버 코드)·tools/·tests/·
booklet/·android-app/·ios-app/ 이 주소만 알면 누구에게나 열렸다. 이제 아래 목록만 나간다.
(GitHub 저장소는 여전히 공개다 — 이 파일은 **사이트 주소로 열리는 것**만 줄인다.)

⚠️ 화면이 부르는 파일을 목록 밖에 두면 **localhost 에서는 되고 운영에서만 404** 가 난다.
   · 새 화면 폴더를 만들면 SITE_DIRS 에 더한다.
   · 루트에 두는 화면 파일은 ROOT_EXT 의 확장자여야 한다.
   tools/preflight.py 가 화면의 src·href 가 이 목록 안을 가리키는지 본다(조립하는 주소는 못 본다).
"""
import os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 화면 폴더 — 통째로 나간다
SITE_DIRS = ["js", "img", "music", "files", "guide", "privacy", "quiz", "cert", ".well-known"]
# 루트 파일 — 이 확장자만(CLAUDE.md·README.md·codemagic.yaml·.gitignore·.env.example 은 안 나간다)
ROOT_EXT = (".html", ".js", ".css", ".json", ".png", ".jpg", ".ico", ".svg", ".ics", ".webmanifest")
ROOT_NAMES = ("CNAME", ".nojekyll")
# 화면 폴더 안에 있어도 안 내보내는 것(그림 프롬프트·작업 메모)
SKIP_EXT = (".md",)


def site_files():
    """사이트로 나가는 파일(저장소 뿌리 기준 경로, / 구분)."""
    out = []
    for n in sorted(os.listdir(ROOT)):
        p = os.path.join(ROOT, n)
        if os.path.isfile(p) and (n in ROOT_NAMES or n.lower().endswith(ROOT_EXT)) and not n.startswith("_"):
            out.append(n)
    for d in SITE_DIRS:
        for r, ds, fs in os.walk(os.path.join(ROOT, d)):
            for f in sorted(fs):
                if f.lower().endswith(SKIP_EXT) or f.startswith("_"):
                    continue
                out.append(os.path.relpath(os.path.join(r, f), ROOT).replace("\\", "/"))
    return out


def build(dest):
    dest = os.path.join(ROOT, dest) if not os.path.isabs(dest) else dest
    if os.path.exists(dest):
        shutil.rmtree(dest)
    files = site_files()
    for f in files:
        t = os.path.join(dest, f)
        os.makedirs(os.path.dirname(t), exist_ok=True)
        shutil.copy2(os.path.join(ROOT, f), t)
    return files


if __name__ == "__main__":
    try: sys.stdout.reconfigure(encoding="utf-8")
    except Exception: pass
    if len(sys.argv) > 1:
        fs = build(sys.argv[1])
        print("사이트로 나가는 파일 %d개 → %s" % (len(fs), sys.argv[1]))
    else:
        fs = site_files()
        size = sum(os.path.getsize(os.path.join(ROOT, f)) for f in fs)
        print("사이트로 나가는 파일 %d개 · %.1fMB" % (len(fs), size / 1e6))
        tops = {}
        for f in fs:
            k = f.split("/")[0] if "/" in f else "(루트)"
            tops[k] = tops.get(k, 0) + 1
        for k, v in sorted(tops.items()):
            print("  %-14s %d" % (k, v))
