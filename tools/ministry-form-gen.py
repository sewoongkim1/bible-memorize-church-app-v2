# -*- coding: utf-8 -*-
"""
2027 사역신청 — 부서 확인 양식 생성기

⚠️ 대상 연도가 2026 -> 2027로 바뀌었다(2026-09-07, 성도님 지시). 우리 쪽
   산출물(이 파일이 만드는 엑셀·JSON, 성도용 신청서 두 종)은 전부 2027로
   부른다. 다만 원본 두 문서의 실제 제목(「2026 사역신청서」·「2026년도
   교회부서 조직」)은 그 문서를 가리킬 때만 그대로 인용한다 - 이름을 바꿔
   부르면 출처가 아니게 된다.

목적: 종이 「2026 사역신청서」와 「2026년도 교회부서 조직」(인사표) 두 원본을
     대조해 만든 사역팀 초안 목록을, 각 부서가 확인·수정할 수 있는 엑셀 양식으로 뽑는다.
     여기서 확정된 표기명이 앱(ministry_catalog)의 최종 시드 데이터가 된다.

⚠️ 두 원본은 **팀 이름만** 담고 있다 - 사역 시간·요일·하는 일은 어느 원본에도
   없다(2026-09-07). 성도가 이름만 보고 사역을 고를 수는 없으므로(예: 오병이어
   1팀과 2팀이 뭐가 다른지), **이 양식에서 이름 확인과 같은 라운드로** 함께 걷는다
   - 두 번 물으면 부서마다 응답이 늦어진다.

⚠️ **2026-09-10 - 필터용 여섯 칸을 더했다**(주일·평일·토요일 / 시작 시각 / 끝 시각 /
   한 사람이 서는 주기). 성도 화면에 필터가 들어갔는데(88팀을 아코디언만으로 훑기
   어렵다) 그 필터가 읽는 것이 바로 이 여섯 칸이다. **문장으로 쓴 「매주 화 오전 10시」는
   기계가 못 읽는다** - 사람이 읽을 문장과 기계가 읽을 칸을 따로 받는다.
   양식이 아직 부서에 안 나갔을 때 넣었다 - 나간 뒤였으면 15개 부서에 두 번 물어야 했다.

⚠️ **표를 네 묶음으로 다시 짰다**(같은 날). 전에는 부서가 채울 칸이 F·G·H 와
   K·L·M·N 으로 흩어져 있어, 여섯 칸을 그냥 끼워 넣으면 세 군데로 흩어진다.
   왼쪽 일곱 칸(A~G)은 **보기만** 하는 자료, 오른쪽 열셋(H~T)은 **전부 부서 기입**이다.
   맨 윗줄에 띠를 얹어 ①이름 ②언제 ③안내 ④확인 으로 나눴다.

⚠️ **시각 칸은 텍스트 서식(@)으로 둔다** - 그냥 두면 엑셀이 「10:00」을 시각 값으로
   바꿔 버려, 취합할 때 문자열이 아니라 datetime.time 이 온다(취합 쪽에도 대비를 뒀다).

⚠️ **비어 있음은 「모름」이지 「해당 없음」이 아니다.** 요일 셋이 다 비면 화면에서
   「정해진 날 없음」으로, 시각이 비면 「때마다 다름」으로 **보이기는 한다.**
   미기입을 제외로 짜면 회신율이 곧 실종률이 된다.

⚠️ 다른 교회 사역신청서 다섯 곳을 참고했다(2026-09-07, AppForm/ - 개인정보 없는
   양식류만). 이삭교회·주님의교회는 팀마다 시간을 적고, 「더THE사역」은 필요 인원
   (정원)도 함께 적는다 - **시간·정원을 함께 걷는 것이 흔한 관행**이라는 근거가
   됐다. 정원은 참고용으로만 더한다(1차년도는 인원을 세지 않는다 -
   design doc 04장과 같은 선).

사용법: python tools/ministry-form-gen.py
출력:   ministry/2027_사역신청_부서확인양식.xlsx
        ministry/부서확인/2027_사역신청_확인_<부서>.xlsx  (부서별 분리본)
        ministry/ministry_catalog_2027_draft.json
"""

