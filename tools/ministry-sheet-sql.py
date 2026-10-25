# -*- coding: utf-8 -*-
"""2027 사역 목록 — 「사역소개(앱)」 엑셀 시트를 DB 반영 SQL 로 뽑는다(2026-10-25 친구 「반영해 주세요」).

자료: 자료/사역신청/2027년사역신청(20271025).xlsx 의 「사역소개(앱)」 시트
      열 = 부서순번 · 팀명순번 · 부서 · 팀명 · 사역내용 및 소개 · 사역시간 · 주일(Y) · 임명직
출력: supabase/ministry_catalog_2027_sheet.sql

규칙
  · 팀명에 「-」 가 있으면 앞은 묶음(group_name), 뒤는 팀 — 「사역팀-운영」 → 묶음 사역팀 · 팀 운영(첫 「-」 에서만 자른다: 「어와나-스팍스/티엔티」)
  · 「임명직」 열이 임명직이면 kind='appoint'(성도님이 신청하지 않는 회색 칸) · 그 밖은 apply · 임명직 줄의 사역시간(「임명직」)은 시간 칸에 싣지 않는다
  · 「주일」 열 Y → day_sun=true · 이 시트에는 금·토·주중·횟수·시각이 없다 → 모두 false/null(전에 있던 예시 값은 비운다)
  · 셀 안의 줄바꿈은 <br> (하는 일 칸은 HTML 을 받는다 — 새가족부 설명이 이미 그렇다)
  · sort_order = 시트 줄 차례(0부터)
  · ⚠️ 만든 SQL 은 반복해 돌려도 안전하다 — 신청(ministry_orders)은 건드리지 않고, 신청이 걸린 팀은 지우지 않는다
사용법: python tools/ministry-sheet-sql.py [엑셀경로]
"""
import glob
import io
import os
import sys

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
YEAR = 2027
OUT = os.path.join(ROOT, 'supabase', 'ministry_catalog_2027_sheet.sql')
SHEET = '사역소개(앱)'
src = sys.argv[1] if len(sys.argv) > 1 else (glob.glob(os.path.join(ROOT, '자료', '사역신청', '2027년사역신청*.xlsx')) or [''])[0]
if not src or not os.path.exists(src):
    sys.exit('엑셀을 찾지 못했다: 자료/사역신청/2027년사역신청*.xlsx')

# 담당자가 화면에서 직접 쓴 설명·시간은 시트로 덮지 않는다(방송실·새가족부 4팀 — 2026-10-25 확인)
PROTECT = [('방송전산부', '', '방송실운영'), ('새가족부', '', '운영'), ('새가족부', '', '새가족영접'),
           ('새가족부', '', '새가족정착'), ('새가족부', '', '이단대응')]
# 이름이 바뀌는 줄 — 같은 줄을 이름만 바꿔 담당 한 줄·필요 인원·섬기는 분·「하나만 신청」을 지킨다 (committee, 옛 group, 옛 team) → (새 group, 새 team)
RENAMES = [
    (('교육위원회', '사랑부·어와나', '퍼글'), ('어와나', '퍼플')),
    (('교육위원회', '사랑부·어와나', '커비'), ('어와나', '커비')),
    (('교육위원회', '사랑부·어와나', '스팍스/티엔티'), ('어와나', '스팍스/티엔티')),
    (('교육위원회', '사랑부·어와나', '트랙/저니'), ('어와나', '트랙/저니')),
    (('방송전산부', '', '방송실 운영'), ('', '방송실운영')),
    (('제자양육부', '', '신앙운동'), ('신앙운동', '신앙운동팀')),
]
OPTION_NOTE = {'어와나': '어와나 4개 중 하나만 신청'}   # 묶음 → 안내(전에 있던 것 그대로)


def q(s):
    return "'" + (s or '').replace("'", "''") + "'"


def cell(v):
    s = '' if v is None else str(v).replace('\r\n', '\n').strip()
    s = s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return s.replace('\n', '<br>')


wb = openpyxl.load_workbook(src, data_only=True)
ws = wb[SHEET]
rows = []
for r in ws.iter_rows(min_row=2, values_only=True):
    com, name = (r[2] or '').strip(), (r[3] or '').strip()
    if not com or not name:
        continue
    grp, team = name.split('-', 1) if '-' in name else ('', name)
    appoint = str(r[7] or '').strip() == '임명직'
    when = cell(r[5])
    rows.append(dict(committee=com, group=grp.strip(), team=team.strip(), kind='appoint' if appoint else 'apply',
                     schedule='' if (appoint and when == '임명직') else when, desc=cell(r[4]),
                     sun=str(r[6] or '').strip().upper() == 'Y', option=OPTION_NOTE.get(grp.strip(), '')))

keys = [(r['committee'], r['group'], r['team']) for r in rows]
assert len(keys) == len(set(keys)), '같은 팀이 두 줄이다: %s' % [k for k in keys if keys.count(k) > 1]
for k in PROTECT:
    assert k in keys, '보호할 팀이 시트에 없다: %s' % (k,)

