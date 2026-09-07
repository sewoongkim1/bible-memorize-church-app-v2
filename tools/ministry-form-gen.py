# -*- coding: utf-8 -*-
"""
2026 사역신청 — 부서 확인 양식 생성기

목적: 종이 「2026 사역신청서」와 「2026년도 교회부서 조직」(인사표) 두 원본을
     대조해 만든 사역팀 초안 목록을, 각 부서가 확인·수정할 수 있는 엑셀 양식으로 뽑는다.
     여기서 확정된 표기명이 앱(ministry_catalog)의 최종 시드 데이터가 된다.

⚠️ 두 원본은 **팀 이름만** 담고 있다 — 사역 시간·요일·하는 일은 어느 원본에도
   없다(2026-09-07). 성도가 이름만 보고 사역을 고를 수는 없으므로(예: 오병이어
   1팀과 2팀이 뭐가 다른지), **이 양식에서 이름 확인과 같은 라운드로** 함께 걷는다
   — 두 번 물으면 부서마다 응답이 늦어진다.

사용법: python tools/ministry-form-gen.py
출력:   ministry/2026_사역신청_부서확인양식.xlsx
"""
import json
import os

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "ministry")
OUT_XLSX = os.path.join(OUT_DIR, "2026_사역신청_부서확인양식.xlsx")
OUT_JSON = os.path.join(OUT_DIR, "ministry_catalog_2026_draft.json")

