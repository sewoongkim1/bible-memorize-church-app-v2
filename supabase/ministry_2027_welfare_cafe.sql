-- 2027 사역 목록 — 희망의복지재단 › 복지재단 묶음에 「카페운영」을 더한다(친구 2026-11-22 「희망의 복지재단 → 복지재단 → 카페운영 추가」).
-- 자리: 「고척 재미난 지역아동센터」 바로 뒤(사회봉사센터 앞) — 그 뒤 팀들의 차례를 하나씩 민다(상대 차례는 그대로).
-- 내용: 성도님 신청(apply) · 시간 「필요시」 · 하는 일 「카페운영에 관한 제반활동」(옛 교회봉사부 카페운영 것 — 데코팀으로 바뀐 줄에서).
-- 시드 원본(tools/ministry-sheet-sql.py SHEET_ADD → supabase/ministry_catalog_2027_sheet.sql)에도 같은 줄을 넣었다 — 시드 전체를 다시 돌리지 말고 이 파일만.
-- 실행 순서: 개발(ktpwthwqzgcqcrmsafdo) → 운영(xnomlgydifiqiybervtf). 반복해 돌려도 안전하다(이미 있으면 아무것도 안 한다).
-- 되돌리는 법: delete from ministry_catalog where year = 2027 and committee = '희망의복지재단' and group_name = '복지재단' and team = '카페운영'; (신청이 없을 때)

begin;
set local lock_timeout = '5s';

do $$
declare s int;
begin
  if not exists (select 1 from public.ministry_catalog
                  where year = 2027 and committee = '희망의복지재단' and group_name = '복지재단' and team = '카페운영') then
    select sort_order into s from public.ministry_catalog
     where year = 2027 and committee = '희망의복지재단' and group_name = '복지재단' and team = '고척 재미난 지역아동센터';
    if s is null then raise exception '「고척 재미난 지역아동센터」 줄이 없다 — 자리를 정할 수 없다'; end if;
    update public.ministry_catalog set sort_order = sort_order + 1 where year = 2027 and sort_order > s;
    insert into public.ministry_catalog
      (year, committee, group_name, team, kind, schedule_note, desc_note, capacity_note, option_note, sort_order,
       day_sun, day_fri, day_sat, day_week, time_from, time_to, freq_weekly, freq_biweekly, freq_monthly, freq_adhoc)
    values (2027, '희망의복지재단', '복지재단', '카페운영', 'apply', '필요시', '카페운영에 관한 제반활동', '', '', s + 1,
            false, false, false, false, null, null, false, false, false, true);
  end if;
end $$;

commit;

-- 확인
--   select id, group_name, team, kind, sort_order from public.ministry_catalog where year = 2027 and committee = '희망의복지재단' order by sort_order;
