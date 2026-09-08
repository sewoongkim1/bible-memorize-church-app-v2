# -*- coding: utf-8 -*-
"""부서 회신 취합 — 채워져 돌아온 확인 양식을 모아 사역 목록 확정본을 만든다.

■ 흐름
    ministry/부서확인/            보낼 파일(빈 양식, 15개)
    ministry/부서확인/회신/       ← 부서가 채워 보낸 파일을 여기에 모은다
        python tools/ministry-merge-replies.py
    ministry/ministry_catalog_2027.json      확정본(초안을 덮지 않는다)
    ministry/부서확인/_취합결과.md            무엇이 어떻게 바뀌었는지 사람이 읽는 표

■ 왜 도구로 하나
  94행 × (이름·시간·하는 일·인원) 을 손으로 옮기면 반드시 어딘가 틀린다.
  틀려도 티가 안 난다는 게 더 문제다 — 성도님 화면에 그대로 나간다.

■ 초안을 덮지 않는 이유
  확정본은 `ministry_catalog_2027.json` 으로 따로 쓴다. 초안
  (`..._2027_draft.json`)은 `tools/ministry-form-gen.py` 가 ROWS 에서 다시
  만들어 내는 파일이라, 여기서 덮으면 다음 실행에 도로 지워진다.
  ⚠️ **종이 신청서·데모 생성기는 확정본이 있으면 그것을, 없으면 초안을 읽는다**
  (각 생성기의 CATALOG 선택 부분). 그래서 이 파일이 생기는 순간 전부 확정본으로
  갈아탄다.

■ 회신 파일에서 읽는 칸
  B 위원회/부서 · D 사역팀명(초안) · E 구분 · F 사역 시간·요일 · G 하는 일
  H 필요 인원 · K 확정 표기명 · L 변경여부 · M 담당자 · N 비고

  - K(확정 표기명)가 적혀 있으면 그 이름으로 바꾼다. 비면 초안 이름 그대로.
  - L 이 「폐지」면 목록에서 뺀다.
  - L 이 「신설」인데 D(초안 이름)가 비어 있으면 새로 더한 줄로 본다(K 가 이름).
  - 회신이 없는 부서는 초안 그대로 두고 「미회신」으로 표시한다.

사용법: python tools/ministry-merge-replies.py
"""
import io, json, os, sys

from openpyxl import load_workbook

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
OUT_DIR = os.path.join(ROOT, "ministry")
REPLY_DIR = os.path.join(OUT_DIR, "부서확인", "회신")
DRAFT_JSON = os.path.join(OUT_DIR, "ministry_catalog_2027_draft.json")
FINAL_JSON = os.path.join(OUT_DIR, "ministry_catalog_2027.json")
REPORT_MD = os.path.join(OUT_DIR, "부서확인", "_취합결과.md")

COL = {"committee": 2, "group": 3, "team": 4, "kind": 5, "sched": 6,
       "desc": 7, "cap": 8, "opt": 9, "final": 11, "change": 12,
       "who": 13, "note": 14}
KIND_BACK = {"신청가능": "apply", "임명직": "appoint"}


def cell(ws, r, key):
    v = ws.cell(row=r, column=COL[key]).value
    return ("" if v is None else str(v)).strip()


def read_replies():
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
            print("   !! 「사역팀 확인」 시트가 없어 건너뜁니다:", fn)
            continue
        ws = wb["사역팀 확인"]
        files.append(fn)
        for r in range(2, ws.max_row + 1):
            committee, team = cell(ws, r, "committee"), cell(ws, r, "team")
            if not committee:
                continue
            row = {k: cell(ws, r, k) for k in COL}
            if not team:  # 초안에 없던 줄 = 새로 더한 사역팀
                if row["final"] or row["change"] == "신설":
                    added.append(row)
                continue
            replies[(committee, team)] = row
    return replies, files, added


def main():
    if not os.path.exists(DRAFT_JSON):
        print("초안 JSON 이 없습니다:", DRAFT_JSON)
        sys.exit(1)
    draft = json.load(io.open(DRAFT_JSON, encoding="utf-8"))
    replies, files, added = read_replies()

    if not files:
        print("회신 파일이 없습니다. 채워진 엑셀을 여기에 넣어 주세요:")
        print("  ", os.path.abspath(REPLY_DIR))
        sys.exit(0)

    answered = set(r["committee"] for r in replies.values())
    final, log = [], {"renamed": [], "dropped": [], "added": [], "filled": 0, "no_sched": []}

    for d in draft:
        key = (d["committee"], d["team"])
        rep = replies.get(key)
        if rep is None:
            final.append(dict(d))          # 회신 없음 — 초안 그대로
            if d["committee"] in answered:  # 회신은 왔는데 이 줄만 사라졌다 = 지운 것
                log["dropped"].append((d["committee"], d["team"], "회신 파일에서 행이 사라짐"))
                final.pop()
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
        row["conflict_note"] = ""   # 부서가 확인해 준 순간 대조 메모는 역할이 끝난다
        final.append(row)

    for a in added:
        row = {"committee": a["committee"], "group": a["group"],
               "team": a["final"] or a["team"], "kind": KIND_BACK.get(a["kind"], "apply"),
               "schedule_note": a["sched"], "desc_note": a["desc"],
               "capacity_note": a["cap"], "option_note": a["opt"], "conflict_note": ""}
        # 같은 위원회 마지막 줄 뒤에 끼워 넣는다(부서별로 모여 있어야 화면이 안 흩어진다)
        pos = max([i for i, f in enumerate(final) if f["committee"] == row["committee"]] or [len(final) - 1])
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
    L.append(f"| 시간을 채워 준 팀 | {log['filled']}개 |")
    L.append(f"| 이름이 바뀐 팀 | {len(log['renamed'])}개 |")
    L.append(f"| 폐지 | {len(log['dropped'])}개 |")
    L.append(f"| 신설 | {len(log['added'])}개 |\n")
    if missing:
        L.append("## ⚠️ 아직 회신이 없는 부서\n")
        L.append("초안 이름·시간 그대로 나간다. 다시 요청할지 정해야 한다.\n")
        for c in missing:
            L.append(f"- {c}")
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
    if log["no_sched"]:
        L.append("## 시간이 비어 있는 신청 대상\n")
        L.append("회신은 왔지만 시간 칸이 비었다. 성도님 화면에 시간이 안 보인다.\n")
        for c, t in log["no_sched"]:
            L.append(f"- {c} · {t}")
        L.append("")
    L.append("## 다음 단계\n")
    L.append("```bash")
    L.append("python tools/ministry-apply-form-gen.py        # 종이 신청서(3단 체크리스트)")
    L.append("python tools/ministry-apply-form-table-gen.py  # 종이 신청서(표 형식)")
    L.append("python tools/ministry-demo-gen.py              # 데모")
    L.append("```")
    L.append("세 생성기는 확정본(`ministry_catalog_2027.json`)이 있으면 그것을 읽는다.\n")
    io.open(REPORT_MD, "w", encoding="utf-8", newline="").write("\n".join(L))

    print("confirmed json:", os.path.relpath(FINAL_JSON, ROOT))
    print("report        :", os.path.relpath(REPORT_MD, ROOT))
    print("replies %d files / %d of %d committees / teams %d -> %d"
          % (len(files), len(answered), len(committees), len(draft), len(final)))
    print("renamed %d | dropped %d | added %d | schedule filled %d"
          % (len(log["renamed"]), len(log["dropped"]), len(log["added"]), log["filled"]))


if __name__ == "__main__":
    main()