import json
import os

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "ministry")
OUT_XLSX = os.path.join(OUT_DIR, "2027_사역신청_부서확인양식.xlsx")
OUT_JSON = os.path.join(OUT_DIR, "ministry_catalog_2027_draft.json")
SPLIT_DIR = os.path.join(OUT_DIR, "부서확인")  # 위원회별 분리본(부서장께 하나씩 보낸다)

# committee, group(중분류, 없으면 ""), team, kind(apply/appoint),
# schedule(사역 시간·요일, 확인된 것만 — 2026-09-07 찬양부부터 채워지기 시작),
# option(하위 선택 안내), conflict(조직표 대조 메모)
ROWS = [
    # 교육위원회
    ("교육위원회", "", "장학", "apply", "", "", ""),
    ("교육위원회", "", "교회학교전도", "apply", "", "", ""),
    ("교육위원회", "", "사랑부", "apply", "", "", ""),
    ("교육위원회", "사랑부·어와나", "퍼글", "apply", "", "어와나 4개 중 하나만 신청", ""),
    ("교육위원회", "사랑부·어와나", "커비", "apply", "", "어와나 4개 중 하나만 신청", ""),
    ("교육위원회", "사랑부·어와나", "스팍스/티엔티", "apply", "", "어와나 4개 중 하나만 신청", ""),
    ("교육위원회", "사랑부·어와나", "트랙/저니", "apply", "", "어와나 4개 중 하나만 신청", ""),
    ("교육위원회", "미취학", "영아부", "apply", "", "", ""),
    ("교육위원회", "미취학", "유아부", "apply", "", "", ""),
    ("교육위원회", "미취학", "유치부", "apply", "", "", ""),
    ("교육위원회", "미취학", "새싹부", "apply", "", "", ""),
    ("교육위원회", "아동", "유년부 1부", "apply", "", "", ""),
    ("교육위원회", "아동", "유년부 2부", "apply", "", "", ""),
    ("교육위원회", "아동", "소년부 1부", "apply", "", "", ""),
    ("교육위원회", "아동", "소년부 2부", "apply", "", "", ""),
    ("교육위원회", "청소년", "중등부", "apply", "", "", ""),
    ("교육위원회", "청소년", "고등부", "apply", "", "", ""),
    ("교육위원회", "장년", "은빛시니어학교", "apply", "", "", ""),
    ("교육위원회", "", "행정운영", "appoint", "", "", ""),

    # 교회봉사부
    ("교회봉사부", "", "오병이어 1팀", "apply", "", "", ""),
    ("교회봉사부", "", "오병이어 2팀", "apply", "", "", ""),
    ("교회봉사부", "", "카페운영", "apply", "", "", ""),
    ("교회봉사부", "", "상례", "apply", "", "", ""),
    ("교회봉사부", "", "새하늘찬양대", "apply", "", "", ""),

    # 문화스포츠부
    ("문화스포츠부", "", "운영", "apply", "", "", ""),
    ("문화스포츠부", "", "문화선교", "apply", "", "", ""),
    ("문화스포츠부", "", "문화행사", "apply", "", "", ""),
    ("문화스포츠부", "", "꿈샘문화교실", "apply", "", "", ""),
    ("문화스포츠부", "", "동호회", "apply", "", "", ""),
    ("문화스포츠부", "", "스포츠", "apply", "", "", ""),

    # 방송전산부
    ("방송전산부", "", "방송실 운영", "apply", "", "", ""),
    ("방송전산부", "", "전산", "apply", "", "", ""),
    ("방송전산부", "", "미디어홍보", "apply", "", "", ""),
    ("방송전산부", "", "새물결", "apply", "", "", ""),

    # 새가족부
    ("새가족부", "", "운영", "apply", "", "", ""),
    ("새가족부", "", "새가족영접", "apply", "", "", ""),
    ("새가족부", "", "새가족정착", "apply", "", "", ""),
    ("새가족부", "", "이단대응", "apply", "", "", ""),

    # 선교부
    ("선교부", "", "국내선교", "apply", "", "", ""),
    ("선교부", "", "세계선교", "apply", "", "", ""),
    ("선교부", "", "다문화선교", "apply", "", "", ""),

    # 예배부
    ("예배부", "", "운영", "apply", "", "", ""),
    ("예배부", "", "영접(웰컴)", "apply", "", "", ""),
    ("예배부", "", "출입문영접", "apply", "", "", ""),
    ("예배부", "", "본당영접", "apply", "", "", ""),
    ("예배부", "", "세례예식", "apply", "", "", ""),
    ("예배부", "", "성찬예식", "appoint", "", "", ""),
    ("예배부", "", "회계", "appoint", "", "",
     "조직표에는 회계(최현희)가 있으나 신청서 양식에는 없음 — 임명직인지, 신청서 누락인지 확인 필요"),

    # 제자양육부
    ("제자양육부", "", "단계별 제자양육", "apply", "", "", ""),
    ("제자양육부", "", "마더와이즈", "apply", "", "", ""),
    ("제자양육부", "", "5060하프타임", "apply", "", "", ""),
    ("제자양육부", "", "신앙운동", "apply", "", "", ""),
    ("제자양육부", "", "학사관리", "apply", "", "", ""),

    # 전도부
    # ⚠️ 2026-09-07 — "행복전도대(그룹) + 요일 중 하나 이상" 대신, 요일을 이름에
    #    박은 독립 항목 두 개로 편다(찬양부와 같은 정리 방향 — 아래 참고).
    ("전도부", "", "운영", "apply", "", "", ""),
    ("전도부", "", "행복전도대 - 금요일", "apply", "", "", ""),
    ("전도부", "", "행복전도대 - 토요일", "apply", "", "", ""),
    ("전도부", "", "전도학교", "apply", "", "", ""),
    ("전도부", "", "중보기도", "apply", "", "", ""),
    ("전도부", "", "중보기도학교", "apply", "", "", ""),
    ("전도부", "", "기도실운영", "apply", "", "", ""),

    # 차량부
    ("차량부", "", "주차안내", "apply", "", "", ""),

    # 찬양부 — 2026-09-07 담당자 확인으로 전면 재구성(05장의 인사표·신청서
    #   불일치가 이 확인으로 풀렸다). 찬양대(전통 성가대)·찬양팀(예배별 워십팀)·
    #   오케스트라 세 중분류로 나뉜다. 찬양대·오케스트라 각 팀이 서는 예배 시간대는
    #   schedule에 담았다 — 부서에서 처음 받은 실제 사역 시간 정보다.
    ("찬양부", "찬양대", "할렐루야찬양대", "apply", "1부", "", ""),
    ("찬양부", "찬양대", "임마누엘찬양대", "apply", "2부", "", ""),
    ("찬양부", "찬양대", "시온찬양대", "apply", "3부", "", ""),
    ("찬양부", "찬양대", "실로암찬양대", "apply", "청년", "", ""),
    ("찬양부", "찬양대", "가브리엘찬양대", "apply", "오후", "", ""),
    ("찬양부", "찬양팀", "2부 찬양팀", "apply", "", "", ""),
    ("찬양부", "찬양팀", "3부 찬양팀", "apply", "", "", ""),
    ("찬양부", "찬양팀", "오후 찬양팀", "apply", "", "", ""),
    ("찬양부", "찬양팀", "수요오전 찬양팀", "apply", "", "", ""),
    ("찬양부", "찬양팀", "수요오후 찬양팀", "apply", "", "", ""),
    ("찬양부", "찬양팀", "금요성령집회 찬양팀", "apply", "", "", ""),
    ("찬양부", "오케스트라", "베데스다", "apply", "2부", "", ""),
    ("찬양부", "오케스트라", "비파와수금", "apply", "3부", "", ""),
    ("찬양부", "", "중보기도팀", "apply", "", "", ""),

    # 희망의복지재단 - 사회봉사센터
    ("희망의복지재단(사회봉사센터)", "", "봉사센터운영", "apply", "", "", ""),
    ("희망의복지재단(사회봉사센터)", "", "희망푸드뱅크", "apply", "", "", ""),
    ("희망의복지재단(사회봉사센터)", "", "사랑의봉사팀", "apply", "", "", ""),
    ("희망의복지재단(사회봉사센터)", "", "도서관책마을", "apply", "", "", ""),
    ("희망의복지재단(사회봉사센터)", "", "그루터기사역", "apply", "", "", ""),

    # L-12 (목양부)
    ("L-12(목양부)", "", "운영", "apply", "", "", ""),
    ("L-12(목양부)", "", "목양지원", "apply", "", "", ""),
    ("L-12(목양부)", "", "정착관리", "apply", "", "", "조직표(인사표)에는 '목양관리'로 표기 — 같은 팀인지, 다른 팀인지 확인 필요"),
    ("L-12(목양부)", "", "소그룹 리더교육", "apply", "", "", "조직표(인사표)에는 '서기'로 표기 — 같은 팀인지, 다른 팀인지 확인 필요"),
    ("L-12(목양부)", "", "회계", "appoint", "", "", "조직표(인사표)에만 있음 — 임명직인지 확인 필요"),
    ("L-12(목양부)", "", "리더", "appoint", "", "", ""),

    # 총무부
    ("총무부", "", "대외협력", "apply", "", "", ""),
    ("총무부", "", "역사홍보", "apply", "", "", ""),
    ("총무부", "", "경축부", "apply", "", "", ""),
    ("총무부", "", "상담실", "appoint", "", "", ""),

    # 시설부
    ("시설부", "", "안전관리", "apply", "", "", ""),
    ("시설부", "", "시설관리", "apply", "", "", ""),
    ("시설부", "", "자재관리", "apply", "", "", ""),
    ("시설부", "", "데코", "apply", "", "", ""),
]