# committee, group(중분류, 없으면 ""), team, kind(apply/appoint), option(하위 선택 안내), conflict(조직표 대조 메모)
ROWS = [
    # 교육위원회
    ("교육위원회", "", "장학", "apply", "", ""),
    ("교육위원회", "", "교회학교전도", "apply", "", ""),
    ("교육위원회", "", "사랑부", "apply", "", ""),
    ("교육위원회", "사랑부·어와나", "퍼글", "apply", "어와나 4개 중 하나만 신청", ""),
    ("교육위원회", "사랑부·어와나", "커비", "apply", "어와나 4개 중 하나만 신청", ""),
    ("교육위원회", "사랑부·어와나", "스팍스/티엔티", "apply", "어와나 4개 중 하나만 신청", ""),
    ("교육위원회", "사랑부·어와나", "트랙/저니", "apply", "어와나 4개 중 하나만 신청", ""),
    ("교육위원회", "미취학", "영아부", "apply", "", ""),
    ("교육위원회", "미취학", "유아부", "apply", "", ""),
    ("교육위원회", "미취학", "유치부", "apply", "", ""),
    ("교육위원회", "미취학", "새싹부", "apply", "", ""),
    ("교육위원회", "아동", "유년부 1부", "apply", "", ""),
    ("교육위원회", "아동", "유년부 2부", "apply", "", ""),
    ("교육위원회", "아동", "소년부 1부", "apply", "", ""),
    ("교육위원회", "아동", "소년부 2부", "apply", "", ""),
    ("교육위원회", "청소년", "중등부", "apply", "", ""),
    ("교육위원회", "청소년", "고등부", "apply", "", ""),
    ("교육위원회", "장년", "은빛시니어학교", "apply", "", ""),
    ("교육위원회", "", "행정운영", "appoint", "", ""),

    # 교회봉사부
    ("교회봉사부", "", "오병이어 1팀", "apply", "", ""),
    ("교회봉사부", "", "오병이어 2팀", "apply", "", ""),
    ("교회봉사부", "", "카페운영", "apply", "", ""),
    ("교회봉사부", "", "상례", "apply", "", ""),
    ("교회봉사부", "", "새하늘찬양대", "apply", "다른 찬양대와 겸직 가능한 유일한 예외", ""),

    # 문화스포츠부
    ("문화스포츠부", "", "운영", "apply", "", ""),
    ("문화스포츠부", "", "문화선교", "apply", "", ""),
    ("문화스포츠부", "", "문화행사", "apply", "", ""),
    ("문화스포츠부", "", "꿈샘문화교실", "apply", "", ""),
    ("문화스포츠부", "", "동호회", "apply", "", ""),
    ("문화스포츠부", "", "스포츠", "apply", "", ""),

    # 방송전산부
    ("방송전산부", "", "방송실 운영", "apply", "", ""),
    ("방송전산부", "", "전산", "apply", "", ""),
    ("방송전산부", "", "미디어홍보", "apply", "", ""),
    ("방송전산부", "", "새물결", "apply", "", ""),

    # 새가족부
    ("새가족부", "", "운영", "apply", "", ""),
    ("새가족부", "", "새가족영접", "apply", "", ""),
    ("새가족부", "", "새가족정착", "apply", "", ""),
    ("새가족부", "", "이단대응", "apply", "", ""),

    # 선교부
    ("선교부", "", "국내선교", "apply", "", ""),
    ("선교부", "", "세계선교", "apply", "", ""),
    ("선교부", "", "다문화선교", "apply", "", ""),

    # 예배부
    ("예배부", "", "운영", "apply", "", ""),
    ("예배부", "", "영접(웰컴)", "apply", "", ""),
    ("예배부", "", "출입문영접", "apply", "", ""),
    ("예배부", "", "본당영접", "apply", "", ""),
    ("예배부", "", "세례예식", "apply", "", ""),
    ("예배부", "", "성찬예식", "appoint", "", ""),
    ("예배부", "", "회계", "appoint", "",
     "조직표에는 회계(최현희)가 있으나 신청서 양식에는 없음 — 임명직인지, 신청서 누락인지 확인 필요"),

    # 제자양육부
    ("제자양육부", "", "단계별 제자양육", "apply", "", ""),
    ("제자양육부", "", "마더와이즈", "apply", "", ""),
    ("제자양육부", "", "5060하프타임", "apply", "", ""),
    ("제자양육부", "", "신앙운동", "apply", "", ""),
    ("제자양육부", "", "학사관리", "apply", "", ""),

    # 전도부
    ("전도부", "", "운영", "apply", "", ""),
    ("전도부", "행복전도대", "금요일", "apply", "행복전도대 요일 중 하나 이상 신청", ""),
    ("전도부", "행복전도대", "토요일", "apply", "행복전도대 요일 중 하나 이상 신청", ""),
    ("전도부", "", "전도학교", "apply", "", ""),
    ("전도부", "", "중보기도", "apply", "", ""),
    ("전도부", "", "중보기도학교", "apply", "", ""),
    ("전도부", "", "기도실운영", "apply", "", ""),

    # 차량부
    ("차량부", "", "주차안내", "apply", "", ""),

    # 찬양부
    ("찬양부", "", "할렐루야찬양대", "apply", "", ""),
    ("찬양부", "", "임마누엘찬양대", "apply", "", ""),
    ("찬양부", "", "시온찬양대", "apply", "", ""),
    ("찬양부", "", "실로암찬양대", "apply", "", ""),
    ("찬양부", "", "가브리엘찬양대", "apply", "", ""),
    ("찬양부", "", "비파와수금", "apply", "", "신청서에만 있고 조직표(인사표)에는 없음 — 신설 팀인지 확인 필요"),
    ("찬양부", "", "베데스다", "apply", "", "신청서에만 있고 조직표(인사표)에는 없음 — 신설 팀인지 확인 필요"),
    ("찬양부", "주일찬양", "2부", "apply", "주일찬양 봉사 시간대 중 택1", ""),
    ("찬양부", "주일찬양", "3부", "apply", "주일찬양 봉사 시간대 중 택1", ""),
    ("찬양부", "주일찬양", "오후", "apply", "주일찬양 봉사 시간대 중 택1", ""),
    ("찬양부", "수요찬양", "오전", "apply", "수요찬양 봉사 시간대 중 택1", ""),
    ("찬양부", "수요찬양", "오후", "apply", "수요찬양 봉사 시간대 중 택1", ""),
    ("찬양부", "", "금요성령집회찬양", "apply", "", ""),
    ("찬양부", "", "중보기도팀(찬양)", "apply", "", ""),
    ("찬양부", "", "찬양대운영", "appoint", "", "조직표(인사표)에만 있고 신청서 양식에는 없음 — 임명직으로 볼지 확인 필요"),
    ("찬양부", "", "찬양팀운영", "appoint", "", "조직표(인사표)에만 있고 신청서 양식에는 없음 — 임명직으로 볼지 확인 필요"),
    ("찬양부", "", "오케스트라", "apply", "", "조직표(인사표)에만 있고 신청서 양식에는 없음 — 신청 대상 누락인지 확인 필요"),
    ("찬양부", "", "주나힘찬양", "apply", "", "조직표(인사표)에만 있고 신청서 양식에는 없음 — 신청 대상 누락인지 확인 필요"),

    # 희망의복지재단 - 사회봉사센터
    ("희망의복지재단(사회봉사센터)", "", "봉사센터운영", "apply", "", ""),
    ("희망의복지재단(사회봉사센터)", "", "희망푸드뱅크", "apply", "", ""),
    ("희망의복지재단(사회봉사센터)", "", "사랑의봉사팀", "apply", "", ""),
    ("희망의복지재단(사회봉사센터)", "", "도서관책마을", "apply", "", ""),
    ("희망의복지재단(사회봉사센터)", "", "그루터기사역", "apply", "", ""),

    # L-12 (목양부)
    ("L-12(목양부)", "", "운영", "apply", "", ""),
    ("L-12(목양부)", "", "목양지원", "apply", "", ""),
    ("L-12(목양부)", "", "정착관리", "apply", "", "조직표(인사표)에는 '목양관리'로 표기 — 같은 팀인지, 다른 팀인지 확인 필요"),
    ("L-12(목양부)", "", "소그룹 리더교육", "apply", "", "조직표(인사표)에는 '서기'로 표기 — 같은 팀인지, 다른 팀인지 확인 필요"),
    ("L-12(목양부)", "", "회계", "appoint", "", "조직표(인사표)에만 있음 — 임명직인지 확인 필요"),
    ("L-12(목양부)", "", "리더", "appoint", "", ""),

    # 총무부
    ("총무부", "", "대외협력", "apply", "", ""),
    ("총무부", "", "역사홍보", "apply", "", ""),
    ("총무부", "", "경축부", "apply", "", ""),
    ("총무부", "", "상담실", "appoint", "", ""),

    # 시설부
    ("시설부", "", "안전관리", "apply", "", ""),
    ("시설부", "", "시설관리", "apply", "", ""),
    ("시설부", "", "자재관리", "apply", "", ""),
    ("시설부", "", "데코", "apply", "", ""),
]