L = []
L.append("-- 2027 사역 목록 — 「사역소개(앱)」 시트 반영 (%d팀) — tools/ministry-sheet-sql.py 가 만든다. 손으로 고치지 말 것." % len(rows))
L.append("-- 자료: 자료/사역신청/%s (친구 2026-10-25 「반영해 주세요」)" % os.path.basename(src))
L.append("-- 실행 순서: 개발(ktpwthwqzgcqcrmsafdo) → 운영(xnomlgydifiqiybervtf). 반복해 돌려도 안전하다(신청은 건드리지 않는다).")
L.append("-- ⚠️ 이 파일은 신청(ministry_orders)을 지우지 않는다 — 테스트 신청을 비우는 일은 이 파일 밖에서 따로 했다(2026-10-25 · 운영 7건).")
L.append("-- 하는 일: ① 이름이 바뀌는 줄은 이름만 바꾼다(id·담당 한 줄·필요 인원·섬기는 분을 지킨다) ② 시트 %d팀을 upsert(시간·하는 일·요일은 시트가 이긴다 — 단 담당자가 쓴 5팀의 하는 일·시간은 지킨다)" % len(rows))
L.append("--          ③ 시트에 없는 팀은 신청이 없는 것만 지운다 ④ 「예시」 표시가 붙은 담당 한 줄(홍길동)을 비운다.")
L.append("-- 되돌리는 법: 없음(옛 값은 운영 백업 JSON 이 PC 에 있다 — 저장소 밖).")
L.append("")
L.append("begin;")
L.append("set local lock_timeout = '5s';")
L.append("")
L.append("-- ① 이름만 바뀌는 줄")
for (c, g, t), (ng, nt) in RENAMES:
    L.append("update public.ministry_catalog set group_name = %s, team = %s where year = %d and committee = %s and group_name = %s and team = %s;"
             % (q(ng), q(nt), YEAR, q(c), q(g), q(t)))
L.append("")
L.append("-- ② 시트 반영")
L.append("insert into public.ministry_catalog")
L.append("  (year, committee, group_name, team, kind, schedule_note, desc_note, capacity_note, option_note, sort_order,")
L.append("   day_sun, day_fri, day_sat, day_week, time_from, time_to, freq_weekly, freq_biweekly, freq_monthly, freq_adhoc)")
L.append("values")
vals = []
for i, r in enumerate(rows):
    vals.append("  (%d, %s, %s, %s, %s, %s, %s, '', %s, %d, %s, false, false, false, null, null, false, false, false, false)" % (
        YEAR, q(r['committee']), q(r['group']), q(r['team']), q(r['kind']), q(r['schedule']), q(r['desc']),
        q(r['option']), i, 'true' if r['sun'] else 'false'))
L.append(",\n".join(vals))
prot = ", ".join("(%s, %s, %s)" % (q(c), q(g), q(t)) for c, g, t in PROTECT)
L.append("on conflict (year, committee, group_name, team) do update set")
L.append("  kind = excluded.kind, option_note = excluded.option_note, sort_order = excluded.sort_order,")
L.append("  -- 담당자가 화면에서 쓴 5팀은 하는 일·시간을 지킨다(시트가 더 짧다)")
L.append("  schedule_note = case when (ministry_catalog.committee, ministry_catalog.group_name, ministry_catalog.team) in (%s) then ministry_catalog.schedule_note else excluded.schedule_note end," % prot)
L.append("  desc_note     = case when (ministry_catalog.committee, ministry_catalog.group_name, ministry_catalog.team) in (%s) then ministry_catalog.desc_note else excluded.desc_note end," % prot)
L.append("  -- 요일·시각·횟수는 시트가 정한다(시트에는 주일만 있다 — 전에 있던 예시 값은 여기서 지워진다)")
L.append("  day_sun = excluded.day_sun, day_fri = false, day_sat = false, day_week = false, time_from = null, time_to = null,")
L.append("  freq_weekly = false, freq_biweekly = false, freq_monthly = false, freq_adhoc = false;")
L.append("")
L.append("-- ③ 시트에 없는 팀 — 신청이 걸린 팀은 둔다")
L.append("delete from public.ministry_catalog c")
L.append(" where c.year = %d" % YEAR)
L.append("   and (c.committee, c.group_name, c.team) not in (" + ", ".join("(%s, %s, %s)" % (q(c), q(g), q(t)) for c, g, t in keys) + ")")
L.append("   and not exists (select 1 from public.ministry_orders o where o.year = c.year and o.team_id = c.id);")
L.append("")
L.append("-- ④ 예시 담당 한 줄(「홍길동 …  · 예시」) 비우기 — 실제로 쓴 담당 한 줄은 그대로")
L.append("update public.ministry_catalog set leader_note = '' where year = %d and leader_note like '%%예시%%';" % YEAR)
L.append("")
L.append("commit;")
L.append("")
L.append("-- 확인")
L.append("--   select count(*) from ministry_catalog where year = %d;   -- %d 이어야 한다(신청이 걸린 옛 팀이 남아 있으면 그만큼 더)" % (YEAR, len(rows)))
L.append("--   select kind, count(*) from ministry_catalog where year = %d group by 1;   -- appoint %d" % (YEAR, sum(1 for r in rows if r['kind'] == 'appoint')))
L.append("--   select count(*) from ministry_catalog where year = %d and day_sun;   -- %d" % (YEAR, sum(1 for r in rows if r['sun'])))

with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write("\n".join(L) + "\n")
print('%d팀 · 임명직 %d · 주일 %d → %s' % (len(rows), sum(1 for r in rows if r['kind'] == 'appoint'), sum(1 for r in rows if r['sun']), OUT))
