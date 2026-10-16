# -*- coding: utf-8 -*-
"""주제별 성경암송(네비게이토 73구절) — 쉬운 풀이 · 기억법 · NIV 초안 → 검토용 엑셀(2026-10-16 친구 「그림은 빼고 나머지 진행」).

  python 자료/navi/make-help-drafts.py            # 없는 구절만 만든다(중단돼도 이어서) → 엑셀을 다시 쓴다
  python 자료/navi/make-help-drafts.py --excel    # AI 를 부르지 않고 모아 둔 초안으로 엑셀만 다시
  python 자료/navi/make-help-drafts.py --sql      # 모아 둔 초안 → 넣을 SQL(자료/navi/navi_help_data.sql · .gitignore — NIV 본문이 들어 있다)

■ 근거 — 주간 말씀 도우미(말씀 아카이브 scripts/4b-versehelp.mjs)와 같은 원칙
  · 그 구절이 우리 교회 설교 본문에 들어 있으면(말씀 아카이브 sermons.json 의 scripture) 그 설교의 요약 · 핵심 · 맺음말을 근거로 —
    「설교의 맥락 안에서만 · 설교에 없는 해석이나 교리 주장을 새로 만들지 말 것」(73구절 중 10구절 남짓).
  · 없으면 **구절 본문만** — 낱말 뜻과 문장 흐름까지. 교리적 해석 · 적용 설교를 새로 만들지 않는다.
  · 네비게이토 해설 자료는 쓰지 않는다(사용 허락을 받지 않았다 — docs/notes/navigators.md).
■ NIV — 초안일 뿐이다. 주간 영어 모드와 같이 **사람이 실제 NIV 성경과 한 구절씩 대조 · 검수한 뒤에만** 넣는다(docs/notes/english-niv.md).
  표기는 주간 refEn 꼴(「Rom 14:8」 · 「1 Tim 3:15」).
■ 결과는 저장소 밖으로 안 나간다 — 초안 JSON · 검토 엑셀은 .gitignore(NIV 본문을 공개 저장소에 올리지 않는다). 이 코드만 올린다.
■ 모델 claude-opus-5-5(effort medium) · 거절되면 서버가 claude-opus-4-8 로 다시(fallbacks). 73구절 한 번 ≈ 5천 원 이하.
   키는 환경변수 ANTHROPIC_API_KEY, 없으면 말씀 아카이브 저장소의 .env 에서 읽는다(값은 찍지 않는다)."""
import json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
DRAFTS = os.path.join(HERE, "주제별_도우미_초안.json")
XLSX = os.path.join(HERE, "주제별_도우미_NIV_검토.xlsx")
DATA_SQL = os.path.join(HERE, "navi_help_data.sql")
SERMONS = r"C:/Projects/gocheok-sermons/src/data/sermons.json"
API = "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api"
ANON = "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-"   # 운영 공개 키(앱 코드에 있는 것과 같다 · 읽기만)
MODEL = "claude-opus-5-5"
CHAPTER = {"guide": "그리스도인의 생활 지침", "A": "새로운 삶", "B": "그리스도를 전파함", "C": "하나님을 의뢰함",
           "D": "그리스도 제자의 자격", "E": "그리스도를 닮아 감"}


