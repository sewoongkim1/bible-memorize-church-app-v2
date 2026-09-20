// 2027 사역신청 — 「진행 공유 · 기획(안) · 사역 어드민 들어가는 방법」 Word 문서
//   node tools/ministry-progress-docx.js   →  ministry/2027_사역신청_진행공유_기획안.docx
//
// ⚠️ **그림 여섯 장이 먼저 있어야 한다**(DIR 아래). 만드는 법:
//   ① p1_shots.png · p2_shots.png — 묶음 PDF 1·2쪽에서 잘라낸다(pymupdf, dpi 220):
//        1쪽 오른쪽 칸 Rect(286,176,566,756) · 2쪽 시안 Rect(30,472,566,786)
//   ② a1~a4 — `python tools/ministry-admin-shots.py`(개발 DB·시험 계정으로 찍는다)
// ⚠️ 실명이 찍히면 안 된다 — 개발 DB 시험 계정(사랑 1목장 · 사역담당시험)으로만 찍는다.
// ⚠️ npm 꾸러미 `docx` 가 필요하다: 그 폴더에서 `npm install docx`.
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  ImageRun, PageBreak, Footer, PageNumber, ExternalHyperlink,
} = require('docx');

const DIR = 'C:/Users/sewki/AppData/Local/Temp/claude/c--Projects-bible-memorize-church-app-v2/00d2bd19-8943-4271-9ad2-8e9f9b3a2a43/scratchpad/word/';
const OUT = 'C:/Projects/bible-memorize-church-app-v2/ministry/2027_사역신청_진행공유_기획안.docx';

const NAVY = '1A3A6B', GOLD = '8A6A1E', GRAY = '5B6472', LINE = 'DDE3EE';
const FONT = '맑은 고딕';
const CONTENT = 9026;           // A4 본문 폭(DXA) — 좌우 여백 1134 기준

const t = (text, o = {}) => new TextRun({ text, font: FONT, ...o });
const p = (text, o = {}) => new Paragraph({
  children: Array.isArray(text) ? text : [t(text, o.run || {})],
  spacing: { after: o.after ?? 120, line: o.line ?? 300 },
  alignment: o.align, heading: o.heading, border: o.border,
});

// 제목 — 색 띠 대신 아래 선 하나(Word 에서 지우기 쉽게)
const h1 = (text, sub) => [
  new Paragraph({
    children: [t(text, { size: 34, bold: true, color: NAVY })],
    spacing: { before: 0, after: sub ? 40 : 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 6 } },
  }),
  ...(sub ? [p([t(sub, { size: 18, color: GRAY })], { after: 200 })] : []),
];
const h2 = (text) => new Paragraph({
  children: [t(text, { size: 24, bold: true, color: NAVY })],
  spacing: { before: 260, after: 120 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 4 } },
});

