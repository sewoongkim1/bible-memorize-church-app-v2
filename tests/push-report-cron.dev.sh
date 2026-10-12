#!/usr/bin/env bash
# 크론 여섯 Vault 내부 키(2026-10-12 · supabase/push_report_cron.sql · api INTERNAL_CRON_OK · cronOnly) — 개발 DB 끝까지 시험(쓰기 포함).
#   ⚠️ 개발 전용: users 가 200 이상이거나 작업 폴더의 project-ref 가 개발이 아니면 거부한다.
#   bash tests/push-report-cron.dev.sh
# 준비: supabase CLI 로그인 · 개발 api 에 이 판이 올라가 있을 것(python tools/deploy-fn.py api --dev --allow-ahead) · .env.dev 의 ADMIN_SECRET(개발 관리자 암호).
#        작업 폴더(E2E_WORKDIR — 개발에 link 한 폴더 · 예 ~/.gocheok-backup/supa-dev)가 없으면 임시로 만들어 개발에 link 한다.
# 개발에는 받는 기기(push_subscriptions · ios_push_tokens)가 없고 RESEND_API_KEY 도 없다 — 진짜 크론 본문을 불러도 아무에게도 가지 않는다.
#   ⚠️ 받는 기기가 하나라도 있으면 시작하지 않는다(③ · ⑤ 가 실제로 보내는 갈래다).
# 하는 일:
#   ① 문 — 세 액션의 무해한 본문(sendPush · weeklyVersePush 는 hour 99 + 없는 user_id + diag · weeklyReport 는 앞으로 올 한 주)을
#      키 없음 · 공개 키 · 틀린 키로 → unauthorized, 맞는 키 → ok(total 0 또는 skipped)
#   ② 꼴 — 맞는 키라도 크론의 꼴이 아니면 bad-args(암호가 있어도) · 크론 셋이 아닌 eveningPush 는 unauthorized · 교회 어드민 길(stats)은 그대로 ok
#   ③ 좁히기 — 글 · 주소 · 받는 곳을 실어도 서버가 정한 꼴로 간다(새 push_log 줄의 mode 가 daily · 제목이 실은 글이 아니다)
#   ④ 리포트 — 같은 앞 주를 키 길 · 암호 길로 → 둘 다 ok · 같은 요약 · 같은 html(다르면 잇달아 한 번 더) · 누적 참여자 > 0(안쪽 stats 가 표를 받았다)
#   ⑤ 진짜 크론 본문(push_report_cron.sql 의 여섯 — 한글 제목은 UTF-8 임시 파일로 --data-binary) → push_log daily 네 줄(total 0) ·
#      weekly-verse 한 줄(개발에 이번 주 말씀이 없으면 skipped — 줄 없음) · 리포트 보내기 갈래 끝(sent.error = no-resend-key)
#   ⑥ 암호 길 회귀 — sendPush {pw, hour 99, 없는 user_id, diag} → ok · total 0 · 틀린 암호 → unauthorized · weeklyReport {pw, from, to} → ok
#   를 보고, 시험이 만든 push_log 줄(시작 전 max(id) 뒤의 daily · weekly-verse 줄)을 지운다(실패해도 trap).
# ⚠️ 키·암호는 명령 안에서만 쓰고 찍지 않는다 · 응답 원문을 찍지 않는다(고른 칸만).
set -u
REF=ktpwthwqzgcqcrmsafdo
BASE="https://$REF.supabase.co/functions/v1/api"
PUB="sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
Z="00000000-0000-0000-0000-000000000000"

W="${E2E_WORKDIR:-}"
if [ -z "$W" ]; then
  W=$(mktemp -d); mkdir -p "$W/supabase"
  supabase --workdir "$W" link --project-ref "$REF" >/dev/null 2>&1 || { echo "link 실패"; exit 2; }