APPOINT_ONLY_NOTICES = [
    ("M-12부", "신청서에 개별 사역팀 없음 — 행정운영/리더 전원 임명직"),
    ("재정부", "신청 대상 없음 — 회계·계수·재무 전원 임명직"),
    ("감사위원회", "신청 대상 없음 — 감사위원 임명직"),
    ("당회 · 제직회", "담임목사 직속 기구 — 사역신청서 대상 아님"),
]

KIND_LABEL = {"apply": "신청가능", "appoint": "임명직"}

HEADER = [
    "순번", "위원회/부서", "중분류", "사역팀명(신청서 표기 초안)", "구분",
    "사역 시간·요일 (부서 기입)", "하는 일 — 한 줄 (부서 기입)",
    "하위 선택 안내", "확인이 필요한 사유", "확정 표기명 (부서 기입)",
    "변경여부", "담당자 확인 (성명)", "비고",
]

NAVY = "1A3A6B"
GOLD = "C3A253"
CREAM = "F7F3EA"
CONFLICT_FILL = "FBE4E1"
GROUP_FILL = "EFE7D3"
HEADER_FILL = NAVY


def style_header(ws, ncols):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=1, column=c)
        cell.font = Font(bold=True, color="FFFFFF", size=10, name="맑은 고딕")
        cell.fill = PatternFill("solid", fgColor=HEADER_FILL)
        cell.alignment = Alignment(vertical="center", horizontal="center", wrap_text=True)
    ws.row_dimensions[1].height = 32
    ws.freeze_panes = "A2"


def build_main_sheet(wb):
    ws = wb.active
    ws.title = "사역팀 확인"
    ws.append(HEADER)
    style_header(ws, len(HEADER))

    thin = Side(style="thin", color="D9CFB0")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    prev_committee = None
    for i, (committee, group, team, kind, option, conflict) in enumerate(ROWS, start=1):
        r = ws.max_row + 1
        ws.append([
            i, committee, group, team, KIND_LABEL[kind], "", "", option, conflict,
            "", "", "", "",
        ])
        band = GROUP_FILL if committee != prev_committee and (i % 2 == 0) else None
        for c in range(1, len(HEADER) + 1):
            cell = ws.cell(row=r, column=c)
            cell.border = border
            cell.font = Font(size=10, name="맑은 고딕")
            cell.alignment = Alignment(vertical="center", wrap_text=(c in (4, 6, 7, 8, 9, 10, 13)))
            if kind == "appoint":
                cell.fill = PatternFill("solid", fgColor="ECECEC")
        if conflict:
            for c in range(1, len(HEADER) + 1):
                ws.cell(row=r, column=c).fill = PatternFill("solid", fgColor=CONFLICT_FILL)
        if committee != prev_committee:
            ws.cell(row=r, column=2).font = Font(bold=True, size=10, name="맑은 고딕", color=NAVY)
        prev_committee = committee

    widths = [6, 22, 14, 22, 10, 20, 26, 22, 30, 22, 12, 14, 20]
    for idx, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = w

    ws.auto_filter.ref = f"A1:{get_column_letter(len(HEADER))}{ws.max_row}"

    dv = DataValidation(type="list", formula1='"유지,이름 수정,신설,폐지"', allow_blank=True)
    dv.error = "목록에서 골라주세요"
    dv.prompt = "유지 / 이름 수정 / 신설 / 폐지 중 선택"
    ws.add_data_validation(dv)
    dv.add(f"K2:K{ws.max_row}")

    return ws


