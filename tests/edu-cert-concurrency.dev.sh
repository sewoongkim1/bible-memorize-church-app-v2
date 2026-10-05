#!/usr/bin/env bash
# 교육신청 3단계 — 동시 수료 확정 — **개발에서만**. 수료번호가 겹치지 않는지 두 연결로 진짜 겹쳐 본다.
#   쓰는 법: WORK=<개발을 link 한 스크래치 폴더> bash tests/edu-cert-concurrency.dev.sh
#   하는 일: 시험 강좌 셋(제목 cert-conc-test)을 만들고 네 호출을 동시에 —
#     ① 강좌 1 의 다섯 분 ② 강좌 2 의 다섯 분(서로 다른 강좌 — 해 줄 하나를 다툰다)
#     ③ 강좌 3 의 [가, 나] ④ 강좌 3 의 [나, 다](같은 강좌 · 한 분 겹침 — 강좌 줄을 다툰다)
#   → 번호 13개가 겹치지 않고 빈틈없이 이어진다 · 강좌마다 덩이로 이어진다 · 「나」는 한 번만 새 번호(다른 쪽은 already) ·
#     호출이 한 줄로 선다(edu_issue_certs 가 끝난 시각 사이가 HOLD 초 이상 — 잠금을 쥔 채 pg_sleep 으로 기다리게 했다).
#   ⑤ (검토 반영 2026-10-05) 다른 강좌 id 를 섞어 보낸 확정은 그 줄을 잠그지 않고 곧바로 wrong-course —
#     한 연결이 강좌 2 의 신청 줄을 HOLD2 초 동안 잠가 두고, 그사이 다른 연결이 강좌 1 확정에 그 줄 id 를 섞어 보낸다 →
#     기다리지 않고(1초 안) wrong-course 여야 한다(옛 함수는 그 줄 잠금을 기다렸다).
#   끝나면(실패해도) 시험 신청·강좌를 지우고 그 해 번호 차례(edu_cert_seq)를 시작 전 값으로 되돌린다(개발에서만 되돌린다 — 운영은 늘기만).
# ⚠️ 명령줄 SQL 에 한글을 쓰지 않는다(이름·제목 모두 영문 · 번호의 한글은 결과로만 읽는다). 키는 찍지 않는다.
set -euo pipefail
: "${WORK:?WORK=<개발 link 폴더>}"
q() { supabase --workdir "$WORK" db query --linked "$1" 2>&1; }
# SQL 한 줄 → 첫 행 첫 칸(없으면 빈 글)
val() {
  q "$1" | PYTHONIOENCODING=utf-8 python -c '
import json, sys
t = sys.stdin.read()
d, _ = json.JSONDecoder().raw_decode(t[t.index("{"):])
r = d.get("rows") or []
v = list(r[0].values())[0] if r else None
print("" if v is None else v)
'
}
USERS=$(val "select count(*) from users")
[ -n "$USERS" ] && [ "$USERS" -lt 200 ] || { echo "users=$USERS — 개발이 아닌 것 같다. 멈춘다"; exit 1; }
YEAR=$(val "select extract(year from now() at time zone 'Asia/Seoul')::int")
OLD=$(val "select coalesce((select last::text from edu_cert_seq where year=$YEAR),'none')")
[ -n "$OLD" ] || { echo "번호 차례를 못 읽었다"; exit 1; }
echo "dev users=$USERS · year=$YEAR · 시작 전 차례=$OLD"
TMP=$(mktemp -d)
cleanup() {   # 실패해도 시험 줄을 지우고 차례를 되돌린다
  q "delete from edu_enrollments where course_id in (select id from edu_courses where title='cert-conc-test'); delete from edu_courses where title='cert-conc-test'" >/dev/null 2>&1 || true
  if [ "$OLD" = "none" ]; then q "delete from edu_cert_seq where year=$YEAR" >/dev/null 2>&1 || true
  else q "update edu_cert_seq set last=$OLD where year=$YEAR" >/dev/null 2>&1 || true; fi
  rm -rf "$TMP"
}
trap cleanup EXIT
q "delete from edu_enrollments where course_id in (select id from edu_courses where title='cert-conc-test'); delete from edu_courses where title='cert-conc-test'" >/dev/null
mk() {   # 강좌 하나 + 확정 n 분 → 강좌 id
  local tag=$1 n=$2 cid
  cid=$(val "insert into edu_courses(title,kind,term,status) values('cert-conc-test','lecture','$tag','running') returning id")
  [ -n "$cid" ] || { echo "강좌를 못 만들었다"; exit 1; }
  q "insert into edu_enrollments(course_id,user_id,ident_key,name,status,source) select '$cid',null,'staff|cc|||$tag-'||i,'cc-$tag-'||i,'confirmed','staff' from generate_series(1,$n) i" >/dev/null
  echo "$cid"
}
C1=$(mk c1 5); C2=$(mk c2 5); C3=$(mk c3 3)
ids() { val "select string_agg(id::text, ',' order by id) from edu_enrollments where course_id='$1'"; }
I1=$(ids "$C1"); I2=$(ids "$C2"); I3=$(ids "$C3")
IFS=, read -r A B C <<<"$I3"
HOLD=${HOLD:-4}   # 잠금을 쥐고 기다리는 초(CLI 연결이 몇 초씩 어긋나서 짧으면 겹치지 않는다 · edu-concurrency.dev.sh 와 같은 까닭)
issue() {   # 이름, 강좌, id 목록 — 연결 오류일 때만 다시
  local name=$1 cid=$2 list=$3 t f="$TMP/$1.txt"
  for t in 1 2 3 4 5 6 7 8; do
    q "select edu_issue_certs('$cid', array[$list]::bigint[], null) as r, statement_timestamp() as t_start, clock_timestamp() as t_got, pg_sleep($HOLD) as hold" >"$f" || true
    if grep -qE 'ConnectTempRole|Failed to connect' "$f"; then sleep 1; continue; fi
    return 0
  done
}
T0=$(date +%s)
issue r1 "$C1" "$I1" & issue r2 "$C2" "$I2" & issue r3 "$C3" "$A,$B" & issue r4 "$C3" "$B,$C" &
wait
echo "네 호출 $(( $(date +%s) - T0 ))초"
q "select course_id::text as c, id, cert_no, split_part(cert_no,'-',3)::int as n, completed from edu_enrollments where course_id in ('$C1','$C2','$C3') order by id" >"$TMP/db.txt"
SEQ=$(val "select last from edu_cert_seq where year=$YEAR")
P1=0
PYTHONIOENCODING=utf-8 python - "$TMP" "$HOLD" "$OLD" "$SEQ" "$C1" "$C2" "$C3" "$B" <<'PYEOF' || P1=1
import json, sys, os
from datetime import datetime
tmp, hold, old, seq, c1, c2, c3, b = sys.argv[1:]
hold = float(hold); old = 0 if old == "none" else int(old); seq = int(seq); b = int(b)
def first(t):
    d, _ = json.JSONDecoder().raw_decode(t[t.index("{"):])
    return d.get("rows") or []