def api_key():
    k = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if k:
        return k
    env = r"C:/Projects/gocheok-sermons/.env"
    for line in open(env, encoding="utf-8"):
        if line.startswith("ANTHROPIC_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("ANTHROPIC_API_KEY 를 찾지 못했다")


def navi_verses():
    req = urllib.request.Request(API, data=json.dumps({"action": "getVerses", "track": "navi"}).encode(),
                                 headers={"Content-Type": "application/json", "apikey": ANON, "Authorization": "Bearer " + ANON})
    d = json.load(urllib.request.urlopen(req, timeout=30))
    if not (d.get("ok") and d.get("navi")):
        raise SystemExit("주제별 구절을 받지 못했다(navi 표식 없음)")
    return d["verses"]


def parse_full(ref):
    # 「고린도후서 5장 17절」 · 「요한복음 15장 7-8절」 · 「시편 119편 9, 11절」
    m = re.match(r"\s*(.+?)\s*(\d+)[장편]\s*([\d,\s~-]+)절", ref or "")
    if not m:
        return None
    nums = []
    for part in m.group(3).split(","):
        a = re.findall(r"\d+", part)
        if len(a) == 2:
            nums += list(range(int(a[0]), int(a[1]) + 1))
        elif a:
            nums.append(int(a[0]))
    return m.group(1), int(m.group(2)), nums


def parse_sermon(sc):
    out = []
    for part in re.split(r"[,;]", re.sub(r"\(.*?\)", "", sc or "")):
        m = re.match(r"\s*([가-힣]+(?:\s?[가-힣]+)?)\s*(\d+):(\d+)(?:\s*[-~]\s*(?:(\d+):)?(\d+))?", part.strip())
        if not m:
            continue
        a = int(m.group(3))
        b = int(m.group(5)) if m.group(5) and not m.group(4) else (999 if m.group(4) else a)
        out.append((m.group(1).strip(), int(m.group(2)), a, b))
    return out


def sermon_for(v, sermons):
    r = parse_full(v.get("refFull"))
    if not r:
        return None
    book, ch, nums = r
    found = [s for s in sermons for (bk, c, a, b) in parse_sermon(s.get("scripture"))
             if bk == book and c == ch and all(a <= n <= b for n in nums)]
    return max(found, key=lambda s: s.get("date") or "") if found else None   # 가장 최근 설교


SYSTEM = """당신은 고척교회 성경암송 앱의 도우미 글을 쓰는 편집자입니다.
교인(초등학생부터 어르신까지)이 「주제별 성경암송」 구절을 **이해하고 외우도록** 돕는 짧은 글 두 개를 한국어 존댓말(~해요)로 쓰고,
이 구절의 NIV 영어 본문 초안을 함께 적습니다.

- easyExplain (쉬운 풀이): 이 구절이 무슨 뜻인지 **아주 쉬운 말**로 3~4문장(150~220자).
  어려운 신학용어 · 한자어를 쓰지 말고 일상의 말로 풀어 주세요. 구절 안의 핵심 단어 한둘을
  "여기서 '○○'은 …라는 뜻이에요" 식으로 짚어 주면 좋습니다.
  [설교가 함께 주어지면] 반드시 **그 설교의 맥락 안에서** 풀이하고, 설교에 없는 해석이나 교리 주장을 새로 만들지 마세요.
  [설교가 없으면] **구절 본문만** 풀이하세요 — 낱말 뜻과 문장의 흐름까지만. 특정 교리 해석, 적용 권면, 다른 구절 인용을 보태지 마세요.

- memoryTip (암송 기억법): 이 구절을 **외우는 요령** 2~3문장(100~160자).
  해석이 아니라 암기법입니다. 의미 덩어리로 끊어 읽기, 반복 · 대구 구조, 첫 글자 따기, 장면 연상 중 이 구절에 **실제로 맞는 것**만 쓰세요.
  구절에 없는 단어를 지어내지 말고, 실제 본문(개역개정) 표현을 그대로 인용해 설명하세요.

- nivText: 이 구절(한글 본문과 **같은 절 범위**)의 NIV(2011판) 영어 본문 그대로. 다른 번역(KJV · ESV · NIV1984 등)을 섞지 마세요.
  절이 떨어져 있으면(예: 9, 11절) 두 절을 순서대로 이어 쓰세요. 기억이 확실하지 않으면 nivConfidence 를 "low" 로.
- nivRef: 짧은 영어 표기 — 예 "Rom 14:8", "1 Tim 3:15", "2 Cor 5:17", "John 15:7-8", "Ps 119:9, 11".
- note: 검토하는 사람이 알아야 할 것(확신이 낮은 까닭 등) 한 줄. 없으면 빈 문자열.
- 이모지는 넣지 않습니다."""

SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["easyExplain", "memoryTip", "nivText", "nivRef", "nivConfidence", "note"],
    "properties": {
        "easyExplain": {"type": "string"}, "memoryTip": {"type": "string"},
        "nivText": {"type": "string"}, "nivRef": {"type": "string"},
        "nivConfidence": {"type": "string", "enum": ["high", "low"]}, "note": {"type": "string"},
    },
}