APPOINT_ONLY_NOTICES = [
    ("M-12부", "신청서에 개별 사역팀 없음 — 행정운영/리더 전원 임명직"),
    ("재정부", "신청 대상 없음 — 회계·계수·재무 전원 임명직"),
    ("감사위원회", "신청 대상 없음 — 감사위원 임명직"),
    ("당회 · 제직회", "담임목사 직속 기구 — 사역신청서 대상 아님"),
]

KIND_LABEL = {"apply": "신청가능", "appoint": "임명직"}

# ── 표의 칸 ─────────────────────────────────────────────
# (제목, 폭, 부서기입?, 줄바꿈?)
# ⚠️ **왼쪽 일곱은 보기만, 오른쪽 열셋은 전부 부서 기입.** 채울 칸이 흩어져 있으면
#    부서장이 좌우로 오가며 「내가 어디를 채우지」를 먼저 풀어야 한다.
#    그 한 수고가 회신율을 깎는다 — 채울 곳을 한 덩어리로 모으고 띠로 이름을 붙였다.
COLS = [
    ("순번",                      6,  False, False),
    ("위원회/부서",               20, False, False),
    ("중분류",                    13, False, False),
    ("사역팀명(신청서 표기 초안)", 22, False, True),
    ("구분",                      9,  False, False),
    ("하위 선택 안내",            20, False, True),
    ("확인이 필요한 사유",        28, False, True),
    ("확정 표기명",               20, True,  True),
    ("변경여부",                  11, True,  False),
    ("주일",                      6,  True,  False),
    ("금요일",                    7,  True,  False),
    ("토요일",                    7,  True,  False),
    ("평일(금 제외)",             11, True,  True),
    ("매주",                      6,  True,  False),
    ("격주(교대형식)",            11, True,  True),
    ("매달",                      6,  True,  False),
    ("그때그때",                  8,  True,  False),
    ("주일 시작 시각",            11, True,  True),
    ("주일 끝 시각",              11, True,  True),
    ("사역 시간·요일 (문장으로)", 22, True,  True),
    ("하는 일 — 한 줄",           26, True,  True),
    ("필요 인원 (선택)",          11, True,  True),
    ("확인하신 분 (성명)",        13, True,  True),
    ("비고",                      20, True,  True),
]
# 맨 윗줄 띠 — (제목, 시작칸, 끝칸)
GROUPS = [
    ("확인해 주실 자료 (저희가 채웠습니다 · 보기만 하세요)", 1, 7),
    ("① 이름 확정", 8, 9),
    ("② 언제 — 성도님이 이 칸들로 사역을 찾습니다", 10, 19),
    ("③ 성도님 화면에 그대로 보일 안내", 20, 22),
    ("④ 확인", 23, 24),
]
C_CHANGE = 9
# 요일 넷 · 주기 넷 · 주일 시각 둘 (2026-09-10 성도님 지시로 다시 짬)
C_DAYS = [10, 11, 12, 13]        # 주일 · 금요일 · 토요일 · 평일(금 제외)
C_FREQS = [14, 15, 16, 17]       # 매주 · 격주(교대형식) · 매달 · 그때그때
C_FROM, C_TO = 18, 19
C_OX = C_DAYS + C_FREQS          # O 로 받는 칸 전부
# ⚠️ **금요일을 평일에서 뺐다.** 금요성령집회·행복전도대(금)처럼 금요일 사역이 많은데
#    「평일」로 뭉뚱그리면 성도가 금요일만 골라 찾을 수 없다.
# ⚠️ **주기는 여러 개 고를 수 있다** — 한 칸 고르기가 아니라 O 넷이다.
#    DB 도 네 칸이다(supabase/ministry_when_v2.sql). 이름이 어긋나면 시드가 막힌다.
# ⚠️ **시각은 주일에만** 받는다 — DB 제약 ministry_catalog_time_sun_chk 가 같은 규칙이다.
HEADER = [c[0] for c in COLS]

