#!/usr/bin/env bash
# 감시의 감시(GitHub 60일 멈춤 대비 · 2026-10-12 · docs/notes/monitor-guard.md) — 개발 DB 끝까지 시험(쓰기 포함). ⚠️ 개발 전용: users 가 200 이상이면 거부한다.
#   bash tests/monitor-watch.dev.sh
# 준비: supabase CLI 로그인 · 개발 api 에 이 판이 올라가 있을 것(python tools/deploy-fn.py api --dev --allow-ahead) · .env.dev 의 ADMIN_SECRET(개발 관리자 암호).
#        작업 폴더(E2E_WORKDIR)가 없으면 임시로 만들어 개발에 link 한다.
# 하는 일:
#   1) internalMonitorWatch — 키 없음·공개 키·틀린 키는 unauthorized
#   2) 흔적 monitorRun 이 없으면 unknown(알리지 않는다) · 5시간 전이면 ok · 50시간 전이면 stale(dry — 메일 없이 · GitHub 워크플로 상태를 읽어 온다)
#      · 지킴이 흔적 monitorWatchRun 을 남긴다
#   3) monitor — src "gha" 로 부르면 monitorRun 이 새로 남고, src 없이(관리자 화면처럼) 부르면 그대로다
#   4) monitor — monitorWatchRun 이 40시간 전이면 problems 에 한 줄(monitor-watch) · 방금이면 없다
#   를 보고, 두 흔적을 시작 전 값으로 되돌린다(실패해도 trap).
# ⚠️ 키·암호는 명령 안에서만 쓰고 찍지 않는다 · 본문에 한글을 쓰지 않는다(curl 이 깨뜨린다).
# ⚠️ 개발 api 에는 RESEND_API_KEY 가 없다 — dry 를 빼도 메일은 「no-resend-key」로 끝난다(그래도 dry 로 부른다).
set -u
REF=ktpwthwqzgcqcrmsafdo
BASE="https://$REF.supabase.co/functions/v1/api"
PUB="sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

W="${E2E_WORKDIR:-}"
if [ -z "$W" ]; then
  W=$(mktemp -d); mkdir -p "$W/supabase"
  supabase --workdir "$W" link --project-ref "$REF" >/dev/null 2>&1 || { echo "link 실패"; exit 2; }
fi
sq() {
  supabase --workdir "$W" db query --linked "$1" 2>/dev/null | PYTHONIOENCODING=utf-8 python -c '
import json, sys
t = sys.stdin.read()
d, _ = json.JSONDecoder().raw_decode(t[t.index("{"):])
r = d.get("rows") or []
print("" if not r else list(r[0].values())[0] if list(r[0].values())[0] is not None else "")
'
}
sx() { supabase --workdir "$W" db query --linked "$1" >/dev/null 2>&1; }
icall() {  # $1 = x-internal-key 값(빈 글이면 머리를 안 단다) · $2 = 본문
  if [ -n "$1" ]; then curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "x-internal-key: $1" -d "$2"
  else curl -s -X POST "$BASE" -H "Content-Type: application/json" -d "$2"; fi
}
pcall() { curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "apikey: $PUB" -H "Authorization: Bearer $PUB" -d "$1"; }
jqn() {
  PYTHONIOENCODING=utf-8 python -c '
import json, sys
d = json.load(sys.stdin)
print(eval(sys.argv[1]))
' "$1" <<< "$2"
}
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "  PASS $1 = $2"; pass=$((pass+1)); else echo "  FAIL $1 = $2 (expected $3)"; fail=$((fail+1)); fi; }

N=$(sq "select count(*) from users")
if [ -z "$N" ] || [ "$N" -ge 200 ]; then echo "users=$N — 개발이 아닌 것 같다. 중단."; exit 2; fi
echo "dev users=$N"