def context(v, s):
    lines = [f"[주제별 성경암송] {CHAPTER.get(v.get('chapter'), v.get('chapter') or '')} · 주제 「{v.get('topic') or ''}」",
             f"[암송구절] {v.get('refFull')}\n{v.get('text')}"]
    if s:
        lines.append(f"[우리 교회 설교] {s.get('date')} 「{s.get('title') or ''}」 · 본문 {s.get('scripture') or ''}")
        if s.get("summary"):
            lines.append("요약: " + s["summary"])
        pts = s.get("points") or []
        if pts:
            lines.append("핵심:\n" + "\n".join(f"- {p.get('heading')}: {p.get('body')}" for p in pts))
        if s.get("conclusion"):
            lines.append("맺음말: " + s["conclusion"])
    else:
        lines.append("[우리 교회 설교] 없음 — 구절 본문만으로 풀이하세요.")
    return "\n\n".join(lines)


def gen(client, v, s):
    kw = dict(model=MODEL, max_tokens=4000, system=SYSTEM,
              output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
              messages=[{"role": "user", "content": context(v, s)}],
              betas=["server-side-fallback-2026-06-01"])
    try:
        res = client.beta.messages.create(fallbacks=[{"model": "claude-opus-4-8"}], **kw)
    except TypeError:   # 이 SDK 판이 fallbacks 칸을 모르면 본문에 실어 보낸다
        res = client.beta.messages.create(extra_body={"fallbacks": [{"model": "claude-opus-4-8"}]}, **kw)
    if res.stop_reason == "refusal":
        raise RuntimeError("refusal")
    out = json.loads(next(b.text for b in res.content if b.type == "text"))
    bad = lambda t, n: not t or len(t.strip()) < n
    if bad(out["easyExplain"], 80) or bad(out["memoryTip"], 60) or bad(out["nivText"], 10):
        raise RuntimeError("출력이 부실하다")
    out["model"] = res.model
    return out


def write_excel(verses, drafts, sermons):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    wb = Workbook(); ws = wb.active; ws.title = "검토"
    F = "맑은 고딕"
    ws["A1"] = "주제별 성경암송 — 쉬운 풀이 · 기억법 · NIV 초안 검토표"; ws["A1"].font = Font(name=F, bold=True, size=14)
    ws["A2"] = ("고치는 칸은 노란 칸(G · H · I · J)뿐입니다. 고친 뒤 K 칸에 「확인」이라고 적어 주세요 — 「확인」인 줄만 앱에 들어갑니다. "
                "NIV(I)는 반드시 실제 NIV(2011) 성경과 대조해 주세요. 한글 본문(E)은 개역개정 원문이라 고치지 않습니다.")
    ws["A2"].font = Font(name=F, size=10); ws["A2"].alignment = Alignment(wrap_text=True)
    ws.merge_cells("A2:L2"); ws.row_dimensions[2].height = 34
    heads = ["번호", "묶음", "주제", "구절", "한글 본문(개역개정 · 고치지 않음)", "근거 설교", "쉬운 풀이", "기억법",
             "NIV 본문(대조 필요)", "영문 구절 표기", "확인", "AI 메모"]
    widths = [7, 16, 16, 18, 42, 26, 52, 46, 52, 14, 8, 30]
    yellow = PatternFill("solid", fgColor="FFF4B3")
    for i, (h, w) in enumerate(zip(heads, widths)):
        c = ws.cell(row=4, column=i + 1, value=h); c.font = Font(name=F, bold=True); c.fill = PatternFill("solid", fgColor="DCE3EF")
        ws.column_dimensions[chr(65 + i)].width = w
    r = 5
    for v in verses:
        d = drafts.get(str(v["no"]))
        s = sermon_for(v, sermons)
        src = f"{s.get('date')} 「{s.get('title')}」" if s else "본문만(설교 없음)"
        vals = [v["no"], CHAPTER.get(v.get("chapter"), v.get("chapter")), v.get("topic"), v.get("refFull"), v.get("text"), src,
                d and d["easyExplain"], d and d["memoryTip"], d and d["nivText"], d and d["nivRef"], "",
                d and ((("확신 낮음 · " if d.get("nivConfidence") == "low" else "") + (d.get("note") or "")).strip(" ·")) or ("" if d else "아직 못 만듦")]
        for j, val in enumerate(vals):
            c = ws.cell(row=r, column=j + 1, value=val)
            c.font = Font(name=F, size=10); c.alignment = Alignment(wrap_text=True, vertical="top")
            if j in (6, 7, 8, 9, 10):
                c.fill = yellow
        r += 1
    ws.freeze_panes = "E5"
    wb.save(XLSX)
    print("엑셀:", XLSX, f"({r - 5}줄)")


