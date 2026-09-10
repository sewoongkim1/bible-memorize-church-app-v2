# -*- coding: utf-8 -*-
"""부서 회신 취합 — 채워져 돌아온 확인 양식을 모아 사역 목록 확정본을 만든다.

■ 흐름
    ministry/부서확인/            보낼 파일(빈 양식, 15개)
    ministry/부서확인/회신/       ← 부서가 채워 보낸 파일을 여기에 모은다
        python tools/ministry-merge-replies.py
    ministry/ministry_catalog_2027.json      확정본(초안을 덮지 않는다)
    ministry/부서확인/_취합결과.md            무엇이 어떻게 바뀌었는지 사람이 읽는 표

■ 왜 도구로 하나
  94행 × (이름·요일·시각·주기·하는 일·인원) 을 손으로 옮기면 반드시 어딘가 틀린다.
  틀려도 티가 안 난다는 게 더 문제다 — 성도님 화면에 그대로 나간다.

■ 초안을 덮지 않는 이유
  확정본은 `ministry_catalog_2027.json` 으로 따로 쓴다. 초안
  (`..._2027_draft.json`)은 `tools/ministry-form-gen.py` 가 ROWS 에서 다시
  만들어 내는 파일이라, 여기서 덮으면 다음 실행에 도로 지워진다.
  ⚠️ **종이 신청서·데모·시드 SQL 생성기는 확정본이 있으면 그것을, 없으면 초안을 읽는다.**
  그래서 이 파일이 생기는 순간 전부 확정본으로 갈아탄다.

■ ⚠️ 칸은 **번호가 아니라 이름으로** 찾는다 (2026-09-10)
  전에는 `COL = {"team": 4, ...}` 처럼 번호를 박아 두었다. 그런데 필터용 여섯 칸을
  더하면서 표가 14칸 → 20칸이 되었고, 번호를 박아 둔 쪽은 **조용히 엉뚱한 칸을 읽는다**
  (오류가 안 나고 값만 틀린다). 이제 머리줄에서 이름을 찾아 번호를 얻는다 —
  부서가 칸을 하나 끼워 넣어도, 우리가 또 늘려도 안 깨진다.
  이름을 못 찾으면 **그 파일을 건너뛰고 무엇이 없는지 말한다** — 틀린 칸을 읽느니 멈춘다.

■ 회신 파일에서 읽는 칸 (이름으로 찾는다)
  위원회/부서 · 중분류 · 사역팀명 · 구분 · 하위 선택 안내
  확정 표기명 · 변경여부
  주일 · 평일 · 토요일 · 시작 시각 · 끝 시각 · 한 사람이 서는 주기   ← 필터가 읽는 여섯
  사역 시간·요일(문장으로) · 하는 일 · 필요 인원 · 확인하신 분 · 비고

  - 확정 표기명이 적혀 있으면 그 이름으로 바꾼다. 비면 초안 이름 그대로.
  - 변경여부가 「폐지」면 목록에서 뺀다.
  - 변경여부가 「신설」인데 사역팀명(초안)이 비어 있으면 새로 더한 줄로 본다.
  - 회신이 없는 부서는 초안 그대로 두고 「미회신」으로 표시한다.

사용법: python tools/ministry-merge-replies.py
"""
import datetime
import io
import json
import os
import re
import sys

from openpyxl import load_workbook

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
OUT_DIR = os.path.join(ROOT, "ministry")
REPLY_DIR = os.path.join(OUT_DIR, "부서확인", "회신")
DRAFT_JSON = os.path.join(OUT_DIR, "ministry_catalog_2027_draft.json")
FINAL_JSON = os.path.join(OUT_DIR, "ministry_catalog_2027.json")
REPORT_MD = os.path.join(OUT_DIR, "부서확인", "_취합결과.md")

# 찾을 칸 — 값은 머리줄에 들어 있을 **조각**이다(전체가 같지 않아도 된다).
WANT = {
    "committee": "위원회/부서",
    "group":     "중분류",
    "team":      "사역팀명",
    "kind":      "구분",
    "opt":       "하위 선택 안내",
    "final":     "확정 표기명",
    "change":    "변경여부",
    "sun":       "주일",
    "week":      "평일",
    "sat":       "토요일",
    "t_from":    "시작 시각",
    "t_to":      "끝 시각",
    "freq":      "한 사람이 서는 주기",
    "sched":     "사역 시간",
    "desc":      "하는 일",
    "cap":       "필요 인원",
    "who":       "확인하신 분",
    "note":      "비고",
}
# 없어도 되는 칸 — 옛 양식으로 회신하신 부서를 통째로 버리지 않는다
OPTIONAL = {"sun", "week", "sat", "t_from", "t_to", "freq", "who", "opt", "group"}

