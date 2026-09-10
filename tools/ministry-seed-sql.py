# -*- coding: utf-8 -*-
"""사역팀 목록을 DB 시드 SQL 로 뽑는다 — 손으로 옮겨 적지 않는다.

자료는 ministry_catalog_2027.json(부서 확인 확정본)이고, 없으면 초안을 쓴다.
94행을 손으로 INSERT 문으로 만들면 반드시 어딘가 틀리고, 틀려도 티가 안 난다.

⚠️ **필터용 여섯 칸도 함께 싣는다**(2026-09-10 — day_sun·day_week·day_sat·
   time_from·time_to·freq). 이 여섯이 성도 화면의 필터가 읽는 값이다.
   부서가 아무것도 안 적으면 여섯이 다 비는데, 그때는 **DB 의 기존 값을 덮지 않는다**
   — 「안 적음」이 「없음」을 뜻하지 않기 때문이다. 여섯 중 하나라도 값이 있으면
   「적은 것」으로 보고 여섯을 **한 벌로** 바꾼다(요일 하나를 끄는 수정이
   되돌려지지 않으려면 벌 단위로 다뤄야 한다).

⚠️ **지우고 다시 넣지 않는다**(2026-09-08 수정). 처음엔 delete → insert 였는데
   두 가지가 깨진다:
     ① 관리자가 화면에서 채운 시간·하는 일·필요 인원이 통째로 날아간다
     ② bigserial id 가 다시 매겨져, 이미 들어온 신청(ministry_orders.team_id)이 엉뚱한
        팀을 가리키게 된다
   그래서 upsert 로 넣되, 시간·하는 일·필요 인원은 **JSON 에 값이 있을 때만**
   덮어쓴다(비어 있으면 DB 의 관리자 입력을 그대로 둔다).
   목록에서 빠진 팀은 **신청이 걸려 있지 않은 것만** 지운다.

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


def qn(s):
    """빈 값은 null 로 — 아래 on conflict 가 `is not null` 로 「적었는가」를 가린다."""
    s = (s or '').strip()
    return q(s) if s else 'null'


def b(v):
    return 'true' if v else 'false'


lines = [
    "-- 사역팀 목록 시드 (%d) — tools/ministry-seed-sql.py 가 만든다. 손으로 고치지 말 것." % YEAR,
    "-- 자료: ministry/%s" % os.path.basename(CATALOG),
    "-- ⚠️ 개발 DB 에 먼저 실행한 뒤 운영에 올린다.",
    "",
    "begin;",
    "",
    "-- upsert — id 를 지키고(신청이 팀 id 를 가리킨다), 관리자가 채운 값도 지킨다",
    "insert into public.ministry_catalog",
    "  (year, committee, group_name, team, kind, schedule_note, desc_note,"
    " capacity_note, option_note, sort_order,"
    " day_sun, day_week, day_sat, time_from, time_to, freq)",
    "values",
]

vals = []
for i, r in enumerate(ROWS):
    vals.append("  (%d, %s, %s, %s, %s, %s, %s, %s, %s, %d, %s, %s, %s, %s, %s, %s)" % (
        YEAR, q(r['committee']), q(r['group']), q(r['team']), q(r['kind']),
        q(r['schedule_note']), q(r['desc_note']), q(r['capacity_note']),
        q(r['option_note']), i,
        b(r.get('day_sun')), b(r.get('day_week')), b(r.get('day_sat')),
        qn(r.get('time_from')), qn(r.get('time_to')), qn(r.get('freq'))))
lines.append(",\n".join(vals))
lines += [
    "on conflict (year, committee, group_name, team) do update set",
    "  kind        = excluded.kind,",
    "  option_note = excluded.option_note,",
    "  sort_order  = excluded.sort_order,",
    "  -- 시간·하는 일·필요 인원은 JSON 에 값이 있을 때만 덮는다(관리자 입력 보존)",
    "  schedule_note = coalesce(nullif(excluded.schedule_note, ''), ministry_catalog.schedule_note),",
    "  desc_note     = coalesce(nullif(excluded.desc_note, ''),     ministry_catalog.desc_note),",
    "  capacity_note = coalesce(nullif(excluded.capacity_note, ''), ministry_catalog.capacity_note),",
    "  -- 필터 여섯 칸 — 부서가 하나라도 적었으면 여섯을 한 벌로 바꾸고,",
    "  -- 아무것도 안 적었으면 DB 에 있던 값을 그대로 둔다(안 적음 != 없음)",
    "  day_sun   = case when (excluded.day_sun or excluded.day_week or excluded.day_sat or excluded.time_from is not null or excluded.time_to is not null or excluded.freq is not null) then excluded.day_sun else ministry_catalog.day_sun end,",
    "  day_week  = case when (excluded.day_sun or excluded.day_week or excluded.day_sat or excluded.time_from is not null or excluded.time_to is not null or excluded.freq is not null) then excluded.day_week else ministry_catalog.day_week end,",
    "  day_sat   = case when (excluded.day_sun or excluded.day_week or excluded.day_sat or excluded.time_from is not null or excluded.time_to is not null or excluded.freq is not null) then excluded.day_sat else ministry_catalog.day_sat end,",
    "  time_from = case when (excluded.day_sun or excluded.day_week or excluded.day_sat or excluded.time_from is not null or excluded.time_to is not null or excluded.freq is not null) then excluded.time_from else ministry_catalog.time_from end,",
    "  time_to   = case when (excluded.day_sun or excluded.day_week or excluded.day_sat or excluded.time_from is not null or excluded.time_to is not null or excluded.freq is not null) then excluded.time_to else ministry_catalog.time_to end,",
    "  freq      = case when (excluded.day_sun or excluded.day_week or excluded.day_sat or excluded.time_from is not null or excluded.time_to is not null or excluded.freq is not null) then excluded.freq else ministry_catalog.freq end;",
    "",
    "-- 목록에서 빠진 팀 치우기 — 단, 이미 신청이 걸린 팀은 두고 사람이 본다",
    "delete from public.ministry_catalog c",
    " where c.year = %d" % YEAR,
    "   and (c.committee, c.group_name, c.team) not in (" + ", ".join(
        "(%s, %s, %s)" % (q(r["committee"]), q(r["group"]), q(r["team"])) for r in ROWS) + ")",
    "   and not exists (",
    "     select 1 from public.ministry_orders o",
    "      where o.year = c.year",
    "        and o.team_id = c.id",
    "   );",
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