def ts(s):   # 「2026-10-05 12:00:00.123456+00」 꼴
    s = s.replace(" ", "T")
    if s.endswith("+00"): s += ":00"
    return datetime.fromisoformat(s).timestamp()
fail = []
res, got, waited = {}, [], 0
for k in ("r1", "r2", "r3", "r4"):
    t = open(os.path.join(tmp, k + ".txt"), encoding="utf-8").read()
    try:
        row = first(t)[0]
    except Exception:
        fail.append(k + " 결과 없음: " + t[:300]); continue
    r = row["r"] if isinstance(row["r"], dict) else json.loads(row["r"])
    res[k] = r
    if r.get("ok") is not True: fail.append(k + " 실패: " + json.dumps(r, ensure_ascii=False))
    a, g = ts(row["t_start"]), ts(row["t_got"])
    got.append(g)
    if g - a >= 0.3: waited += 1
rows = first(open(os.path.join(tmp, "db.txt"), encoding="utf-8").read())
nos = [r["n"] for r in rows]
if len(rows) != 13 or not all(r["completed"] for r in rows): fail.append("수료 줄 %d (13 이어야)" % len(rows))
if len(set(r["cert_no"] for r in rows)) != 13: fail.append("번호가 겹친다")
if nos and (min(nos) != old + 1 or max(nos) != old + 13): fail.append("빈틈 · 범위 %s~%s (기대 %d~%d)" % (min(nos), max(nos), old + 1, old + 13))
if seq != old + 13: fail.append("차례 %d (기대 %d)" % (seq, old + 13))
for c in (c1, c2):
    m = [r["n"] for r in rows if r["c"] == c]
    if len(m) != 5 or max(m) - min(m) != 4: fail.append("강좌 덩이가 끊김 " + str(sorted(m)))