# 서비스 키(찍지 않는다) — internalMonitorWatch 가 ok:true 를 주면 맞는 키
probe() { icall "$1" '{"action":"internalMonitorWatch","dry":true}' | grep -c '"ok":true'; }
SK=""
if [ -f "$HOME/.church-admin/dev.env" ]; then SK=$(set -a; . "$HOME/.church-admin/dev.env" >/dev/null 2>&1; printf '%s' "${DEV_SERVICE_KEY:-}"); fi
if [ -z "$SK" ] || [ "$(probe "$SK")" != "1" ]; then
  SK=$(supabase projects api-keys --project-ref "$REF" --reveal -o json 2>/dev/null | PYTHONIOENCODING=utf-8 python -c '
import json, sys
d = json.load(sys.stdin)
print(next((k.get("api_key") or "" for k in d if k.get("type") == "secret"), ""))')
fi
if [ -z "$SK" ] || [ "$(probe "$SK")" != "1" ]; then echo "서비스 키를 못 찾았거나 api 에 internalMonitorWatch 가 없다 — 중단(키는 찍지 않는다)"; exit 2; fi
PW=$(set -a; . "$ROOT/.env.dev" >/dev/null 2>&1; printf '%s' "${ADMIN_SECRET:-}")
[ -z "$PW" ] && PW=$(set -a; . "$ROOT/../../bible-memorize-church-app-v2/.env.dev" >/dev/null 2>&1; printf '%s' "${ADMIN_SECRET:-}")
[ -n "$PW" ] || { echo ".env.dev 의 ADMIN_SECRET 이 없다 — 중단"; exit 2; }

# 시작 전 값(없으면 빈 글) — 끝나면 되돌린다
R0=$(sq "select coalesce((select value::text from app_config where key='monitorRun'),'')")
W0=$(sq "select coalesce((select value::text from app_config where key='monitorWatchRun'),'')")
restore() {
  for k in monitorRun monitorWatchRun; do
    v="$R0"; [ "$k" = monitorWatchRun ] && v="$W0"
    if [ -z "$v" ]; then sx "delete from app_config where key='$k'"
    else sx "insert into app_config(key,value,updated_at) values ('$k', '$v'::jsonb, now()) on conflict (key) do update set value=excluded.value, updated_at=now()"; fi
  done
  echo "  (흔적 둘을 시작 전 값으로 되돌렸다)"
}
trap restore EXIT
setrun() { sx "insert into app_config(key,value,updated_at) values ('$1', jsonb_build_object('at', to_char((now() - interval '$2 hours') at time zone 'utc','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')), now()) on conflict (key) do update set value=excluded.value, updated_at=now()"; }

echo "1) 문"
chk "키 없음" "$(jqn 'd.get("error")' "$(icall "" '{"action":"internalMonitorWatch","dry":true}')")" "unauthorized"
chk "공개 키" "$(jqn 'd.get("error")' "$(pcall '{"action":"internalMonitorWatch","dry":true}')")" "unauthorized"
chk "틀린 키" "$(jqn 'd.get("error")' "$(icall "x$SK" '{"action":"internalMonitorWatch","dry":true}')")" "unauthorized"

echo "2) 지킴이"
sx "delete from app_config where key='monitorRun'"
r=$(icall "$SK" '{"action":"internalMonitorWatch","dry":true}')
chk "흔적 없음 → state" "$(jqn 'd.get("state")' "$r")" "unknown"
chk "흔적 없음 → mailed" "$(jqn 'd.get("mailed")' "$r")" "None"
setrun monitorRun 5
r=$(icall "$SK" '{"action":"internalMonitorWatch","dry":true}')
chk "5시간 전 → state" "$(jqn 'd.get("state")' "$r")" "ok"
chk "5시간 전 → ageH" "$(jqn 'd.get("ageH")' "$r")" "5"
setrun monitorRun 50
r=$(icall "$SK" '{"action":"internalMonitorWatch","dry":true}')
chk "50시간 전 → state" "$(jqn 'd.get("state")' "$r")" "stale"
chk "50시간 전 → mailed" "$(jqn 'd.get("mailed")' "$r")" "dry"
chk "GitHub 워크플로 상태를 읽었다(monitor.yml)" "$(jqn 'any(w["path"].endswith("monitor.yml") for w in d.get("workflows",[]))' "$r")" "True"
echo "     (지금 GitHub 상태: $(jqn '", ".join(w["path"].split("/")[-1]+"="+w["state"] for w in d.get("workflows",[]))' "$r"))"
chk "지킴이 흔적 state" "$(sq "select value->>'state' from app_config where key='monitorWatchRun'")" "stale"
chk "지킴이 흔적 mailed" "$(sq "select value->>'mailed' from app_config where key='monitorWatchRun'")" "dry"
chk "지킴이 흔적이 방금(2분 안)" "$(sq "select (now() - (value->>'at')::timestamptz) < interval '2 minutes' from app_config where key='monitorWatchRun'")" "true"

echo "3) monitor 의 흔적"
setrun monitorRun 50
pcall "{\"action\":\"monitor\",\"pw\":\"$PW\"}" >/dev/null
chk "src 없이(관리자 화면) → 그대로 50시간 전" "$(sq "select (now() - (value->>'at')::timestamptz) > interval '49 hours' from app_config where key='monitorRun'")" "true"
r=$(pcall "{\"action\":\"monitor\",\"pw\":\"$PW\",\"src\":\"gha\"}")
chk "src gha → monitor 응답 db" "$(jqn 'd.get("db")' "$r")" "up"
chk "src gha → 흔적이 방금(2분 안)" "$(sq "select (now() - (value->>'at')::timestamptz) < interval '2 minutes' from app_config where key='monitorRun'")" "true"
chk "틀린 암호 + src gha → unauthorized" "$(jqn 'd.get("error")' "$(pcall '{"action":"monitor","pw":"wrong","src":"gha"}')")" "unauthorized"

echo "4) monitor 가 지킴이를 본다"
setrun monitorWatchRun 40
r=$(pcall "{\"action\":\"monitor\",\"pw\":\"$PW\"}")
chk "40시간 전 → problems 에 monitor-watch" "$(jqn 'any("monitor-watch" in p for p in d.get("problems",[]))' "$r")" "True"
chk "40시간 전 → monitorWatch.at 있음" "$(jqn 'bool((d.get("monitorWatch") or {}).get("at"))' "$r")" "True"
setrun monitorWatchRun 1
r=$(pcall "{\"action\":\"monitor\",\"pw\":\"$PW\"}")
chk "1시간 전 → problems 에 없음" "$(jqn 'any("monitor-watch" in p for p in d.get("problems",[]))' "$r")" "False"

echo ""
echo "통과 $pass · 실패 $fail"
[ "$fail" = 0 ]
