# -*- coding: utf-8 -*-
"""
시편 말씀 액자 — 구절 길이 측정 · DB 시드 생성기

담당자가 채워 주신 psalm/시편말씀액자_구절입력_180.xlsx 를 읽어
① 액자 다섯 줄에 들어가는지 재고 ② 흔한 실수를 잡아내고 ③ DB 시드 SQL을 만든다.

⚠️ **잣대는 3단계(전체 빈칸) 기준이다.**
   빈칸(.word-input)은 폭이 `글자수+1em`이라 낱말마다 1em씩 넓어진다 —
   0단계(그냥 읽는 화면) 기준으로 다섯 줄을 맞추면 3단계에서 6~7줄이 되어 액자를 뚫는다.
   그래서 재는 값이 **글자수(공백 제외) + 낱말수** 이고, 액자 안쪽 폭 322px·5줄·
   줄바꿈 낭비 15%를 감안한 가용 길이 1,370px 에서
       필요한 글씨(px) = 1370 ÷ (글자수 + 낱말수)
   글씨를 20~34px 사이로 가두므로 상한 76, 하한 30이 나온다.
   (설계: docs/superpowers/specs/2026-09-10-psalm-frame-design.html 06장)

⚠️ **성경 사이트에서 복사하면 절 번호가 딸려 온다.** "1 복 있는 사람은…" 처럼
   맨 앞에 숫자가 붙어 오는 것이 가장 흔한 사고인데, 그대로 두면 앱에서 그 숫자가
   낱말 하나가 되어 **빈칸으로 바뀌고 성도님이 「1」을 타이핑해야 한다.**
   이 도구가 잡아 준다(--fix 로 떼어 낼 수도 있다).

⚠️ **JSON 폴백을 만들지 않는다.** blessings.json 과 달리, 시편 액자는
   「안 열린 구절은 서버가 아예 안 내려보낸다」가 잠금의 전부다 —
   180편이 통째로 든 정적 파일을 배포하면 그 잠금이 무의미해진다.

사용법
  python tools/psalm-fit.py                    측정 보고서만
  python tools/psalm-fit.py --sql              supabase/psalm_frames.sql 까지 생성
  python tools/psalm-fit.py --fix              본문 앞 절 번호·겹공백을 다듬어 엑셀에 되쓴다
  python tools/psalm-fit.py --xlsx <경로>      다른 파일로
"""
import argparse
import datetime as dt
import os
import re
import sys

from openpyxl import load_workbook

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    # raise SystemExit(...) 메시지도 여기로 나간다 — no 재배정 경고처럼 꼭 읽혀야
    # 하는 문구가 콘솔 기본 인코딩(cp949 등)에서 깨지지 않게 stdout과 맞춘다.
    sys.stderr.reconfigure(encoding="utf-8")

ROOT = os.path.join(os.path.dirname(__file__), "..")
DEF_XLSX = os.path.join(ROOT, "psalm", "시편말씀액자_구절입력_180.xlsx")
OUT_SQL = os.path.join(ROOT, "supabase", "psalm_frames.sql")

SHEET = "구절 입력"
FIRST_ROW = 4
NO_BASE = 1000                      # 시편 구절 번호 = 1000 + day_no (주간 구절과 겹치지 않게)
START_DATE = dt.date(2026, 9, 21)
TOTAL_DAYS = 180
FRAME_COUNT = 12

USABLE_PX = 1370.0                  # 액자 안쪽 322px × 5줄 × 낭비 15% 감안
FS_MIN, FS_MAX = 20.0, 34.0         # 글씨를 가두는 범위(어르신이 읽으실 크기 ~ 액자를 안 뚫는 크기)
# 상한 76 = 1370 ÷ 18. 표시 글씨는 20px 아래로 안 내리지만, 「바닥 18px 까지는
# 봐준다」가 목록을 짤 때의 절대선이다(설계 06장과 같은 값). 그 사이 20~18px 구간은
# 아슬한 구절이 몇 편 섞여도 액자가 안 깨지도록 둔 여유다.
MAX_W = 76
MIN_W = 30                          # 이보다 짧으면 다섯 줄을 못 채워 액자가 허전하다

WEEKDAY = "월화수목금토일"