KIND_BACK = {"신청가능": "apply", "임명직": "appoint"}
# ⚠️ DB 의 ministry_catalog_freq_chk 와 같은 목록이어야 한다
FREQS = ["매주", "격주", "매달", "그때그때"]
# ⚠️ 「O」 칸에 「X」나 「-」를 적어 「아니다」를 뜻하는 분이 있다. 그걸 참으로 읽으면
#    모든 팀이 모든 요일에 걸린다 — 필터가 아무것도 거르지 않게 된다.
FALSE_MARKS = {"x", "-", "–", "없음", "false", "아니오", "아님", "n", "무", "해당없음"}


def norm(v):
    """견주기 위해 공백·가운뎃점·괄호 따위를 지운다."""
    return re.sub(r"[\s·・.,\-—()\[\]/]", "", str(v or "")).lower()


def find_header(ws):
    """머리줄을 찾고 {키: 칸번호} 를 만든다. 실패하면 (None, 없는 키 목록)."""
    head_row = None
    for r in range(1, min(ws.max_row, 8) + 1):
        vals = [norm(ws.cell(row=r, column=c).value) for c in range(1, ws.max_column + 1)]
        joined = "".join(vals)
        if norm(WANT["committee"]) in joined and norm(WANT["team"]) in joined:
            head_row = r
            break
    if head_row is None:
        return None, None, ["머리줄(위원회/부서·사역팀명)"]

    titles = [(c, norm(ws.cell(row=head_row, column=c).value))
              for c in range(1, ws.max_column + 1)]
    col, missing = {}, []
    for key, want in WANT.items():
        w = norm(want)
        hit = [c for c, t in titles if t == w] \
            or [c for c, t in titles if t.startswith(w)] \
            or [c for c, t in titles if w in t]
        if hit:
            col[key] = hit[0]
        elif key not in OPTIONAL:
            missing.append(want)
    return head_row, col, missing


def raw(ws, r, col, key):
    if key not in col:
        return None
    return ws.cell(row=r, column=col[key]).value


def text(ws, r, col, key):
    v = raw(ws, r, col, key)
    return ("" if v is None else str(v)).strip()


def parse_ox(v):
    """요일 칸 — 「O」면 참. 비었거나 X·- 면 거짓."""
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    s = str(v).strip()
    if not s:
        return False
    return s.lower() not in FALSE_MARKS


_T_RE = re.compile(
    r"^(?P<ap>오전|오후|새벽|아침|저녁|밤|낮)?\s*"
    r"(?P<h>\d{1,2})\s*(?:[:시]\s*(?P<m>\d{1,2})?\s*분?)?\s*$")