// 두 칸 표 — 왼쪽 이름, 오른쪽 설명
function twoCol(rows, opt = {}) {
  const left = opt.left ?? 2400;
  return new Table({
    columnWidths: [left, CONTENT - left],
    width: { size: CONTENT, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: rows.map(([a, b]) => new TableRow({
      children: [
        new TableCell({
          width: { size: left, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: 'F7F9FC' },
          margins: { top: 100, bottom: 100, left: 140, right: 100 },
          children: [p([t(a, { size: 20, bold: true, color: NAVY })], { after: 0, line: 280 })],
        }),
        new TableCell({
          width: { size: CONTENT - left, type: WidthType.DXA },
          margins: { top: 100, bottom: 100, left: 140, right: 140 },
          children: [p([t(b, { size: 19, color: '333333' })], { after: 0, line: 300 })],
        }),
      ],
    })),
  });
}

// 그림 — 폭에 맞춰 비율대로
function picture(file, widthPt, hint) {
  const png = fs.readFileSync(DIR + file);
  // PNG 헤더에서 크기를 읽는다
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  const width = widthPt, height = Math.round(widthPt * h / w);
  return new Paragraph({
    children: [new ImageRun({ type: 'png', data: png, transformation: { width, height } })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: hint ? 40 : 160 },
  });
}
const caption = (text) => p([t(text, { size: 17, color: GRAY, italics: true })],
  { align: AlignmentType.CENTER, after: 200 });

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 20 }, paragraph: { spacing: { line: 300 } } } } },
  sections: [{
    properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          children: [t('오직 성경, 말씀이 답이다!  ·  고척교회  ·  ', { size: 16, color: GRAY }),
                     new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: GRAY })],
          alignment: AlignmentType.CENTER,
        })],
      }),
    },
    children: [
      // ═══ 1쪽 — 진행 공유 ═══
      ...h1('2027 사역신청 진행 공유', '방송전산부 전산팀 · 2026년 9월 17일 · 9월 8일 「2027 사역신청서 기획(안)」 다음 판'),
      p('기획(안)에서 말씀드린 온라인 사역신청을 성경말씀 암송 앱 안에 만들었습니다. 성도님 화면과 담당자 기본 화면이 운영 서버에 올라가 있고, 아래 테스트 URL로 직접 눌러 보실 수 있습니다. 지금은 담당 목사님·팀장님과 임명까지의 세부 절차를 기획하고 있습니다.',
        { run: { size: 19 }, after: 200 }),

      h2('진행 단계'),
      twoCol([
        ['✓  기획(안) 공유', '9월 8일'],
        ['✓  앱 화면 만들기', '성도 화면 · 담당자 기본 화면 — 운영 서버에 올렸습니다'],
        ['●  지금', '사역신청 세부 절차 기획 — 담당 목사님 · 팀장님'],
        ['10월', '부서 자료 받기 — 사역팀마다 「사역팀 소개서」 한 장'],
        ['', '관리자 기능 만들기 — 정해진 절차에 맞춰 접수 · 임명 기능을 완성합니다'],
        ['12월 중순', '성도님 신청 — 신청 기간에만 첫 화면에 사역신청 단추가 보입니다'],
        ['신청 뒤', '접수 · 임명 — 임명이 확정되면 앱 알림을 켜 두신 분께 알림이 갑니다'],
      ], { left: 2200 }),

      h2('만들어진 것'),
      twoCol([
        ['성도 화면', '부서를 펼쳐 팀을 고르고(최대 3개) 직분·휴대폰을 확인해 제출합니다. 낸 뒤에는 진행 상황을 앱에서 봅니다.'],
        ['담당자 화면 (기본)', '신청을 상태별로 보고(신청완료 → 접수완료 → 임명확정 · 미채택) 팀 설명을 고칩니다.'],
        ['부서 자료 양식(종이)', '「부서 소개서」 · 팀당 한 장 「사역팀 소개서」와 작성 예시. 적어 주신 내용이 ⑤의 설명이 됩니다.'],
      ]),

      h2('앞으로 해야 할 일'),
      twoCol([
        ['1. 임명까지 사역신청 세부 절차 기획', '신청 → 접수 → 임명 확정까지 누가 언제 무엇을 할지 정합니다. 관리자 기능의 기준이 됩니다.'],
        ['2. 부서 자료 배부 및 취합', '10월에 두 소개서를 부서에 나눠 드리고 모읍니다.'],
      ], { left: 3200 }),

      h2('테스트 URL'),
      new Paragraph({
        children: [
          new ExternalHyperlink({
            children: [t('https://gocheok.onlybible.kr/?preview=ministry', { size: 20, bold: true, color: NAVY, underline: {} })],
            link: 'https://gocheok.onlybible.kr/?preview=ministry',
          }),
        ],
        spacing: { after: 60 },
      }),
      p('앱에 로그인한 뒤 이 주소로 열면 첫 화면 「함께」 묶음에 사역신청 단추가 보입니다. 시험으로 낸 신청도 저장되고 취소해 볼 수 있습니다 — 시험 신청은 실제 신청 전에 정리합니다.',
        { run: { size: 18, color: GRAY }, after: 200 }),

      new Paragraph({ children: [new PageBreak()] }),
      h2('성도님이 보시는 화면 (실제 앱)'),
      p('담당자 미리보기로 찍었습니다. 방송실 운영 설명은 작성 예시로 넣은 값이고, 다른 팀 설명은 부서 자료를 받기 전이라 예시입니다. 휴대폰 번호는 가짜입니다.',
        { run: { size: 18, color: GRAY }, after: 100 }),
      picture('p1_shots.png', 285, true),
      caption('① 첫 화면 · ② 조건으로 빠르게 찾기 · ③ 부서별로 펼쳐 보기 · ④ 팀 고르기 · ⑤ 자세히 보기(방송실 운영) · ⑥ 신청 확인 → 제출'),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══ 2쪽 — 기획(안) ═══
      ...h1('2027 사역신청서 기획(안)', '방송전산부 전산팀'),
      p('해마다 종이로 걷던 「사역신청서」를 온라인 + 오프라인 두 갈래로 함께 받는 안입니다. 온라인은 성도님이 이미 쓰고 계신 성경말씀 암송 앱에서 섬길 사역을 신청하고, 내 신청이 어디까지 진행됐는지 그 자리에서 확인하시게 하는 것입니다. 신청한 뒤 결과를 따로 찾아보지 않으셔도 되고, 부서도 지원 현황을 제때 볼 수 있습니다.',
        { run: { size: 19 }, after: 200 }),

      h2('개선이 필요한 사항'),
      twoCol([
        ['정보가 부족해 신청이 어렵습니다', '회중이 이미 알고 있다는 전제로 걷혀 온 방식이라, 처음 신청하시는 분이나 새가족은 어느 사역을 고를지 판단하기 어렵습니다.'],
        ['집계가 사람 손을 거칩니다', '제출된 신청서를 부서별로 분류하고 엑셀로 옮기는 작업이 매년 반복됩니다. 사역신청 정보가 담당부서에 제때 전달되지 않은 경우가 있습니다.'],
        ['구조가 복잡한데 안내는 종이 한 장(A5)뿐', '위원회 → 부서 → 팀, 다시 「2부/3부/오후」 선택까지 있어(찬양부·전도부 등) 혼자 정확히 표기하기는 쉽지 않습니다.'],
      ], { left: 3200 }),

      h2('확인 · 결정을 부탁드립니다'),
      twoCol([
        ['의사 결정 사항', '사역신청서를 온라인으로도 받을지 결정이 필요합니다. 진행하는 것으로 정해지면, 요구사항 정리와 구현에 필요한 기간이 있어 9월 중에 착수하여 12월 초에 완료하는 일정이 됩니다.'],
        ['확인 사항', '이 사역신청서는 교적시스템과 별개로 만들어집니다. 신청 내용을 교적에 남기려면 교적시스템에는 따로 입력해야 합니다.'],
      ], { left: 2400 }),

      h2('성도님이 보게 될 화면 (시안)'),
      p('암송 앱 안에서 부서 고르기 → 우선순위 확인 → 제출 세 걸음으로 끝납니다. 이름·교구·목장은 로그인 정보로 이미 채워져 있어 다시 적지 않으셔도 됩니다. 팀 이름은 실제 자료이고, 시간·설명은 부서 확인 전이라 예시로 넣었습니다.',
        { run: { size: 18, color: GRAY }, after: 100 }),
      picture('p2_shots.png', 420, true),
      caption('① 부서 고르기(아코디언) · ② 우선순위 확인(최대 3개, 순서대로) · ③ 제출 완료 — 진행 현황을 바로 확인'),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══ 3쪽 — 사역 어드민 들어가는 방법 ═══
      ...h1('사역 어드민 들어가는 방법', '담당자용 · 폰에서 네 걸음'),
      p([t('사역신청 담당자는 앱에 먼저 로그인한 뒤, 설정에서 관리 페이지로 들어갑니다. 암호만 넣으면 되고, 교구·목장·이름은 앱 로그인 정보를 그대로 씁니다. 관리자 암호가 아니라 ', { size: 19 }),
          t('사역신청 암호', { size: 19, bold: true, color: NAVY }),
          t('를 씁니다.', { size: 19 })], { after: 160 }),

      twoCol([
        ['먼저 할 것', '① 앱(gocheok.onlybible.kr)에 평소 쓰시는 교구·목장·이름으로 로그인 ② 담당자로 등록되어 있어야 합니다(관리자에게 요청)'],
        ['필요한 것', '사역신청 암호 한 가지 — 관리자 암호와 다릅니다'],
      ], { left: 2200 }),

      h2('1. 설정 → 「🔒 관리 페이지」'),
      p('앱 첫 화면 아래 ⚙️ 설정으로 들어가 맨 아래쪽 「🔒 관리 페이지」를 누릅니다.',
        { run: { size: 18, color: GRAY }, after: 80 }),
      picture('a1_settings.png', 300, true),
      caption('설정 화면 — 「🔒 관리 페이지」'),

      h2('2. 「🤝 사역관리 페이지」 고르기'),
      p('관리 화면에는 두 가지가 있습니다. 사역신청 담당자는 위쪽 「🤝 사역관리 페이지」로 들어갑니다(아래 「📊 관리자 페이지」는 관리자용입니다).',
        { run: { size: 18, color: GRAY }, after: 80 }),
      picture('a2_manage.png', 300, true),
      caption('관리 메뉴 — 사역관리 페이지 · 관리자 페이지'),

      h2('3. 사역신청 암호 넣기'),
      p('앱에 로그인한 정보가 위에 보입니다. 다른 분 이름이 보이면 앱에서 로그인을 바꿔 주세요. 암호 한 칸만 넣고 「로그인」을 누릅니다.',
        { run: { size: 18, color: GRAY }, after: 80 }),
      picture('a3_login.png', 235, true),
      caption('사역신청 관리 로그인 — 암호만 넣습니다'),

      new Paragraph({ children: [new PageBreak()] }),
      h2('4. 사역 메뉴 넷'),
      p('들어가면 네 가지가 보입니다. 사역신청 자료만 보이고 다른 관리자 메뉴는 보이지 않습니다.',
        { run: { size: 18, color: GRAY }, after: 80 }),
      twoCol([
        ['🤝 사역신청 현황', '신청 건(팀마다 한 건)을 보고 상태를 바꿉니다 — 신청 → 접수 → 임명 / 취소'],
        ['🎉 임명현황', '임명된 분만 모아 부서별·교구별·사람별로 보고 CSV로 내려받습니다'],
        ['📋 종이 명단 올리기', '종이로 받은 명단을 엑셀에서 붙여넣거나 파일째 올립니다'],
        ['🗂️ 사역팀 정보', '성도님 화면에 보이는 팀 설명·시간·담당(문의)을 고칩니다'],
      ], { left: 2800 }),
      picture('a4_menu.png', 225, true),
      caption('사역 담당자 메뉴 — 넷만 보입니다'),

      h2('막힐 때'),
      twoCol([
        ['「암호가 다르거나 등록된 담당자가 아닙니다」', '암호를 다시 확인하고, 그래도 안 되면 관리자에게 담당자 등록을 요청해 주세요(교구·목장·이름이 앱 로그인과 같아야 합니다).'],
        ['「앱에 먼저 로그인해 주세요」가 보일 때', '이 기기에서 앱 로그인이 풀린 것입니다. 앱을 열어 로그인한 뒤 다시 들어오세요.'],
        ['화면이 옛것처럼 보일 때', '브라우저를 한 번 새로고침해 주세요.'],
      ], { left: 3400 }),
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log('wrote:', OUT, buf.length, 'bytes'); });
