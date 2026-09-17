# 사역신청 — 「종이 명단 올리기」에 붙여넣을 엑셀 양식 (2026-09-18)
#   담당자가 종이 신청서를 이 표에 옮겨 적고, 칸을 통째로 복사해
#   관리 페이지 → 사역신청 → 「종이 명단 올리기」에 붙여넣는다.
#
# ⚠️ 칸 차례를 바꾸지 말 것 — 화면은 **차례대로** 읽는다(머리글 이름이 아니라 위치를 본다).
# ⚠️ 교구·목장·이름은 앱 로그인과 **똑같이** 적어야 한 사람으로 이어진다.
#
#   python tools/ministry-paper-xlsx-gen.py
import os
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'ministry', '2027_사역명단_올리기_양식.xlsx')

COLS = [
    ('교구', 10, '화평', '앱 로그인과 똑같이 (믿음·소망·사랑·섬김·은혜·화평·기쁨·새가족)'),
    ('목장', 8, '20', '숫자만 적어도 됩니다 (20 = 20목장)'),
    ('이름', 12, '홍길동', '앱 로그인과 똑같이 — 한 글자만 달라도 다른 분이 됩니다'),
    ('직분', 12, '안수집사', '성도·집사·권사·안수집사·장로·전도사·목사·사모·학생'),
    ('휴대폰', 16, '010-1234-5678', '본인 확인·중복 찾기에 씁니다 (임명·취소로 넣으면 저장 뒤 지워집니다)'),
    ('사역팀', 20, '신앙운동', '사역 목록에 있는 이름 그대로'),
    ('위원회(선택)', 18, '제자양육부', '같은 이름의 사역팀이 둘 이상일 때만 적어 주세요'),
    ('하위 선택(선택)', 18, '', '「어와나 택1」처럼 고르는 것이 있을 때만'),
]
SAMPLES = [
    ['화평', '20', '홍길동', '집사', '010-1234-5678', '신앙운동', '제자양육부', ''],
    ['사랑', '3', '이영희', '권사', '010-2345-6789', '방송실 운영', '방송전산부', ''],
    ['믿음', '7', '박철수', '집사', '010-3456-7890', '운영', '새가족부', ''],
]
POSITIONS = '성도,집사,권사,안수집사,장로,전도사,목사,사모,학생'

NAVY = '1A3A6B'
thin = Side(style='thin', color='C9D2E3')
box = Border(left=thin, right=thin, top=thin, bottom=thin)

wb = Workbook()

# ── ① 명단 ─────────────────────────────────────────────────────────
ws = wb.active
ws.title = '명단'
ws.append([c[0] for c in COLS])
for i, (name, width, _ex, _note) in enumerate(COLS, start=1):
    cell = ws.cell(row=1, column=i)
    cell.font = Font(bold=True, color='FFFFFF', size=11)
    cell.fill = PatternFill('solid', fgColor=NAVY)
    cell.alignment = Alignment(horizontal='center', vertical='center')
    cell.border = box
    ws.column_dimensions[chr(64 + i)].width = width
ws.row_dimensions[1].height = 24

for row in SAMPLES:
    ws.append(row)
grey = Font(color='9AA3B2', italic=True)
for r in range(2, 2 + len(SAMPLES)):
    for c in range(1, len(COLS) + 1):
        cell = ws.cell(row=r, column=c)
        cell.font = grey                 # 예시 줄은 흐리게 — 지우고 쓰시라는 뜻
        cell.border = box
        cell.alignment = Alignment(vertical='center')
ws.cell(row=2 + len(SAMPLES), column=1,
        value='↑ 위 세 줄은 예시입니다. 지우고 적어 주세요. (머리글 줄은 그대로 복사하셔도 됩니다)')
ws.cell(row=2 + len(SAMPLES), column=1).font = Font(color='A33A3A', bold=True, size=10)

# 직분은 고르게 — 「집사님」·「집사 」가 섞이면 줄이 통째로 되돌아온다
dv = DataValidation(type='list', formula1='"%s"' % POSITIONS, allow_blank=True,
                    errorTitle='직분', error='목록에서 골라 주세요')
ws.add_data_validation(dv)
dv.add('D2:D300')
# 휴대폰은 글자로 — 010 의 0 이 사라지지 않게
for r in range(2, 301):
    ws.cell(row=r, column=5).number_format = '@'
ws.freeze_panes = 'A2'

# ── ② 적는 법 ──────────────────────────────────────────────────────
gs = wb.create_sheet('적는 법')
gs.column_dimensions['A'].width = 18
gs.column_dimensions['B'].width = 72
lines = [
    ('', '2027 사역명단 올리기 — 적는 법'),
    ('', ''),
    ('어디에 쓰나', 'gocheok.onlybible.kr → 설정 → 관리 페이지 → 사역관리 → 「종이 명단 올리기」'),
    ('어떻게', '「명단」 시트에서 적은 칸을 통째로 복사해(Ctrl+C) 화면의 큰 칸에 붙여넣기(Ctrl+V)'),
    ('', '「붙여넣은 것 살펴보기」를 누르면 줄마다 판정이 나옵니다. 고칠 것이 없으면 「명단 넣기」.'),
    ('', ''),
    ('⚠️ 가장 중요', '교구·목장·이름은 앱 로그인과 똑같이 — 한 글자만 달라도 다른 분이 됩니다.'),
    ('', '앱에 없는 분이면 계정을 새로 만듭니다. 나중에 그분이 앱에 로그인하면 이 명단이 그대로 보입니다.'),
    ('', ''),
    ('상태', '종이는 이미 정해진 명단이라 화면에서 「임명」으로 넣는 것이 기본입니다.'),
    ('', '「취소」로 넣으려면 사유를 함께 적어 주세요(관리자만 봅니다).'),
    ('겹칠 때', '앱으로 이미 낸 신청과 겹치면 새로 넣지 않고 그 건의 상태만 바꿉니다.'),
    ('', '이미 같은 상태인 줄은 손대지 않습니다 — 같은 명단을 두 번 올려도 안전합니다.'),
    ('알림', '올릴 때는 앱 알림이 가지 않습니다. 알림이 필요하면 현황 화면에서 한 분씩 눌러 주세요.'),
    ('한 번에', '300줄까지. 더 많으면 나누어 올려 주세요.'),
    ('', ''),
    ('칸 설명', ''),
]
for name, _w, ex, note in COLS:
    lines.append((name, note + (('   예) ' + ex) if ex else '')))
for i, (a, b) in enumerate(lines, start=1):
    gs.cell(row=i, column=1, value=a).font = Font(bold=True, color=NAVY, size=11)
    c = gs.cell(row=i, column=2, value=b)
    c.alignment = Alignment(wrap_text=True, vertical='center')
    if i == 1:
        c.font = Font(bold=True, size=14, color=NAVY)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
wb.save(OUT)
print('wrote:', os.path.relpath(OUT, ROOT))