hows = [x["how"] for k in ("r3", "r4") for x in res.get(k, {}).get("issued", []) if x["id"] == b]
if sorted(hows) != ["already", "new"]: fail.append("겹친 분(나)의 how " + str(hows))
got.sort()
gap = min(y - x for x, y in zip(got, got[1:])) if len(got) == 4 else 0
print("잠금을 기다린 호출 %d개 · 끝난 시각 사이 최소 간격 %.2f초(잠금이 맞으면 %.0f 이상) · 번호 %s~%s" % (waited, gap, hold, min(nos) if nos else "-", max(nos) if nos else "-"))
if waited < 1: fail.append("기다린 호출이 없다(겹치지 않았다)")
if gap < hold - 0.05: fail.append("호출이 한 줄로 서지 않았다")
if fail:
    print("실패 — " + " / ".join(fail)); sys.exit(1)
print("통과 — 번호 13개 겹침·빈틈 없음 · 강좌마다 덩이 · 겹친 분은 한 번만 · 한 줄로 섰다")
PYEOF

# ⑤ 다른 강좌 id 를 섞은 확정은 그 줄을 잠그지 않는다 — 강좌 2 의 첫 신청 줄(X)을 한 연결이 잠가 둔 사이 강좌 1 확정에 X 를 섞는다
HOLD2=${HOLD2:-10}; LAG=${LAG:-4}
X=${I2%%,*}; Y=${I1%%,*}
run() {   # 이름, SQL — 연결 오류일 때만 다시
  local f="$TMP/$1.txt" t
  for t in 1 2 3 4 5 6 7 8; do
    q "$2" >"$f" || true
    if grep -qE 'ConnectTempRole|Failed to connect' "$f"; then sleep 1; continue; fi
    return 0
  done
}
run hold "with l as (select id from edu_enrollments where id=$X for update) select (select count(*) from l) as locked, statement_timestamp() as h_start, pg_sleep($HOLD2) as s, clock_timestamp() as h_end" &
sleep "$LAG"
run probe "select edu_issue_certs('$C1', array[$Y,$X]::bigint[], null) as r, statement_timestamp() as t_start, clock_timestamp() as t_got"
wait
P5=0
PYTHONIOENCODING=utf-8 python - "$TMP" "$X" <<'PYEOF' || P5=1
import json, sys, os
from datetime import datetime
tmp, x = sys.argv[1], int(sys.argv[2])
def first(t):
    d, _ = json.JSONDecoder().raw_decode(t[t.index("{"):])
    return (d.get("rows") or [{}])[0]
def ts(s):
    s = s.replace(" ", "T")
    if s.endswith("+00"): s += ":00"
    return datetime.fromisoformat(s).timestamp()
h = first(open(os.path.join(tmp, "hold.txt"), encoding="utf-8").read())
p = first(open(os.path.join(tmp, "probe.txt"), encoding="utf-8").read())
r = p["r"] if isinstance(p.get("r"), dict) else json.loads(p.get("r") or "{}")
hs, he, ps, pg = ts(h["h_start"]), ts(h["h_end"]), ts(p["t_start"]), ts(p["t_got"])
fail = []
if h.get("locked") != 1: fail.append("잠그는 쪽이 줄을 못 잡았다 " + json.dumps(h, ensure_ascii=False))
overlap = hs <= ps <= he - 0.5
if not overlap: fail.append("겹치지 않았다(확정이 잠금 시간 밖에서 돌았다 — LAG·HOLD2 를 늘려 다시)")
if r.get("error") != "wrong-course" or r.get("ids") != [x]: fail.append("wrong-course 가 아님 " + json.dumps(r, ensure_ascii=False))
if pg - ps >= 1.0: fail.append("다른 강좌 줄 잠금을 %.2f초 기다렸다(그 줄을 잠그려 했다)" % (pg - ps))
print("⑤ 잠긴 다른 강좌 줄을 섞은 확정: %s · 기다린 시간 %.2f초 · 잠금 시간 안에서 돌았나 %s" % (r.get("error"), pg - ps, overlap))
if fail:
    print("실패 — " + " / ".join(fail)); sys.exit(1)
print("통과 — 다른 강좌 줄은 잠그지 않고 곧바로 wrong-course")
PYEOF
[ "$P1" = "0" ] && [ "$P5" = "0" ] || exit 1