# "시편 1편 1절" / "시편 1편 1-2절" / "시 1:1" 모두 받는다
RE_FULL = re.compile(r"^\s*시(?:편)?\s*(\d+)\s*편\s*(\d+)(?:\s*[-~–]\s*(\d+))?\s*절\s*$")
RE_COLON = re.compile(r"^\s*시(?:편)?\s*(\d+)\s*[:：]\s*(\d+)(?:\s*[-~–]\s*(\d+))?\s*$")
RE_LEAD_NO = re.compile(r"^\s*\d+\s+")          # 본문 앞에 딸려 온 절 번호
RE_LEAD_NO_TIGHT = re.compile(r"^\s*\d+(?=[가-힣])")  # "1복 있는" 처럼 붙어 온 것


def width_of(text):
    """3단계에서 차지하는 가로 길이(em) = 글자수(공백 제외) + 낱말수."""
    t = " ".join(text.split())
    if not t:
        return 0
    return len(t.replace(" ", "")) + len(t.split())


def font_for(w):
    """그 폭을 다섯 줄에 담으려면 몇 px 이어야 하나(20~34로 가둔다)."""
    if w <= 0:
        return 0.0
    return max(FS_MIN, min(FS_MAX, USABLE_PX / w))


def parse_ref(s):
    """출처 문자열 → (편, 시작절, 끝절 or None). 못 읽으면 None."""
    for rx in (RE_FULL, RE_COLON):
        m = rx.match(s or "")
        if m:
            ch, v1, v2 = int(m.group(1)), int(m.group(2)), m.group(3)
            return ch, v1, (int(v2) if v2 else None)
    return None


def ref_short(ch, v1, v2):
    return f"시 {ch}:{v1}" + (f"-{v2}" if v2 else "")


def ref_full(ch, v1, v2):
    return f"시편 {ch}편 {v1}" + (f"-{v2}" if v2 else "") + "절"


def clean_text(s):
    """복사해 붙일 때 따라오는 것들을 다듬는다. 반환: (다듬은 글, [무엇을 고쳤나])"""
    fixes = []
    t = str(s or "")
    if t != t.strip():
        fixes.append("앞뒤 공백")
    t = t.strip()
    if "\n" in t or "\t" in t or " " in t:
        fixes.append("줄바꿈·탭·특수공백")
        t = t.replace(" ", " ")
        t = re.sub(r"[\n\t\r]+", " ", t)
    if RE_LEAD_NO.match(t):
        fixes.append("앞의 절 번호")
        t = RE_LEAD_NO.sub("", t)
    elif RE_LEAD_NO_TIGHT.match(t):
        fixes.append("앞의 절 번호(붙어 있음)")
        t = RE_LEAD_NO_TIGHT.sub("", t)
    if re.search(r"\s{2,}", t):
        fixes.append("겹공백")
        t = re.sub(r"\s{2,}", " ", t)
    return t, fixes


def read_rows(path):
    wb = load_workbook(path)
    if SHEET not in wb.sheetnames:
        raise SystemExit(f"「{SHEET}」 시트가 없습니다: {path}")
    ws = wb[SHEET]
    rows = []
    for n in range(1, TOTAL_DAYS + 1):
        r = FIRST_ROW + n - 1
        rows.append({
            "day": n, "row": r,
            "ref": str(ws.cell(r, 4).value or "").strip(),
            "text": str(ws.cell(r, 5).value or ""),
            "frame": ws.cell(r, 8).value,
            "memo": str(ws.cell(r, 9).value or "").strip(),
        })
    return wb, ws, rows


def sql_escape(s):
    return str(s).replace("'", "''")


# 이미 생성된 SQL에서 (no → ref_short) 짝을 읽는다. ③ values 줄의 앞머리
# "  (1001, 'psalm', 1, 1, '시 1:1', ..." 꼴만 보면 되므로 정규식으로 충분하다.
RE_NO_REF = re.compile(
    r"\(\s*(\d+)\s*,\s*'psalm'\s*,\s*\d+\s*,\s*\d+\s*,\s*'((?:[^'\\]|'')*)'"
)


def read_existing_no_ref(path):
    """이미 만들어진 supabase/psalm_frames.sql에서 (no, ref_short)을 읽는다.
    파일이 없으면(첫 실행) 빈 dict — 그때는 견줄 대상이 없으니 통과."""
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        content = f.read()
    pairs = {}
    for m in RE_NO_REF.finditer(content):
        no = int(m.group(1))
        pairs[no] = m.group(2).replace("''", "'")
    return pairs