def build_notice_sheet(wb):
    ws = wb.create_sheet("임명직 전용 부서")
    ws.append(["부서", "안내"])
    style_header(ws, 2)
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


def build_guide_sheet(wb):
    ws = wb.create_sheet("안내", 0)
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 4
    ws.column_dimensions["B"].width = 96

    def put(row, text, size=11, bold=False, color="262A33", wrap=True):
        cell = ws.cell(row=row, column=2, value=text)
        cell.font = Font(size=size, bold=bold, color=color, name="맑은 고딕")
        cell.alignment = Alignment(vertical="top", wrap_text=wrap)
        return cell

    put(2, "2026 사역신청 — 부서 확인 양식", size=18, bold=True, color=NAVY)
    put(4, "종이 「2026 사역신청서」와 「2026년도 교회부서 조직」(인사표) 두 문서를 대조해 만든 사역팀 초안입니다. "
            "이 파일에서 우리 부서 자리를 확인·수정해 주시면, 그 내용이 앱(성경말씀 암송 앱) 사역신청 화면의 최종 목록이 됩니다.",
        size=11)
    put(6, "사용 방법", size=13, bold=True, color=NAVY)
    put(7, "1. 「사역팀 확인」 시트에서 화면 위 필터로 우리 부서만 골라 봅니다(B열 '위원회/부서').")
    put(8, "2. 각 사역팀명이 2026년 실제 명칭과 같은지 확인합니다.")
    put(9, "3. F열 '사역 시간·요일'과 G열 '하는 일'을 채워 주세요 — 이 둘은 "
            "모든 행이 비어 있습니다(2026-09-07 추가). 성도가 앱에서 사역을 고를 때 "
            "이름만 보고는 판단할 수 없어(예: 오병이어 1팀·2팀이 무엇이 다른지) "
            "이번에 함께 걷습니다. 짧게만 적어 주셔도 됩니다(예: '매주 화 오전 10시', "
            "'주일 예배 전 주차 안내').")
    put(10, "4. J열 '확정 표기명'에 2026년 최종 명칭을 적어 주세요(그대로면 D열과 동일하게 적어도 됩니다).")
    put(11, "5. K열 '변경여부'는 목록에서 유지 / 이름 수정 / 신설 / 폐지 중 하나를 골라 주세요.")
    put(12, "6. L열에 확인하신 분 성함을, M열에는 그 밖에 전달할 내용을 적어 주세요.")
    put(14, "색이 칠해진 자리", size=13, bold=True, color=NAVY)
    put(15, "▨ 분홍색 행 — 두 원본 문서(인사표·신청서)의 표기가 서로 달라 어느 쪽이 맞는지 확인이 필요한 자리입니다. "
             "I열 '확인이 필요한 사유'에 무엇이 다른지 적어 두었습니다.")
    put(16, "▨ 회색 행 — 신청이 아니라 지명으로 맡는 임명직입니다. 성도가 직접 신청하지 않으므로 앱의 신청 목록에는 넣지 않습니다. "
             "이름이 맞는지만 확인해 주세요(시간·요일은 안 채우셔도 됩니다).")
    put(18, "임명직만 있어 개별 사역팀이 없는 부서(M-12부·재정부·감사위원회 등)는 "
             "「임명직 전용 부서」 시트에 따로 안내했습니다.")
    put(20, "문의: 제자양육부 신앙운동팀", size=10, color="5C6070")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    wb = Workbook()
    build_main_sheet(wb)
    build_notice_sheet(wb)
    build_guide_sheet(wb)
    wb.save(OUT_XLSX)

    seed = [
        {
            "committee": c, "group": g, "team": t, "kind": k,
            "schedule_note": "", "desc_note": "",   # 부서 확인 뒤 채워진다(2026-09-07 자리 마련)
            "option_note": o, "conflict_note": cf,
        }
        for (c, g, t, k, o, cf) in ROWS
    ]
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(seed, f, ensure_ascii=False, indent=2)

    print(f"작성 완료: {os.path.abspath(OUT_XLSX)}")
    print(f"원본 데이터: {os.path.abspath(OUT_JSON)}")
    print(f"총 {len(ROWS)}개 사역팀 항목, 임명직 전용 안내 부서 {len(APPOINT_ONLY_NOTICES)}개")


if __name__ == "__main__":
    main()