fi
LINKED=$(cat "$W/supabase/.temp/project-ref" 2>/dev/null | tr -d '\r\n ')
if [ "$LINKED" != "$REF" ]; then echo "작업 폴더가 개발($REF)에 link 돼 있지 않다(지금: ${LINKED:-없음}) — 중단."; exit 2; fi

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
ifile() {  # 맞는 키로 파일 본문(UTF-8)을 그대로 보낸다 — 한글이 명령줄을 거치지 않게
  curl -s -X POST "$BASE" -H "Content-Type: application/json; charset=utf-8" -H "x-internal-key: $1" --data-binary "@$2"
}
pcall() { curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "apikey: $PUB" -H "Authorization: Bearer $PUB" -d "$1"; }
jqn() {
  PYTHONIOENCODING=utf-8 python -c '
import json, sys
t = sys.stdin.read()
try: d = json.loads(t)
except Exception: print("not-json"); sys.exit()
try: print(eval(sys.argv[1]))
except Exception as e: print("no-field:" + type(e).__name__ + ":" + str(d.get("error") if isinstance(d, dict) else ""))
' "$1" <<< "$2"
}
# 리포트 응답의 지문(요약 · html 의 sha256 앞 16자) — 응답 원문은 찍지 않는다
rsig() {
  PYTHONIOENCODING=utf-8 python -c '
import json, sys, hashlib
t = sys.stdin.read()
try: d = json.loads(t)
except Exception: print("not-json"); sys.exit()
if not d.get("ok"): print("not-ok:" + str(d.get("error"))); sys.exit()
s = hashlib.sha256(json.dumps(d["report"]["summary"], sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:16]
h = hashlib.sha256(d["html"].encode("utf-8")).hexdigest()[:16]
print(s + ":" + h)
' <<< "$1"
}
sigok() { case "$1" in not-*) printf '%s' "$1" ;; *) printf 'ok' ;; esac; }
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "  PASS $1 = $2"; pass=$((pass+1)); else echo "  FAIL $1 = $2 (expected $3)"; fail=$((fail+1)); fi; }

N=$(sq "select count(*) from users")
if [ -z "$N" ] || [ "$N" -ge 200 ]; then echo "users=$N — 개발이 아닌 것 같다. 중단."; exit 2; fi
DEV=$(sq "select (select count(*) from push_subscriptions) + (select count(*) from ios_push_tokens)")
if [ "$DEV" != "0" ]; then echo "받는 기기가 ${DEV:-?}개 있다 — 진짜 크론 본문이 그 기기로 간다. 중단."; exit 2; fi
echo "dev users=$N · 받는 기기 0"