NAVY = "1A3A6B"
GOLD = "C3A253"
CREAM = "F7F3EA"
CONFLICT_FILL = "FBE4E1"
INPUT_FILL = "FFFCF0"      # 부서가 채울 칸 — 아주 옅게 칠해 「여기」를 말한다
REF_BAND = "8A8F9A"
HEADER_FILL = NAVY


def style_header(ws):
    """두 줄짜리 머리 — 1줄은 묶음 띠, 2줄은 칸 이름."""
    for title, c1, c2 in GROUPS:
        ws.merge_cells(start_row=1, start_column=c1, end_row=1, end_column=c2)
        cell = ws.cell(row=1, column=c1, value=title)
        is_input = COLS[c1 - 1][2]
        cell.fill = PatternFill("solid", fgColor=GOLD if is_input else REF_BAND)
        cell.font = Font(bold=True, size=10, name="맑은 고딕",
                         color=NAVY if is_input else "FFFFFF")
        cell.alignment = Alignment(vertical="center", horizontal="center", wrap_text=True)
    ws.row_dimensions[1].height = 24

    for c in range(1, len(COLS) + 1):
        cell = ws.cell(row=2, column=c, value=COLS[c - 1][0])
        cell.font = Font(bold=True, color="FFFFFF", size=10, name="맑은 고딕")
        cell.fill = PatternFill("solid", fgColor=HEADER_FILL)
        cell.alignment = Alignment(vertical="center", horizontal="center", wrap_text=True)
    ws.row_dimensions[2].height = 38

    # ⚠️ A~D 를 붙잡는다 — 20칸이라 오른쪽 끝(비고)에서 「지금 어느 팀 줄이지」를
    #    잃어버리기 쉽다. 팀 이름이 D열이므로 E3 에서 얼린다.
    ws.freeze_panes = "E3"