def build_sql(filled):
    d0 = START_DATE
    lines = [
        "-- 시편 말씀 액자 — 표 확장 + 구절 시드",
        f"-- tools/psalm-fit.py 가 만든 파일이다. 손으로 고치지 말고 엑셀을 고쳐 다시 돌린다.",
        f"-- 만든 날 {dt.date.today():%Y-%m-%d} · 구절 {len(filled)}편 · "
        f"1일차 {d0:%Y-%m-%d}({WEEKDAY[d0.weekday()]})",
        "--",
        "-- ⚠️ 개발 DB(ktpwthwqzgcqcrmsafdo)에서 먼저 돌린 뒤 운영(xnomlgydifiqiybervtf).",
        "-- ⚠️ 순서(함수 vs SQL): **이 기능은 함수(Edge Function)가 먼저, SQL이 나중이다.**",
        "--    getVerses 에 track 필터가 없는 옛 함수 위에서 이 SQL이 먼저 돌면, ③이 심는",
        "--    is_active=true 시편 구절을 옛 함수가 track 구분 없이 통째로 돌려주어 성도님",
        "--    말씀 목록이 시편으로 깨진다. 그래서 ③은 반드시 is_active=false로 심고,",
        "--    ⑤(진짜 공개)는 새 함수 배포를 확인한 뒤에만 손으로 주석을 풀어 따로 돌린다.",
        "--    (참고: 새 표에 새 액션만 얹는 기능은 반대다 — 옛 함수는 그 표·액션을 아예",
        "--    모르니 SQL이 먼저 돌아도 무해하다.)",
        "-- ⚠️ 번호(no) 정책: **한 번 열린 no는 절대 다른 구절에 재배정하지 않는다.**",
        "--    no는 progress·challenge_log의 키라, 재배정하면 이미 마친 분의 기록이",
        "--    엉뚱한 구절에 붙는다(되돌릴 수 없다). 추가는 day_no 뒤쪽에만.",
        "--    verses에서 delete 금지 — progress.verse_no·challenge_log.verse_no가",
        "--    on delete cascade라 성도님 기록이 함께 지워진다.",
        "-- ⚠️ 여러 번 돌려도 안전하다(on conflict do update).",
        "",
        "-- ① 표 확장 --------------------------------------------------------",
        "alter table public.verses",
        "  add column if not exists track     text not null default 'weekly',  -- 'weekly' | 'psalm'",
        "  add column if not exists day_no    int,        -- 1~180 · 열리는 순서",
        "  add column if not exists frame_art smallint;   -- 1~12 · 액자 그림(구절마다 고정)",
        "",
        "create index if not exists idx_verses_track on public.verses(track, day_no);",
        "",
        "-- 기존 35구절이 'weekly' 인지 확인(default 가 들어갔으므로 이미 그렇다)",
        "update public.verses set track = 'weekly' where track is null;",
        "",
        "-- ② 시작일 ----------------------------------------------------------",
        "-- ⚠️ app_config.value 는 jsonb 다. ministry 설정과 같이 키 하나에 객체를 담는다.",
        "insert into public.app_config (key, value)",
        f"""  values ('psalm', '{{"start":"{d0:%Y-%m-%d}","totalDays":{TOTAL_DAYS}}}'::jsonb)""",
        "  on conflict (key) do update set value = excluded.value, updated_at = now();",
        "",
        "-- ③ 구절 --------------------------------------------------------------",
        "insert into public.verses (no, track, day_no, frame_art, ref, ref_short, ref_full, text, week, is_active)",
        "values",
    ]
    vals = []
    for r in filled:
        vals.append(
            f"  ({r['no']}, 'psalm', {r['day']}, {r['frame']}, "
            f"'{sql_escape(r['rs'])}', '{sql_escape(r['rs'])}', '{sql_escape(r['rf'])}', "
            f"'{sql_escape(r['text'])}', null, false)"
        )
    lines.append(",\n".join(vals))
    lines += [
        "on conflict (no) do update set",
        "  track = excluded.track, day_no = excluded.day_no, frame_art = excluded.frame_art,",
        "  ref = excluded.ref, ref_short = excluded.ref_short, ref_full = excluded.ref_full,",
        "  text = excluded.text, is_active = excluded.is_active;",
        "",
        "-- ④ 확인 ------------------------------------------------------------",
        "-- 편수·번호대·오늘 열린 수가 맞는지 본다",
        "select track, count(*) as 편수, min(no) as 첫번호, max(no) as 끝번호,",
        "       min(day_no) as 첫날, max(day_no) as 끝날",
        "  from public.verses group by track order by track;",
        "",
        "-- 오늘 몇 편이 열려 있어야 하는가(서버가 계산하는 것과 같은 식)",
        f"select greatest(0, least({TOTAL_DAYS},",
        f"       ((now() at time zone 'Asia/Seoul')::date - date '{d0:%Y-%m-%d}') + 1)) as 오늘_열린_편수;",
        "",
        "-- ⑤ ⚠️ 아래는 **새 Edge Function 배포를 확인한 뒤에만** 돌린다.",
        "--    확인: getVerses(track 없음)가 주간 구절만 돌려주는지 → bash tests/psalm-smoke.sh",
        "--    순서를 어기면 게이트와 무관하게 성도님 말씀 목록에 시편이 섞인다.",
        "-- update public.verses set is_active = true where track = 'psalm';",
        "",
    ]
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description="시편 말씀 액자 구절 측정·시드 생성")
    ap.add_argument("--xlsx", default=DEF_XLSX)
    ap.add_argument("--sql", action="store_true", help="supabase/psalm_frames.sql 생성")
    ap.add_argument("--fix", action="store_true", help="본문 앞 절 번호·겹공백을 다듬어 엑셀에 되쓴다")
    ap.add_argument("--force", action="store_true",
                     help="기존 no가 다른 구절로 바뀌어도 강행한다(무엇이 바뀌는지 먼저 확인할 것)")
    args = ap.parse_args()

    if not os.path.exists(args.xlsx):
        raise SystemExit(f"파일이 없습니다: {args.xlsx}\n먼저 python tools/psalm-form-gen.py 로 양식을 만드세요.")

    wb, ws, rows = read_rows(args.xlsx)

    filled, empty = [], []
    too_long, too_short, bad_ref, dirty, dup = [], [], [], [], []
    seen = {}
    fixed_count = 0

    for r in rows:
        if not r["text"].strip() and not r["ref"]:
            empty.append(r); continue

        text, fixes = clean_text(r["text"])
        if fixes:
            dirty.append((r, fixes))
            if args.fix:
                ws.cell(r["row"], 5).value = text
                fixed_count += 1

        parsed = parse_ref(r["ref"])
        if not parsed:
            bad_ref.append(r); continue
        ch, v1, v2 = parsed
        rs, rf = ref_short(ch, v1, v2), ref_full(ch, v1, v2)
        if rs in seen:
            dup.append((r, seen[rs]))
        else:
            seen[rs] = r["day"]

        w = width_of(text)
        if not text:
            empty.append(r); continue
        if w > MAX_W:
            too_long.append((r, w))
        elif w < MIN_W:
            too_short.append((r, w))

        frame = r["frame"]
        try:
            frame = int(frame)
            if not (1 <= frame <= FRAME_COUNT):
                raise ValueError
        except (TypeError, ValueError):
            frame = ((r["day"] - 1) % FRAME_COUNT) + 1   # 비어 있으면 고르게 돌린다

        filled.append({**r, "text": text, "no": NO_BASE + r["day"],
                       "rs": rs, "rf": rf, "w": w, "fs": font_for(w), "frame": frame})

    # ---------- 보고 ----------
    bar = "─" * 62
    print(bar)
    print(f" 시편 말씀 액자 — 구절 측정   {os.path.basename(args.xlsx)}")
    print(bar)
    print(f" 채운 구절   {len(filled):3d} / {TOTAL_DAYS}편"
          f"      빈 줄 {len(empty)}편")
    if filled:
        ws_ = [r["w"] for r in filled]
        print(f" 폭(글자+낱말)  가장 짧게 {min(ws_)} · 평균 {sum(ws_)/len(ws_):.1f} · 가장 길게 {max(ws_)}"
              f"   (상한 {MAX_W})")
        print(f" 글씨 크기      {min(r['fs'] for r in filled):.0f}~{max(r['fs'] for r in filled):.0f}px")

    def show(title, items, fmt, limit=20):
        if not items:
            return
        print()
        print(f" {title}  ({len(items)}편)")
        for x in items[:limit]:
            print("   " + fmt(x))
        if len(items) > limit:
            print(f"   … 그 밖에 {len(items)-limit}편")

    show("❌ 너무 김 — 다섯 줄을 넘습니다. 바꾸거나 빼 주세요", too_long,
         lambda t: f"{t[0]['day']:3d}일차  {t[0]['ref']:14s} 폭 {t[1]:3d} "
                   f"(상한 {MAX_W}, {t[1]-MAX_W} 넘음)  {t[0]['text'][:26]}…")
    show("⚠️ 짧음 — 써도 되지만 액자가 허전합니다", too_short,
         lambda t: f"{t[0]['day']:3d}일차  {t[0]['ref']:14s} 폭 {t[1]:3d}  {t[0]['text'][:30]}")
    show("❌ 출처를 못 읽었습니다 — 「시편 1편 1절」 꼴로 적어 주세요", bad_ref,
         lambda r: f"{r['day']:3d}일차  「{r['ref']}」")
    show("❌ 같은 구절이 두 번 들어갔습니다", dup,
         lambda t: f"{t[0]['day']:3d}일차  {t[0]['ref']}  ← {t[1]}일차와 같음")
    show("⚠️ 본문에 군더더기가 붙어 있습니다" + ("  → --fix 로 다듬었습니다" if args.fix else "  → --fix 로 다듬을 수 있습니다"),
         dirty, lambda t: f"{t[0]['day']:3d}일차  {t[0]['ref']:14s} {', '.join(t[1])}"
                          f"   「{str(t[0]['text'])[:24]}…」")

    print()
    blockers = len(too_long) + len(bad_ref) + len(dup)
    if not filled:
        print(" 아직 채워진 구절이 없습니다. 엑셀의 D·E열을 채워 주세요.")
    elif blockers:
        print(f" 고칠 곳 {blockers}편이 남았습니다. 고친 뒤 다시 돌려 주세요.")
    else:
        print(f" ✅ 막는 문제 없음 — {len(filled)}편으로 시드를 만들 수 있습니다."
              f"{'  (아직 ' + str(len(empty)) + '편이 비어 있지만 앞에서부터 쓰이므로 괜찮습니다)' if empty else ''}")
    print(bar)

    if args.fix and fixed_count:
        wb.save(args.xlsx)
        print(f" 엑셀에 되썼습니다 — {fixed_count}편 다듬음: {os.path.normpath(args.xlsx)}")

    if args.sql:
        if blockers:
            raise SystemExit(" 고칠 곳이 남아 시드를 만들지 않았습니다.")
        if not filled:
            raise SystemExit(" 채워진 구절이 없어 시드를 만들지 않았습니다.")
        filled.sort(key=lambda r: r["day"])

        # ⚠️ no 재배정 방어 — 이미 만든 psalm_frames.sql과 견줘 같은 no가
        # 다른 구절을 가리키게 되면 성도님 기록이 엉뚱한 구절에 붙는다(되돌릴 수 없다).
        existing = read_existing_no_ref(OUT_SQL)
        changed = [
            (r["no"], existing[r["no"]], r["rs"])
            for r in filled
            if r["no"] in existing and existing[r["no"]] != r["rs"]
        ]
        if changed:
            print(bar)
            print(" ⚠️ 이미 배정된 번호(no)가 다른 구절을 가리키게 됩니다"
                  + ("  → --force 라 강행합니다" if args.force else ""))
            for no, old_ref, new_ref in changed:
                print(f"   no={no}   {old_ref}  →  {new_ref}")
            print(bar)
            if not args.force:
                raise SystemExit(
                    " no 재배정 감지 — 시드를 만들지 않았습니다.\n"
                    " progress·challenge_log가 이 no로 이미 기록됐다면 성도님 기록이 엉뚱한\n"
                    " 구절에 붙습니다(되돌릴 수 없음). 엑셀의 순서를 되돌리거나, 정말 의도한\n"
                    " 것이면 --force 로 다시 돌리세요(위 목록이 무엇이 바뀌는지 보여줍니다)."
                )

        os.makedirs(os.path.dirname(OUT_SQL), exist_ok=True)
        with open(OUT_SQL, "w", encoding="utf-8", newline="\n") as f:
            f.write(build_sql(filled))
        print(f" 시드를 만들었습니다: {os.path.normpath(OUT_SQL)}  ({len(filled)}편)")
        print(" ⚠️ 개발 DB에서 먼저 돌린 뒤 운영입니다.")
        print(" ⚠️ ③은 is_active=false로 심었습니다 — ⑤(활성화)는 새 함수 배포를 확인한 뒤 손으로.")


if __name__ == "__main__":
    main()