# 서비스 키(찍지 않는다) — 빈 요청이 {ok:true} 면 맞는 키(쓰기 없음)
probe() { icall "$1" '{"action":"internalEduNotify","kind":"confirmed","enrollment_ids":[]}' | grep -c '"ok":true'; }
SK=""
if [ -f "$HOME/.church-admin/dev.env" ]; then SK=$(set -a; . "$HOME/.church-admin/dev.env" >/dev/null 2>&1; printf '%s' "${DEV_SERVICE_KEY:-}"); fi
if [ -z "$SK" ] || [ "$(probe "$SK")" != "1" ]; then
  echo "  (dev.env 키가 api 의 서비스 키와 다르다 — CLI 의 개발 secret 키를 쓴다)"
  SK=$(supabase projects api-keys --project-ref "$REF" --reveal -o json 2>/dev/null | PYTHONIOENCODING=utf-8 python -c '
import json, sys
d = json.load(sys.stdin)
print(next((k.get("api_key") or "" for k in d if k.get("type") == "secret"), ""))')
fi
if [ -z "$SK" ] || [ "$(probe "$SK")" != "1" ]; then echo "서비스 키를 못 찾았다 — 중단(키는 찍지 않는다)"; exit 2; fi
# ⚠️ 셸에 이미 ADMIN_SECRET 이 있을 수 있다 — 파일에서만 읽는다(unset 뒤 source · 없는 파일은 건너뛴다)
envpw() { [ -f "$1" ] || return 0; (unset ADMIN_SECRET; set -a; . "$1" >/dev/null 2>&1; printf '%s' "${ADMIN_SECRET:-}"); }
PW=$(envpw "$ROOT/.env.dev")
[ -z "$PW" ] && PW=$(envpw "$ROOT/../../bible-memorize-church-app-v2/.env.dev")   # worktree(C:/Projects/v2-wt/…)면 공유 체크아웃의 것
[ -n "$PW" ] || { echo ".env.dev 의 ADMIN_SECRET 이 없다 — 중단"; exit 2; }

# 앞으로 올 한 주(한국 날짜 +7 ~ +13) — 참여자 명단이 비어 응답에 이름이 없다(Git Bash 의 TZ 는 믿지 않는다 · 파이썬으로)
#   ⚠️ 윈도 파이썬은 줄 끝에 \r 을 붙인다 — 걷지 않으면 본문 JSON 이 깨진다(서버가 「Bad control character」 로 거절)
read -r F T < <(python -c 'import datetime as d; k = (d.datetime.now(d.timezone.utc) + d.timedelta(hours=9)).date(); print((k + d.timedelta(days=7)).isoformat(), (k + d.timedelta(days=13)).isoformat())' | tr -d '\r')
[ -n "$F" ] && [ -n "$T" ] || { echo "날짜를 못 셌다 — 중단"; exit 2; }

TMP=$(mktemp -d)
PL0=$(sq "select coalesce(max(id),0) from push_log")
[ -n "$PL0" ] || { echo "push_log 를 못 읽었다 — 중단"; exit 2; }
cleanup() {
  sx "delete from push_log where id > $PL0 and mode in ('daily','weekly-verse')"
  rm -rf "$TMP"
  echo "  (시험이 만든 push_log 줄을 지웠다 — 남은 줄 $(sq "select count(*) from push_log where id > $PL0 and mode in ('daily','weekly-verse')"))"
}
trap cleanup EXIT

SP="{\"action\":\"sendPush\",\"hour\":99,\"user_id\":\"$Z\",\"diag\":true}"
VP="{\"action\":\"weeklyVersePush\",\"hour\":99,\"user_id\":\"$Z\",\"diag\":true}"
RP="{\"action\":\"weeklyReport\",\"from\":\"$F\",\"to\":\"$T\"}"

echo "① 문(앞 주 $F ~ $T)"
for nb in "sendPush|$SP" "weeklyVersePush|$VP" "weeklyReport|$RP"; do
  n=${nb%%|*}; b=${nb#*|}
  chk "$n 키 없음" "$(jqn 'd.get("error")' "$(icall "" "$b")")" "unauthorized"
  chk "$n 공개 키" "$(jqn 'd.get("error")' "$(pcall "$b")")" "unauthorized"
  chk "$n 틀린 키" "$(jqn 'd.get("error")' "$(icall "x$SK" "$b")")" "unauthorized"
done
r=$(icall "$SK" "$SP")
chk "sendPush 맞는 키 → ok · total 0" "$(jqn '(d.get("ok"), d.get("total"))' "$r")" "(True, 0)"
r=$(icall "$SK" "$VP")
chk "weeklyVersePush 맞는 키 → ok · (total 0 또는 skipped)" "$(jqn 'd.get("ok") is True and (d.get("total") == 0 or d.get("skipped") is True)' "$r")" "True"
r=$(icall "$SK" "$RP")
chk "weeklyReport 맞는 키 → ok(미리보기)" "$(jqn 'd.get("ok")' "$r")" "True"

echo "② 꼴"
chk "sendPush {hour 99}" "$(jqn 'd.get("error")' "$(icall "$SK" '{"action":"sendPush","hour":99}')")" "bad-args"
chk "sendPush {hour 7 · diag(한 사람이 아님)}" "$(jqn 'd.get("error")' "$(icall "$SK" '{"action":"sendPush","hour":7,"diag":true}')")" "bad-args"
chk "sendPush {} (시각 없음 = 모두에게)" "$(jqn 'd.get("error")' "$(icall "$SK" '{"action":"sendPush"}')")" "bad-args"
chk "weeklyReport {from x}" "$(jqn 'd.get("error")' "$(icall "$SK" '{"action":"weeklyReport","from":"x"}')")" "bad-args"
chk "weeklyReport {user_id}" "$(jqn 'd.get("error")' "$(icall "$SK" "{\"action\":\"weeklyReport\",\"user_id\":\"$Z\"}")")" "bad-args"
chk "sendPush 암호가 있어도 꼴이 아니면" "$(jqn 'd.get("error")' "$(icall "$SK" "{\"action\":\"sendPush\",\"pw\":\"$PW\",\"title\":\"X\"}")")" "bad-args"
chk "eveningPush 는 크론 셋이 아니다" "$(jqn 'd.get("error")' "$(icall "$SK" '{"action":"eveningPush","dryRun":true}')")" "unauthorized"
chk "stats(교회 어드민 길 회귀)" "$(jqn 'd.get("ok")' "$(icall "$SK" '{"action":"stats","from":"2099-01-01","to":"2099-01-07"}')")" "True"

echo "③ 좁히기"
M3=$(sq "select coalesce(max(id),0) from push_log")
r=$(icall "$SK" '{"action":"sendPush","hour":5,"title":"XTITLE","url":"https://evil.example/","only":[],"userBodies":{}}')
chk "글 · 주소 · 받는 곳을 실은 sendPush → ok · total 0" "$(jqn '(d.get("ok"), d.get("total"))' "$r")" "(True, 0)"
chk "새 push_log 줄 = daily 하나" "$(sq "select count(*) from push_log where id > $M3 and mode = 'daily'")" "1"
chk "그 줄의 제목은 실은 글이 아니다" "$(sq "select count(*) from push_log where id > $M3 and title = 'XTITLE'")" "0"

echo "④ 리포트 — 키 길 · 암호 길"
k1=$(rsig "$(icall "$SK" "$RP")"); p1=$(rsig "$(icall "" "{\"action\":\"weeklyReport\",\"pw\":\"$PW\",\"from\":\"$F\",\"to\":\"$T\"}")")
if [ "$k1" != "$p1" ]; then
  echo "  (지문이 달라 잇달아 한 번 더)"
  k1=$(rsig "$(icall "$SK" "$RP")"); p1=$(rsig "$(icall "" "{\"action\":\"weeklyReport\",\"pw\":\"$PW\",\"from\":\"$F\",\"to\":\"$T\"}")")
fi
chk "키 길 응답 ok" "$(sigok "$k1")" "ok"
chk "암호 길 응답 ok" "$(sigok "$p1")" "ok"
chk "같은 요약 · 같은 html" "$([ "$k1" = "$p1" ] && echo same || echo "$k1 / $p1")" "same"
r=$(icall "$SK" "$RP")
chk "키 길 누적 참여자 > 0(안쪽 stats 가 표를 받았다)" "$(jqn 'd["report"]["summary"]["cumParticipants"] > 0' "$r")" "True"
echo "     (키 길 누적 참여자 $(jqn 'd["report"]["summary"]["cumParticipants"]' "$r"))"

echo "⑤ 진짜 크론 본문(push_report_cron.sql 의 여섯)"
M5=$(sq "select coalesce(max(id),0) from push_log")
for h in 5 6 7 8; do
  python -c 'import json, sys; open(sys.argv[1], "w", encoding="utf-8").write(json.dumps({"action": "sendPush", "latest": True, "title": "오직 성경, 말씀이 답이다!", "url": "https://gocheok.onlybible.kr/", "hour": int(sys.argv[2])}, ensure_ascii=False))' "$TMP/daily-$h.json" "$h"
  r=$(ifile "$SK" "$TMP/daily-$h.json")
  chk "daily-push-$h → ok · total 0" "$(jqn '(d.get("ok"), d.get("total"))' "$r")" "(True, 0)"
done
chk "push_log daily 네 줄(total 0)" "$(sq "select count(*) from push_log where id > $M5 and mode = 'daily' and total = 0")" "4"
printf '%s' '{"action":"weeklyVersePush"}' > "$TMP/verse.json"
r=$(ifile "$SK" "$TMP/verse.json")
if [ "$(jqn 'd.get("skipped") is True' "$r")" = "True" ]; then
  echo "     (개발에 이번 주 말씀이 없다 — skipped · 줄 없음)"
  chk "weekly-verse-push → ok · skipped" "$(jqn 'd.get("ok")' "$r")" "True"
  chk "push_log weekly-verse 줄 없음" "$(sq "select count(*) from push_log where id > $M5 and mode = 'weekly-verse'")" "0"
else
  chk "weekly-verse-push → ok · total 0" "$(jqn '(d.get("ok"), d.get("total"))' "$r")" "(True, 0)"
  chk "push_log weekly-verse 한 줄(total 0)" "$(sq "select count(*) from push_log where id > $M5 and mode = 'weekly-verse' and total = 0")" "1"
fi
printf '%s' '{"action":"weeklyReport","send":true}' > "$TMP/report.json"
r=$(ifile "$SK" "$TMP/report.json")
chk "weekly-report-email → 보내기 갈래 끝(no-resend-key)" "$(jqn '(d.get("sent") or {}).get("error")' "$r")" "no-resend-key"

echo "⑥ 암호 길 회귀"
r=$(icall "" "{\"action\":\"sendPush\",\"pw\":\"$PW\",\"hour\":99,\"user_id\":\"$Z\",\"diag\":true}")
chk "sendPush 암호 · diag → ok · total 0" "$(jqn '(d.get("ok"), d.get("total"))' "$r")" "(True, 0)"
chk "sendPush 틀린 암호" "$(jqn 'd.get("error")' "$(icall "" "{\"action\":\"sendPush\",\"pw\":\"wrong\",\"hour\":99,\"user_id\":\"$Z\",\"diag\":true}")")" "unauthorized"
chk "weeklyReport 암호 → ok" "$(jqn 'd.get("ok")' "$(icall "" "{\"action\":\"weeklyReport\",\"pw\":\"$PW\",\"from\":\"$F\",\"to\":\"$T\"}")")" "True"

echo ""
echo "통과 $pass · 실패 $fail"
[ "$fail" = 0 ]