def parse_time(v):
    """'HH:MM' 로 만든다. 못 알아보면 "" 를 돌려준다(원본은 부르는 쪽이 갖고 있다).

    ⚠️ 엑셀이 「10:00」을 시각 값으로 바꿔 두면 datetime.time 이 온다 —
       양식 쪽에서 텍스트 서식으로 막아 두었지만, 옛 파일·손수 만든 파일도 온다.
    """
    if v is None:
        return ""
    if isinstance(v, datetime.datetime):
        return v.strftime("%H:%M")
    if isinstance(v, datetime.time):
        return v.strftime("%H:%M")
    if isinstance(v, datetime.timedelta):          # 24시간을 넘긴 칸
        mins = int(v.total_seconds() // 60)
        return "%02d:%02d" % ((mins // 60) % 24, mins % 60)
    s = str(v).strip()
    if not s:
        return ""
    s = s.replace("：", ":").replace("시간", "시")
    m = _T_RE.match(s)
    if not m:
        return ""
    h = int(m.group("h"))
    mi = int(m.group("m") or 0)
    ap = m.group("ap")
    if ap in ("오후", "저녁", "밤", "낮") and h < 12:
        h += 12
    elif ap in ("오전", "새벽", "아침") and h == 12:
        h = 0
    if not (0 <= h <= 23 and 0 <= mi <= 59):
        return ""
    return "%02d:%02d" % (h, mi)


def read_replies(bad):
    """회신 폴더의 엑셀을 모두 읽어 (위원회, 초안팀명) -> 회신 한 줄 로 만든다."""
    if not os.path.isdir(REPLY_DIR):
        return {}, [], []
    replies, files, added = {}, [], []
    for fn in sorted(os.listdir(REPLY_DIR)):
        if not fn.lower().endswith(".xlsx") or fn.startswith("~$"):
            continue
        path = os.path.join(REPLY_DIR, fn)
        wb = load_workbook(path, data_only=True)
        if "사역팀 확인" not in wb.sheetnames:
            bad.append((fn, "「사역팀 확인」 시트가 없습니다"))
            continue
        ws = wb["사역팀 확인"]
        head_row, col, missing = find_header(ws)
        if missing:
            # ⚠️ 틀린 칸을 읽느니 멈춘다 — 값만 조용히 틀리는 것이 가장 나쁘다
            bad.append((fn, "못 찾은 칸: " + ", ".join(missing)))
            continue
        files.append(fn)
        for r in range(head_row + 1, ws.max_row + 1):
            committee = text(ws, r, col, "committee")
            team = text(ws, r, col, "team")
            if not committee:
                continue
            row = {
                "file": fn,
                "committee": committee, "group": text(ws, r, col, "group"),
                "team": team, "kind": text(ws, r, col, "kind"),
                "opt": text(ws, r, col, "opt"),
                "final": text(ws, r, col, "final"), "change": text(ws, r, col, "change"),
                "sun": parse_ox(raw(ws, r, col, "sun")),
                "week": parse_ox(raw(ws, r, col, "week")),
                "sat": parse_ox(raw(ws, r, col, "sat")),
                "t_from_raw": text(ws, r, col, "t_from"),
                "t_to_raw": text(ws, r, col, "t_to"),
                "t_from": parse_time(raw(ws, r, col, "t_from")),
                "t_to": parse_time(raw(ws, r, col, "t_to")),
                "freq": text(ws, r, col, "freq"),
                "sched": text(ws, r, col, "sched"), "desc": text(ws, r, col, "desc"),
                "cap": text(ws, r, col, "cap"), "who": text(ws, r, col, "who"),
                "note": text(ws, r, col, "note"),
            }
            if not team:  # 초안에 없던 줄 = 새로 더한 사역팀
                if row["final"] or row["change"] == "신설":
                    added.append(row)
                continue
            replies[(committee, team)] = row
    return replies, files, added


def apply_when(row, rep, name, log):
    """② 언제 여섯 칸을 옮긴다. 못 알아본 것은 적어 둔다."""
    touched = False
    for key, field in (("sun", "day_sun"), ("week", "day_week"), ("sat", "day_sat")):
        if rep[key]:
            row[field] = True
            touched = True
    for key, field in (("t_from", "time_from"), ("t_to", "time_to")):
        val, src = rep[key], rep[key + "_raw"]
        if val:
            row[field] = val
            touched = True
        elif src:
            log["bad_time"].append((rep["committee"], name, src))
    if rep["freq"]:
        if rep["freq"] in FREQS:
            row["freq"] = rep["freq"]
            touched = True
        else:
            log["bad_freq"].append((rep["committee"], name, rep["freq"]))
    # 끝이 시작보다 이르면 사람이 봐야 한다(자정을 넘기는 사역일 수도 있다)
    if row.get("time_from") and row.get("time_to") and row["time_to"] < row["time_from"]:
        log["odd_time"].append((rep["committee"], name, row["time_from"], row["time_to"]))
    return touched


def main():
    if not os.path.exists(DRAFT_JSON):
        print("초안 JSON 이 없습니다:", DRAFT_JSON)
        sys.exit(1)
    draft = json.load(io.open(DRAFT_JSON, encoding="utf-8"))
    bad = []
    replies, files, added = read_replies(bad)

    for fn, why in bad:
        print("   !! 건너뜀:", fn, "-", why)
    if not files:
        print("읽을 수 있는 회신 파일이 없습니다. 채워진 엑셀을 여기에 넣어 주세요:")
        print("  ", os.path.abspath(REPLY_DIR))
        sys.exit(0)

    answered = set(r["committee"] for r in replies.values())
    final = []
    log = {"renamed": [], "dropped": [], "added": [], "filled": 0, "when": 0,
           "no_sched": [], "no_when": [], "bad_time": [], "bad_freq": [], "odd_time": []}

    for d in draft:
        key = (d["committee"], d["team"])
        rep = replies.get(key)
        if rep is None:
            if d["committee"] in answered:   # 회신은 왔는데 이 줄만 사라졌다 = 지운 것
                log["dropped"].append((d["committee"], d["team"], "회신 파일에서 행이 사라짐"))
                continue
            final.append(dict(d))            # 회신 없음 — 초안 그대로
            continue
        if rep["change"] == "폐지":
            log["dropped"].append((d["committee"], d["team"], "변경여부: 폐지"))
            continue
        row = dict(d)
        name = rep["final"] or d["team"]
        if name != d["team"]:
            log["renamed"].append((d["committee"], d["team"], name))
            row["team"] = name
        if rep["sched"]:
            row["schedule_note"] = rep["sched"]
            log["filled"] += 1
        elif row["kind"] == "apply" and not row["schedule_note"]:
            log["no_sched"].append((d["committee"], name))
        if rep["desc"]:
            row["desc_note"] = rep["desc"]
        if rep["cap"]:
            row["capacity_note"] = rep["cap"]
        if apply_when(row, rep, name, log):
            log["when"] += 1
        elif row["kind"] == "apply":
            log["no_when"].append((d["committee"], name))
        row["conflict_note"] = ""   # 부서가 확인해 준 순간 대조 메모는 역할이 끝난다
        final.append(row)

    for a in added:
        row = {"committee": a["committee"], "group": a["group"],
               "team": a["final"] or a["team"], "kind": KIND_BACK.get(a["kind"], "apply"),
               "schedule_note": a["sched"], "desc_note": a["desc"],
               "capacity_note": a["cap"], "option_note": a["opt"], "conflict_note": "",
               "day_sun": False, "day_week": False, "day_sat": False,
               "time_from": "", "time_to": "", "freq": ""}
        apply_when(row, a, row["team"], log)
        # 같은 위원회 마지막 줄 뒤에 끼워 넣는다(부서별로 모여 있어야 화면이 안 흩어진다)
        pos = max([i for i, f in enumerate(final) if f["committee"] == row["committee"]]
                  or [len(final) - 1])
        final.insert(pos + 1, row)
        log["added"].append((row["committee"], row["team"]))

    with io.open(FINAL_JSON, "w", encoding="utf-8") as f:
        json.dump(final, f, ensure_ascii=False, indent=2)

    committees = []
    for d in draft:
        if d["committee"] not in committees:
            committees.append(d["committee"])
    missing = [c for c in committees if c not in answered]

    L = []
    L.append("# 부서 회신 취합 결과\n")
    L.append("> 이 파일은 `python tools/ministry-merge-replies.py` 가 만든다. 손으로 고치지 말 것.\n")
    L.append("## 한눈에\n")
    L.append("| 항목 | 값 |")
    L.append("|---|---|")
    L.append(f"| 회신 파일 | {len(files)}개 |")
    L.append(f"| 회신한 부서 | {len(answered)} / {len(committees)} |")
    L.append(f"| 확정 사역팀 | {len(final)}개 (초안 {len(draft)}개) |")
    L.append(f"| 「② 언제」를 채워 준 팀 | {log['when']}개 |")
    L.append(f"| 시간 안내 문장을 채워 준 팀 | {log['filled']}개 |")
    L.append(f"| 이름이 바뀐 팀 | {len(log['renamed'])}개 |")
    L.append(f"| 폐지 | {len(log['dropped'])}개 |")
    L.append(f"| 신설 | {len(log['added'])}개 |\n")
    if bad:
        L.append("## ⚠️ 읽지 못한 회신 파일\n")
        L.append("칸을 못 찾아 통째로 건너뛰었다. **틀린 칸을 읽느니 멈춘다** — 양식을 확인할 것.\n")
        L.append("| 파일 | 까닭 |")
        L.append("|---|---|")
        for fn, why in bad:
            L.append(f"| {fn} | {why} |")
        L.append("")
    if missing:
        L.append("## ⚠️ 아직 회신이 없는 부서\n")
        L.append("초안 이름 그대로 나가고, 필터에서는 「정해진 날 없음 · 때마다 다름」으로 보인다.\n")
        for c in missing:
            L.append(f"- {c}")
        L.append("")
    if log["bad_time"]:
        L.append("## ⚠️ 못 알아본 시각 표기\n")
        L.append("적혀는 있는데 읽지 못했다 — **비운 것과 같아진다.** 손으로 확인할 것.\n")
        L.append("| 부서 | 팀 | 적힌 값 |")
        L.append("|---|---|---|")
        for c, t, v in log["bad_time"]:
            L.append(f"| {c} | {t} | `{v}` |")
        L.append("")
    if log["bad_freq"]:
        L.append("## ⚠️ 목록에 없는 주기 값\n")
        L.append(f"쓸 수 있는 값: {' / '.join(FREQS)}\n")
        L.append("| 부서 | 팀 | 적힌 값 |")
        L.append("|---|---|---|")
        for c, t, v in log["bad_freq"]:
            L.append(f"| {c} | {t} | `{v}` |")
        L.append("")
    if log["odd_time"]:
        L.append("## ⚠️ 끝나는 시각이 시작보다 이른 팀\n")
        L.append("자정을 넘기는 사역일 수도 있다 — 사람이 한 번 볼 것.\n")
        for c, t, a, b in log["odd_time"]:
            L.append(f"- {c} · {t} — {a} ~ {b}")
        L.append("")
    if log["renamed"]:
        L.append("## 이름이 바뀐 팀\n")
        L.append("| 부서 | 초안 | 확정 |")
        L.append("|---|---|---|")
        for c, a, b in log["renamed"]:
            L.append(f"| {c} | {a} | **{b}** |")
        L.append("")
    if log["dropped"]:
        L.append("## 목록에서 빠진 팀\n")
        L.append("| 부서 | 팀 | 사유 |")
        L.append("|---|---|---|")
        for c, t, why in log["dropped"]:
            L.append(f"| {c} | {t} | {why} |")
        L.append("")
    if log["added"]:
        L.append("## 새로 더해진 팀\n")
        for c, t in log["added"]:
            L.append(f"- {c} · **{t}**")
        L.append("")
    if log["no_when"]:
        L.append("## 필터 칸이 비어 있는 신청 대상\n")
        L.append("회신은 왔지만 요일·시각·주기를 하나도 안 적었다. **목록에서 사라지지는 않고** "
                 "「정해진 날 없음 · 때마다 다름」으로 보인다 — 다만 조건으로 찾는 성도님께는 안 걸린다.\n")
        for c, t in log["no_when"]:
            L.append(f"- {c} · {t}")
        L.append("")
    if log["no_sched"]:
        L.append("## 시간 안내 문장이 비어 있는 신청 대상\n")
        L.append("팀 단추 아래 한 줄이 비어 성도님이 이름만 보고 고르게 된다.\n")
        for c, t in log["no_sched"]:
            L.append(f"- {c} · {t}")
        L.append("")
    L.append("## 다음 단계\n")
    L.append("```bash")
    L.append("python tools/ministry-seed-sql.py             # DB 시드 SQL (개발 먼저!)")
    L.append("python tools/ministry-apply-form-gen.py        # 종이 신청서(3단 체크리스트)")
    L.append("python tools/ministry-apply-form-table-gen.py  # 종이 신청서(표 형식)")
    L.append("python tools/ministry-demo-gen.py              # 데모")
    L.append("```")
    L.append("네 생성기는 확정본(`ministry_catalog_2027.json`)이 있으면 그것을 읽는다.\n")
    io.open(REPORT_MD, "w", encoding="utf-8", newline="").write("\n".join(L))

    print("confirmed json:", os.path.relpath(FINAL_JSON, ROOT))
    print("report        :", os.path.relpath(REPORT_MD, ROOT))
    print("replies %d files / %d of %d committees / teams %d -> %d"
          % (len(files), len(answered), len(committees), len(draft), len(final)))
    print("renamed %d | dropped %d | added %d | when %d | sched %d"
          % (len(log["renamed"]), len(log["dropped"]), len(log["added"]),
             log["when"], log["filled"]))
    if log["bad_time"] or log["bad_freq"] or bad:
        print("!! 확인 필요: 못 읽은 파일 %d · 못 알아본 시각 %d · 목록 밖 주기 %d"
              % (len(bad), len(log["bad_time"]), len(log["bad_freq"])))


if __name__ == "__main__":
    main()