def sql_str(s):
    s = str(s or "").strip()
    return "null" if not s else "'" + s.replace("'", "''") + "'"


def niv_clean(t):
    """NIV 본문은 그대로 둔다 — 단 문단마다 되풀이되는 여는 따옴표(레 19:11 「'Do not steal. 'Do not lie. …」)만 뺀다.
       앞 절에서 시작한 인용이 이어진다는 표시라 한 구절만 떼어 외울 때는 짝 없는 따옴표가 된다. 「God's」 같은 낱말 안 것은 그대로."""
    return re.sub(r"(^|\s)'(?=[A-Z])", r"\1", str(t or "").strip())


def write_sql(verses, drafts):
    """주제별 73구절에 💡 풀이 · 🧠 기억법 · 영어(NIV) 본문 · 영어 장절을 넣는 SQL. 칸은 supabase/navi_help.sql 이 먼저 만든다."""
    lines = [
        "-- 주제별 성경암송 — 💡 풀이 · 🧠 기억법 · 영어(NIV) 넣기(자료/navi/make-help-drafts.py --sql 이 만든 파일 · 손으로 고치지 말 것)",
        "-- ⚠️ NIV 본문이 들어 있어 공개 저장소에 올리지 않는다(.gitignore) — 다시 만들려면 이 PC 의 초안 JSON 으로 --sql",
        "-- 차례: supabase/navi_help.sql(칸 둘) → 이 파일 — 개발(ktpwthwqzgcqcrmsafdo) 먼저 → 운영(xnomlgydifiqiybervtf) · 여러 번 돌려도 같다",
        "-- 되돌리기: update public.verses set text_en = null, ref_en = null, help_easy = null, help_tip = null where track = 'navi';",
        "begin;",
        "set local lock_timeout = '5s';",
    ]
    n = 0
    for v in verses:
        d = drafts.get(str(v["no"]))
        if not d:
            continue
        lines.append(
            f"update public.verses set text_en = {sql_str(niv_clean(d.get('nivText')))}, ref_en = {sql_str(d.get('nivRef'))}, "
            f"help_easy = {sql_str(d.get('easyExplain'))}, help_tip = {sql_str(d.get('memoryTip'))} "
            f"where no = {int(v['no'])} and track = 'navi';")
        n += 1
    lines += ["commit;", "",
              "select count(*) as 줄, count(text_en) as 영어, count(help_easy) as 풀이, count(help_tip) as 기억법",
              "  from public.verses where track = 'navi';", ""]
    open(DATA_SQL, "w", encoding="utf-8").write("\n".join(lines))
    print("SQL:", DATA_SQL, f"({n}구절)")


def main():
    if "--sql" in sys.argv:
        drafts = json.load(open(DRAFTS, encoding="utf-8"))
        return write_sql(navi_verses(), drafts)
    verses = navi_verses()
    sermons = json.load(open(SERMONS, encoding="utf-8"))
    drafts = json.load(open(DRAFTS, encoding="utf-8")) if os.path.exists(DRAFTS) else {}
    if "--excel" not in sys.argv:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key())
        todo = [v for v in verses if str(v["no"]) not in drafts]
        print(f"만들 구절 {len(todo)}개 (이미 {len(drafts)}개)")
        with ThreadPoolExecutor(max_workers=5) as ex:
            futs = {ex.submit(gen, client, v, sermon_for(v, sermons)): v for v in todo}
            for f in as_completed(futs):
                v = futs[f]
                try:
                    drafts[str(v["no"])] = f.result()
                    json.dump(drafts, open(DRAFTS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
                    print("  ✓", v["no"], v.get("refFull"))
                except Exception as e:
                    print("  ✗", v["no"], v.get("refFull"), str(e)[:120])
    write_excel(verses, drafts, sermons)


if __name__ == "__main__":
    main()
