#!/usr/bin/env python3
"""Claude Code PreToolUse 훅 — 사람이 잊어도 막히는 두 가지(2026-10-12).

1. `supabase functions deploy` 를 직접 부르지 않는다 → `python tools/deploy-fn.py <함수> --dev|--prod`(배포 가드).
   직접 부르면 작업 트리를 통째로 올려, 남의 커밋 안 된 코드가 실리거나 낡은 체크아웃이면 남의 액션이 조용히 빠진다.
   (배포 가드는 supabase CLI 를 자기 안에서 부르므로 이 훅에 걸리지 않는다.)
2. `git add -A` · `git add --all` · `git add .` 를 쓰지 않는다 → 고친 파일 경로를 하나씩.
   여러 세션이 같은 체크아웃을 쓴다 — 통째로 담으면 남의 미완성 작업이 함께 나간다(푸시 = 배포).

등록: .claude/settings.json 의 hooks.PreToolUse 에 matcher "Bash|PowerShell" 로
      python "$CLAUDE_PROJECT_DIR/.claude/hooks/guard-bash.py"
막을 때는 permissionDecision "deny" 와 까닭을 돌려준다. 그 밖에는 아무것도 찍지 않고 0 으로 끝난다(그대로 진행).
"""
import json
import re
import sys

RULES = [
    (re.compile(r"\bsupabase(?:\.cmd|\.exe)?\s+functions\s+deploy\b", re.I),
     "Edge Function 은 배포 가드로 올립니다: python tools/deploy-fn.py <함수> --dev [--allow-ahead] / --prod "
     "(직접 deploy 는 작업 트리를 통째로 올려 남의 코드가 실리거나 남의 액션이 빠집니다 · docs/notes/backend-api.md 「배포 가드」)"),
    (re.compile(r"\bgit\s+add\s+(?:[^;&|\n]*\s)?(?:-A\b|--all\b|\.(?=\s|$|;|&|\|))"),
     "git add 는 고친 파일 경로를 하나씩 적습니다(git add -- <파일>). 여러 세션이 같은 체크아웃을 써서 "
     "통째로 담으면 남의 미완성 작업이 함께 나갑니다(푸시 = 배포)."),
]


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0  # 읽지 못하면 막지 않는다 — 훅이 고장 나서 일을 멈추게 하지 않는다
    cmd = (data.get("tool_input") or {}).get("command") or ""
    for pat, why in RULES:
        if pat.search(cmd):
            print(json.dumps({"hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": why,
            }}, ensure_ascii=True))   # 윈도 훅 출력이 cp949 로 읽혀도 깨지지 않게
            return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