def build_main_sheet(wb, rows=None):
    """rows 를 주면 그 부서 것만 담는다(위원회별 분리본). 안 주면 전체."""
    ws = wb.active
    ws.title = "사역팀 확인"
    style_header(ws)

    thin = Side(style="thin", color="D9CFB0")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    prev_committee = None
    for i, (committee, group, team, kind, schedule, option, conflict) in enumerate(
            ROWS if rows is None else rows, start=1):
        r = ws.max_row + 1
        vals = ([i, committee, group, team, KIND_LABEL[kind], option, conflict,
                 "", ""]                    # 확정 표기명 · 변경여부
                + [""] * 8                  # 요일 넷 · 주기 넷
                + ["", ""]                  # 주일 시작 · 끝
                + [schedule, "", ""]        # 문장으로 · 하는 일 · 필요 인원
                + ["", ""])                 # 확인하신 분 · 비고
        for c, v in enumerate(vals, start=1):
            cell = ws.cell(row=r, column=c, value=(v if v != "" else None))
            cell.border = border
            cell.font = Font(size=10, name="맑은 고딕")
            cell.alignment = Alignment(
                vertical="center", wrap_text=COLS[c - 1][3],
                horizontal=("center" if c in C_OX + [C_FROM, C_TO] else "general"))
            if COLS[c - 1][2]:
                cell.fill = PatternFill("solid", fgColor=INPUT_FILL)
        # ⚠️ 시각 칸은 텍스트 서식으로 둔다 — 그냥 두면 엑셀이 「10:00」을 시각 값으로
        #    바꿔 취합 때 datetime.time 이 온다(취합 쪽에도 대비를 두었지만 근원을 막는다).
        for c in (C_FROM, C_TO):
            ws.cell(row=r, column=c).number_format = "@"
        # 임명직은 이름만 확인하면 된다 — 회색으로 덮어 ②③을 안 채워도 됨을 보인다
        if kind == "appoint":
            for c in range(1, len(COLS) + 1):
                ws.cell(row=r, column=c).fill = PatternFill("solid", fgColor="ECECEC")
        if conflict:
            for c in range(1, len(COLS) + 1):
                ws.cell(row=r, column=c).fill = PatternFill("solid", fgColor=CONFLICT_FILL)
        if committee != prev_committee:
            ws.cell(row=r, column=2).font = Font(bold=True, size=10, name="맑은 고딕", color=NAVY)
        prev_committee = committee

    assert len(COLS) == 24, len(COLS)   # 띠(GROUPS)와 어긋나면 여기서 멈춘다
    for idx, spec in enumerate(COLS, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = spec[1]

    last = ws.max_row
    ws.auto_filter.ref = "A2:%s%d" % (get_column_letter(len(COLS)), last)

    def add_dv(formula, col, prompt, err):
        dv = DataValidation(type="list", formula1=formula, allow_blank=True)
        dv.error, dv.prompt = err, prompt
        ws.add_data_validation(dv)
        L = get_column_letter(col)
        dv.add("%s3:%s%d" % (L, L, last))

    add_dv('"유지,이름 수정,신설,폐지"', C_CHANGE,
           "유지 / 이름 수정 / 신설 / 폐지 중 선택", "목록에서 골라주세요")
    for c in C_DAYS:
        add_dv('"O"', c, "이 요일에 사역하면 O (아니면 비워 두세요)", "O 만 넣어 주세요")
    for c in C_FREQS:
        add_dv('"O"', c, "한 분이 실제로 서는 주기입니다 (팀이 모이는 주기가 아닙니다). "
                         "여럿이면 여럿 다 O", "O 만 넣어 주세요")

    return ws


def build_notice_sheet(wb):
    ws = wb.create_sheet("임명직 전용 부서")
    ws.append(["부서", "안내"])
    for c in (1, 2):
        cell = ws.cell(row=1, column=c)
        cell.font = Font(bold=True, color="FFFFFF", size=10, name="맑은 고딕")
        cell.fill = PatternFill("solid", fgColor=HEADER_FILL)
        cell.alignment = Alignment(vertical="center", horizontal="center", wrap_text=True)
    ws.freeze_panes = "A2"
    thin = Side(style="thin", color="D9CFB0")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    for dept, note in APPOINT_ONLY_NOTICES:
        ws.append([dept, note])
        r = ws.max_row
        for c in (1, 2):
            cell = ws.cell(row=r, column=c)
            cell.border = border
            cell.font = Font(size=10, name="맑은 고딕")
            cell.alignment = Alignment(vertical="center", wrap_text=True)
    ws.column_dimensions["A"].width = 24
    ws.column_dimensions["B"].width = 70


def build_guide_sheet(wb, committee=None):
    """committee 를 주면 그 부서 전용 안내로 바꾼다(분리본은 필터를 쓸 일이 없다)."""
    ws = wb.create_sheet("안내", 0)
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 4
    ws.column_dimensions["B"].width = 96

    def put(row, text, size=11, bold=False, color="262A33", wrap=True):
        cell = ws.cell(row=row, column=2, value=text)
        cell.font = Font(size=size, bold=bold, color=color, name="맑은 고딕")
        cell.alignment = Alignment(vertical="top", wrap_text=wrap)
        return cell

    put(2, ("2027 사역신청 — %s 확인 양식" % committee) if committee
           else "2027 사역신청 — 부서 확인 양식", size=18, bold=True, color=NAVY)
    put(4, "종이 「2026 사역신청서」와 「2026년도 교회부서 조직」(인사표) 두 문서를 대조해 만든 사역팀 초안입니다. "
            "이 파일에서 우리 부서 자리를 확인·수정해 주시면, 그 내용이 앱(성경말씀 암송 앱) 사역신청 화면의 최종 목록이 됩니다.",
        size=11)
    put(6, "사용 방법", size=13, bold=True, color=NAVY)
    put(7, ("1. 「사역팀 확인」 시트에 %s 사역팀만 담겨 있습니다. 다른 부서 것은 없으니 그대로 보시면 됩니다."
            % committee) if committee
           else "1. 「사역팀 확인」 시트에서 화면 위 필터로 우리 부서만 골라 봅니다(B열 '위원회/부서').")
    put(8, "2. 표 맨 윗줄에 띠가 넷 있습니다. **회색 띠(A~G열)는 저희가 채운 자료라 보시기만** 하면 되고, "
            "**금색 띠(H~T열)가 채워 주실 곳**입니다. 채울 칸은 옅은 노란빛으로 칠해 두었습니다. "
            "가로로 넓어 보이지만 팀 이름(D열)은 늘 왼쪽에 붙어 있으니 어느 줄인지 잃지 않으실 겁니다.")
    put(10, "① 이름 확정", size=12, bold=True, color=NAVY)
    put(11, "H열 '확정 표기명'에 2027년 최종 명칭을 적어 주세요(그대로면 D열과 똑같이 적으셔도 됩니다). "
             "I열 '변경여부'는 유지 / 이름 수정 / 신설 / 폐지 중에서 고릅니다.")
    put(13, "② 언제 — 열 칸 (2026-09-10)", size=12, bold=True, color=NAVY)
    put(14, "성도님이 앱에서 「나는 주일 오전만 됩니다」처럼 조건을 걸어 사역을 찾습니다. "
             "그때 쓰이는 것이 이 여섯 칸입니다 — 문장으로 쓰신 시간은 기계가 읽지 못해 따로 받습니다.")
    put(15, "  · J~M열 (주일 / 금요일 / 토요일 / 평일) — 해당하는 칸마다 O. 여럿이면 여럿 다 넣습니다. "
             "⚠️ 금요일은 따로 두었으니 M열 '평일'은 **금요일을 뺀 날**(월~목)로 봐 주세요 — "
             "금요성령집회·행복전도대(금)처럼 금요일 사역이 많아 성도가 금요일만 골라 찾을 수 있게 나눴습니다.")
    put(16, "  · N~Q열 (매주 / 격주(교대형식) / 매달 / 그때그때) — 해당하는 칸마다 O. **여럿 고를 수 있습니다** "
             "(매주 또는 격주인 팀이 있습니다). ⚠️ **팀이 모이는 주기가 아니라, 한 분이 실제로 서는 주기**입니다. "
             "당번을 넷이 돌아가며 서면 팀은 매주라도 한 분은 '매달'입니다 — 성도님이 재는 것은 자기 부담입니다.")
    put(17, "  · R·S열 (주일 시작 시각 / 주일 끝 시각) — 24시간 꼴로. 보기: 09:30, 14:00. "
             "⚠️ **주일 사역에만** 적습니다. 평일·금요일·토요일 사역의 시간은 아래 ③의 문장 칸에 적어 주세요.")
    put(18, "  · 모르시거나 정해지지 않았으면 비워 두셔도 됩니다 — 그 팀이 목록에서 사라지지는 않고 "
             "'정해진 날 없음 · 때마다 다름'으로 보입니다.")
    put(20, "③ 성도님 화면에 그대로 보일 안내", size=12, bold=True, color=NAVY)
    put(21, "  · T열 '사역 시간·요일(문장으로)' — 사람이 읽는 한 줄입니다. 보기: '매주 화 오전 10시, 예배 30분 전 모임'. "
             "주일이 아닌 사역의 시간은 여기에 적어 주세요.")
    put(22, "  · U열 '하는 일 — 한 줄' — 이름만 보고는 알 수 없는 것을 적어 주세요"
             "(예: 오병이어 1팀·2팀이 무엇이 다른지). 짧게만 적으셔도 됩니다.")
    put(23, "  · V열 '필요 인원'은 선택입니다 — 정원을 세거나 신청을 막는 데 쓰지 않고 참고로만 보여드립니다.")
    put(25, "④ 확인", size=12, bold=True, color=NAVY)
    put(26, "W열에 확인하신 분 성함을, X열에는 그 밖에 전달할 내용을 적어 주세요.")
    put(28, "색이 칠해진 자리", size=13, bold=True, color=NAVY)
    put(29, "▨ 분홍색 행 — 두 원본 문서(인사표·신청서)의 표기가 서로 달라 어느 쪽이 맞는지 확인이 필요한 자리입니다. "
             "G열 '확인이 필요한 사유'에 무엇이 다른지 적어 두었습니다.")
    put(30, "▨ 회색 행 — 신청이 아니라 지명으로 맡는 임명직입니다. 성도가 직접 신청하지 않으므로 앱의 신청 목록에는 넣지 않습니다. "
             "이름이 맞는지만 확인해 주세요(②·③은 안 채우셔도 됩니다).")
    if not committee:
        put(32, "임명직만 있어 개별 사역팀이 없는 부서(M-12부·재정부·감사위원회 등)는 "
                 "「임명직 전용 부서」 시트에 따로 안내했습니다.")
    put(34, "문의: 방송전산부 전산팀", size=10, color="5C6070")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    wb = Workbook()
    build_main_sheet(wb)
    build_notice_sheet(wb)
    build_guide_sheet(wb)
    try:
        wb.save(OUT_XLSX)
        xlsx_ok = True
    except PermissionError:
        # 엑셀에서 파일을 열어 둔 채로 돌리면 저장이 막힌다 — JSON(진짜 시드)까지
        # 못 쓰게 막을 이유는 없다. 파일을 닫고 다시 돌리면 된다.
        print("!! 엑셀 파일이 열려 있어 .xlsx 저장을 건너뜁니다 - 닫고 다시 돌려 주세요.")
        xlsx_ok = False

    seed = [
        {
            "committee": c, "group": g, "team": t, "kind": k,
            # schedule_note 는 확인된 것만 채워져 있다(찬양부부터 시작, 2026-09-07).
            # desc_note·capacity_note 는 아직 자리만(부서 확인 뒤 채워진다).
            # capacity_note 는 참고용 — 신청을 막거나 세는 데 쓰지 않는다.
            "schedule_note": sch, "desc_note": "", "capacity_note": "",
            "option_note": o, "conflict_note": cf,
            # 필터용 여섯 칸(2026-09-10) — 부서 회신 전에는 비어 있다.
            # ⚠️ 비었다고 목록에서 빠지지 않는다. 화면에서 「정해진 날 없음 ·
            #    때마다 다름」으로 보일 뿐이다 — 미기입을 제외로 짜면 회신율이
            #    곧 실종률이 된다(supabase/ministry_filter_cols.sql 과 같은 약속).
            "day_sun": False, "day_fri": False, "day_sat": False, "day_week": False,
            "freq_weekly": False, "freq_biweekly": False,
            "freq_monthly": False, "freq_adhoc": False,
            "time_from": "", "time_to": "",
        }
        for (c, g, t, k, sch, o, cf) in ROWS
    ]
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(seed, f, ensure_ascii=False, indent=2)

    made = build_split_files()

    if xlsx_ok:
        print(f"작성 완료: {os.path.abspath(OUT_XLSX)}")
    print(f"원본 데이터: {os.path.abspath(OUT_JSON)}")
    print(f"부서별 분리본: {made}개 -> {os.path.abspath(SPLIT_DIR)}")
    print(f"총 {len(ROWS)}개 사역팀 항목, 임명직 전용 안내 부서 {len(APPOINT_ONLY_NOTICES)}개")


def build_split_files():
    """위원회별로 자기 것만 담긴 파일을 따로 뽑는다.

    ⚠️ 왜 나누나 — 94팀이 한 파일에 있으면 부서장이 「필터로 우리 부서만 보세요」
       를 먼저 해내야 한다. 그 한 단계가 회신율을 깎는다. 각자 자기 파일만
       열면 바로 채울 수 있게 나눈다(내용·서식은 통합본과 같다).
    ⚠️ 순번은 부서마다 1번부터 다시 센다 — 통합본의 번호를 그대로 쓰면
       「7번부터 시작하는 표」를 받게 되어 어리둥절하다.
    """
    os.makedirs(SPLIT_DIR, exist_ok=True)
    committees, seen = [], set()
    for r in ROWS:
        if r[0] not in seen:
            seen.add(r[0])
            committees.append(r[0])

    made = 0
    for c in committees:
        rows = [r for r in ROWS if r[0] == c]
        wb = Workbook()
        build_main_sheet(wb, rows=rows)
        build_guide_sheet(wb, committee=c)
        safe = c.replace("/", "-").replace("\\", "-")
        path = os.path.join(SPLIT_DIR, f"2027_사역신청_확인_{safe}.xlsx")
        try:
            wb.save(path)
            made += 1
        except PermissionError:
            print(f"!! 열려 있어 건너뜀: {os.path.basename(path)}")
    return made


if __name__ == "__main__":
    main()
