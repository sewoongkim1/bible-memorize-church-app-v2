# -*- coding: utf-8 -*-
"""사역팀 목록을 DB 시드 SQL 로 뽑는다 — 손으로 옮겨 적지 않는다.

자료는 ministry_catalog_2027.json(부서 확인 확정본)이고, 없으면 초안을 쓴다.
94행을 손으로 INSERT 문으로 만들면 반드시 어딘가 틀리고, 틀려도 티가 안 난다.

⚠️ **지우고 다시 넣는다**(delete → insert). 팀이 폐지되면 그 행이 사라져야
   하는데, upsert 만 하면 옛 행이 남아 성도님 화면에 계속 보인다.
   신청(ministry_orders)은 팀 이름을 스냅샷으로 들고 있어 영향받지 않는다.

⚠️ 개발 DB 에 먼저 돌린다. 운영은 확인한 뒤에.

사용법: python tools/ministry-seed-sql.py
출력:   supabase/ministry_seed_2027.sql
"""
import io, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
OUT_DIR = os.path.join(ROOT, 'ministry')
FINAL = os.path.join(OUT_DIR, 'ministry_catalog_2027.json')
DRAFT = os.path.join(OUT_DIR, 'ministry_catalog_2027_draft.json')
CATALOG = FINAL if os.path.exists(FINAL) else DRAFT
OUT_SQL = os.path.join(ROOT, 'supabase', 'ministry_seed_2027.sql')
YEAR = 2027

with io.open(CATALOG, encoding='utf-8') as f:
    ROWS = json.load(f)


def q(s):
    """SQL 문자열 리터럴 — 작은따옴표를 두 번 써서 막는다."""
    return "'" + (s or '').replace("'", "''") + "'"


lines = [
    "-- 사역팀 목록 시드 (%d) — tools/ministry-seed-sql.py 가 만든다. 손으로 고치지 말 것." % YEAR,
    "-- 자료: ministry/%s" % os.path.basename(CATALOG),
    "-- ⚠️ 개발 DB 에 먼저 실행한 뒤 운영에 올린다.",
    "",
    "begin;",
    "",
    "-- 지우고 다시 넣는다 — 폐지된 팀이 남아 있으면 성도님 화면에 계속 보인다",
    "delete from public.ministry_catalog where year = %d;" % YEAR,
    "",
    "insert into public.ministry_catalog",
    "  (year, committee, group_name, team, kind, schedule_note, desc_note,"
    " capacity_note, option_note, sort_order)",
    "values",
]

vals = []
for i, r in enumerate(ROWS):
    vals.append("  (%d, %s, %s, %s, %s, %s, %s, %s, %s, %d)" % (
        YEAR, q(r['committee']), q(r['group']), q(r['team']), q(r['kind']),
        q(r['schedule_note']), q(r['desc_note']), q(r['capacity_note']),
        q(r['option_note']), i))
lines.append(",\n".join(vals) + ";")
lines += [
    "",
    "commit;",
    "",
    "-- 확인",
    "--   select count(*) from ministry_catalog where year = %d;            -- %d 이어야 한다" % (YEAR, len(ROWS)),
    "--   select committee, count(*) from ministry_catalog where year = %d group by 1 order by 1;" % YEAR,
    "",
]

io.open(OUT_SQL, 'w', encoding='utf-8', newline='').write("\n".join(lines))
apply_n = sum(1 for r in ROWS if r['kind'] == 'apply')
print('wrote:', os.path.relpath(OUT_SQL, ROOT))
print('source:', os.path.basename(CATALOG), '| rows:', len(ROWS),
      '(apply %d / appoint %d)' % (apply_n, len(ROWS) - apply_n))
