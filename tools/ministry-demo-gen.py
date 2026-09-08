# -*- coding: utf-8 -*-
"""2027 사역신청 데모 — 파일 하나만 열면 혼자 돌아가는 시연용 프로그램.

■ 왜 만드는가
  기획(안)의 종이 시안은 「이런 화면이 나옵니다」까지만 보여준다. 결정하시는
  분이 실제로 눌러 보면 판단이 훨씬 빠르다 — 최대 3개 제한이 어떻게 걸리는지,
  임명직이 왜 눌리지 않는지, 제출 뒤 진행 현황이 어떻게 보이는지는 글로
  설명하는 것보다 한 번 눌러 보는 편이 낫다.

■ 「단독 수행」의 뜻 — 이 파일은 다음을 하나도 요구하지 않는다
  - 서버·인터넷 (fetch·CDN·웹폰트를 쓰지 않는다. 글꼴은 윈도우 기본 맑은 고딕)
  - 로그인·계정 (내 정보는 화면에서 직접 넣는다)
  - 데이터베이스 (신청 내용은 브라우저 localStorage 에만 남는다)
  더블클릭으로 열면 그대로 돌아간다. 카톡·메일로 파일만 보내도 된다.
  ⚠️ file:// 로 열기 때문에 JSON 을 fetch 로 읽을 수 없다 — 그래서 사역팀
  목록을 HTML 안에 통째로 박아 넣는다(이 생성기가 하는 일).

■ 데이터
  ministry/ministry_catalog_2027_draft.json 하나만 읽는다. 팀 이름이 바뀌면
  이 생성기를 다시 돌리면 된다.
  ⚠️ 시간 예시(SCHEDULE_EXAMPLES)는 표 형식 시안 생성기와 같은 값을 쓴다 —
  부서 확인 전이라 실제 시간이 아니고, 화면에도 「예시」라고 적어 둔다.
  실제로 확인된 값(찬양부 schedule_note)은 예시로 덮지 않는다.

사용법: python tools/ministry-demo-gen.py
출력:   ministry/2027_사역신청_데모.html
"""
import io, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
OUT_DIR = os.path.join(ROOT, 'ministry')
CATALOG = os.path.join(OUT_DIR, 'ministry_catalog_2027_draft.json')

# ⚠️ 부서 확인이 끝나면 확정본(ministry_catalog_2027.json)이 생긴다 —
#    있으면 그것을, 없으면 초안을 읽는다(tools/ministry-merge-replies.py 가 만든다).
_FINAL = os.path.join(OUT_DIR, 'ministry_catalog_2027.json')
CATALOG = _FINAL if os.path.exists(_FINAL) else CATALOG
OUT_HTML = os.path.join(OUT_DIR, '2027_사역신청_데모.html')

with io.open(CATALOG, encoding='utf-8') as f:
    ROWS = json.load(f)

# 부서 확인 전 자리 채우기용 예시 — tools/ministry-apply-form-table-gen.py 와 같은 값.
# (실제 시간이 아니므로 화면에 「예시」로 표시한다)
SCHEDULE_EXAMPLES = {
    ("교육위원회", ""): "비정기 (부서 협의)",
    ("교육위원회", "사랑부·어와나"): "주일 오후 1:30",
    ("교육위원회", "미취학"): "주일 오전 10:40",
    ("교육위원회", "아동"): "주일 오전 10:40",
    ("교육위원회", "청소년"): "주일 오전 11:00",
    ("교육위원회", "장년"): "주중 화요일 오전 10:00",
    ("교회봉사부", ""): "주일 예배 전후",
    ("문화스포츠부", ""): "월 1회 (요일 협의)",
    ("방송전산부", ""): "주일 예배 시간",
    ("새가족부", ""): "주일 오전",
    ("선교부", ""): "월 1회 정기모임",
    ("예배부", ""): "주일 예배 30분 전",
    ("제자양육부", ""): "주중 저녁 (요일 협의)",
    ("전도부", ""): "요일 협의",
    ("차량부", ""): "주일 예배 시간",
    ("찬양부", "찬양팀"): "토요일 오후 리허설",
    ("찬양부", ""): "예배 전 기도",
    ("희망의복지재단(사회봉사센터)", ""): "주중 (요일 협의)",
    ("L-12(목양부)", ""): "월 1회",
    ("총무부", ""): "비정기",
    ("시설부", ""): "주중 비정기",
}

# ── 화면에 넣을 목록으로 손질 ────────────────────────────────────
teams = []
for i, r in enumerate(ROWS):
    sched, is_example = r["schedule_note"], False
    if not sched and r["kind"] == "apply":
        sched = SCHEDULE_EXAMPLES.get((r["committee"], r["group"]),
                                       SCHEDULE_EXAMPLES.get((r["committee"], ""), ""))
        is_example = bool(sched)
    teams.append({
        "id": i,
        "committee": r["committee"],
        "group": r["group"],
        "name": r["team"],
        "appoint": r["kind"] == "appoint",
        "sched": sched,
        "ex": is_example,
        "opt": r["option_note"],
    })

PRINCIPLES = [
    "등록식 후 <b>3개월 이상 성실히 출석</b>한 성도만 신청할 수 있습니다.",
    "한 분이 신청할 수 있는 사역은 <b>최대 3개</b>입니다(자치회장도 계수에 포함합니다).",
    "부장·팀장·회계·찬양대지휘자·자치회장은 <b>다른 부서의 같은 성격 사역을 겸직</b>할 수 없습니다.",
    "<b>교사와 찬양대원은 겸직</b>할 수 없습니다(새하늘찬양대는 예외입니다).",
    "신청 후 <b>임명을 받아야</b> 사역을 시작합니다 — 확정 여부는 게시판에서 확인해 주세요.",
    "사역 신청은 <b>해마다 다시</b> 받습니다.",
]

HTML = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>2027 사역신청 데모</title>
<style>
/* 색·부품은 앱(style.css)의 실제 값을 그대로 쓴다 */
:root{
  --navy:#1a3a6b; --navy-dark:#0d1b3e; --gold:#c8a84b; --gold-deep:#8a6a1e;
  --cream:#fdf8f0; --white:#fff; --gray:#6b7280; --light:#f3f0ea; --border:#ddd6c8;
  --ok:#2c5f2d;
}
*{box-sizing:border-box}
body{margin:0; background:#e9e4d8; color:#222;
  font-family:"맑은 고딕","Malgun Gothic",-apple-system,"Apple SD Gothic Neo",sans-serif;}
.demo-bar{background:#3a2f10; color:#f7edd0; font-size:13px; padding:8px 14px;
  display:flex; align-items:center; gap:10px; flex-wrap:wrap;}
.demo-bar b{color:#ffd970}
.demo-bar .sp{flex:1}
.demo-bar button{font:inherit; font-size:12px; font-weight:700; color:#3a2f10; background:#f0dfa8;
  border:none; border-radius:7px; padding:5px 11px; cursor:pointer;}
.demo-bar button:hover{background:#ffe9b0}

.app{max-width:430px; margin:0 auto; min-height:100vh; background:var(--cream);
  box-shadow:0 0 26px rgba(0,0,0,.14); display:flex; flex-direction:column;}
.hd{display:flex; align-items:center; gap:8px; padding:12px 16px 8px; position:sticky; top:0;
  background:var(--cream); z-index:5;}
.hd .back{padding:7px 13px; border:1px solid var(--border); border-radius:9px; background:var(--cream);
  color:var(--navy); font-size:14px; font-weight:700; cursor:pointer;}
.hd .back[hidden]{display:none}
.hd .ttl{flex:1; text-align:center; font-size:15px; font-weight:800; color:var(--navy);}
.hd .count{font-size:12px; font-weight:700; color:var(--gold-deep); background:#faf1d3;
  border-radius:999px; padding:5px 11px; white-space:nowrap;}
.body{flex:1; padding:4px 16px 120px;}
h2.st{font-size:18px; font-weight:800; color:var(--navy); margin:10px 4px 4px;}
p.sub{font-size:13.5px; color:var(--gray); margin:0 4px 14px; line-height:1.6;}

.card{background:var(--white); border:1px solid var(--border); border-radius:12px;
  padding:14px 15px; margin-bottom:12px;}
.card h3{margin:0 0 8px; font-size:14.5px; color:var(--navy);}
.card ol{margin:0; padding-left:18px; font-size:13.5px; line-height:1.75;}
.card li b{color:var(--gold-deep)}

.field{display:flex; align-items:center; gap:10px; margin-bottom:10px;}
.field label{width:74px; font-size:13.5px; font-weight:700; color:var(--navy); flex:none;}
.field input{flex:1; font:inherit; font-size:15px; padding:10px 12px; border:1px solid var(--border);
  border-radius:10px; background:var(--white); min-width:0;}
.hint{font-size:12.5px; color:var(--gray); background:#fbf5e6; border:1px solid #ecd9a8;
  border-radius:10px; padding:10px 12px; line-height:1.6; margin-bottom:14px;}

.acc{display:flex; flex-direction:column; gap:9px;}
.acc-item{border:1.5px solid var(--navy); border-radius:12px; overflow:hidden; background:var(--white);}
.acc-head{display:flex; align-items:center; justify-content:space-between; gap:8px;
  padding:13px 14px; font-size:15px; font-weight:700; color:var(--navy); cursor:pointer;
  background:var(--white); border:none; width:100%; text-align:left; font-family:inherit;}
.acc-item.open .acc-head{background:var(--navy); color:#fff;}
.acc-head .n{font-size:12px; font-weight:700; opacity:.85;}
.acc-body{padding:9px; display:flex; flex-direction:column; gap:7px; border-top:1px solid var(--border);}
.grp{font-size:12px; color:var(--gray); font-style:italic; margin:4px 2px 0;}

.team{display:flex; align-items:center; gap:11px; padding:11px 12px; border:1.5px solid var(--border);
  border-radius:11px; background:var(--white); cursor:pointer; text-align:left; width:100%;
  font-family:inherit;}
.team.on{border-color:var(--gold); background:#fffaf0;}
.team.off{opacity:.55; cursor:not-allowed;}
/* ⚠️ .nm/.meta 는 span 이라 그냥 두면 「할렐루야찬양대찬양부 · 1부」처럼
   한 줄에 붙어 나온다 — 블록으로 세워야 두 줄로 갈린다 */
.team .info{flex:1; min-width:0}
.team .nm,.team .meta,.pri .nm,.pri .meta{display:block}
.team .nm{font-size:14.5px; font-weight:700; color:#222;}
.team .meta{font-size:12px; color:var(--gray); margin-top:3px;}
.team .meta .ex{color:#a08a4a}
.team .chk{flex:none; width:28px; height:28px; border-radius:50%; border:1.5px solid var(--border);
  display:flex; align-items:center; justify-content:center; font-size:14px; color:#fff; font-weight:800;}
.team.on .chk{border-color:var(--gold); background:var(--gold);}
.team.off .chk{background:#ccc; border-color:#aaa;}
.tag{font-size:11px; color:var(--gray); margin-left:6px;}

.pri{display:flex; align-items:center; gap:11px; padding:12px 13px; border:1.5px solid var(--border);
  border-radius:12px; background:var(--white); margin-bottom:10px;}
.pri .num{flex:none; width:28px; height:28px; border-radius:50%; background:var(--navy); color:#fff;
  font-size:14px; font-weight:800; display:flex; align-items:center; justify-content:center;}
.pri .info{flex:1; min-width:0}
.pri .nm{font-size:14.5px; font-weight:700}
.pri .meta{font-size:12px; color:var(--gray); margin-top:3px}
.pri .mv{display:flex; flex-direction:column; gap:3px}
.pri .mv button{font:inherit; font-size:12px; line-height:1; padding:5px 8px; cursor:pointer;
  border:1px solid var(--border); background:var(--white); border-radius:7px; color:var(--navy);}
.pri .mv button:disabled{opacity:.3; cursor:default}
.del{font:inherit; font-size:12px; color:#a33; background:none; border:none; cursor:pointer;
  padding:4px 6px;}

.cta-wrap{position:fixed; left:0; right:0; bottom:0; padding:12px 16px 16px;
  background:linear-gradient(180deg, rgba(253,248,240,0) 0%, var(--cream) 34%);}
.cta-in{max-width:430px; margin:0 auto;}
.cta{display:block; width:100%; padding:16px; font:inherit; font-size:16px; font-weight:800;
  text-align:center; color:#fff; background:var(--navy); border:none; border-radius:14px;
  cursor:pointer; box-shadow:0 6px 16px rgba(13,27,62,.28);}
.cta:disabled{background:#9aa3b2; box-shadow:none; cursor:default;}
.cta .s{display:block; font-size:12px; font-weight:600; opacity:.85; margin-top:3px;}
.cta.ghost{background:var(--white); color:var(--navy); border:1.5px solid var(--navy); box-shadow:none;}

.done{text-align:center; padding:26px 6px 0;}
.done .ck{width:64px; height:64px; margin:0 auto 14px; border-radius:50%; background:#eef6ef;
  color:var(--ok); font-size:32px; font-weight:800; display:flex; align-items:center; justify-content:center;}
.done h3{font-size:19px; margin:0 0 6px; color:#222}
.done p{font-size:13.5px; color:var(--gray); margin:0 0 18px; line-height:1.6}
.state{display:inline-block; font-size:12.5px; font-weight:800; border-radius:999px; padding:5px 12px;}
.state.s0{background:#eef1f8; color:var(--navy)}
.state.s1{background:#fbf1d8; color:var(--gold-deep)}
.state.s2{background:#e7f3e8; color:var(--ok)}
.state.s3{background:#f2f2f2; color:var(--gray)}
.push{background:#eef1f8; border-radius:11px; padding:12px 13px; font-size:12.5px; color:var(--navy);
  line-height:1.65; text-align:left; margin-top:14px;}

.adm{background:#fff; border:1px solid var(--border); border-radius:12px; padding:14px; margin-bottom:12px;}
.adm .who{font-size:14.5px; font-weight:800; color:var(--navy)}
.adm .li{font-size:13px; color:#333; margin-top:8px; line-height:1.6}
.adm .btns{display:flex; gap:7px; margin-top:12px; flex-wrap:wrap}
.adm .btns button{font:inherit; font-size:12.5px; font-weight:700; padding:8px 12px; border-radius:9px;
  border:1px solid var(--border); background:var(--white); color:var(--navy); cursor:pointer;}
.adm .btns button.on{background:var(--navy); color:#fff; border-color:var(--navy)}
.empty{text-align:center; color:var(--gray); font-size:13.5px; padding:40px 10px;}
</style>
</head>
<body>

<div class="demo-bar">
  <b>데모</b>
  <span>실제 신청이 아닙니다 — 이 브라우저에만 저장됩니다.</span>
  <span class="sp"></span>
  <button id="btn-admin">담당자 화면</button>
  <button id="btn-reset">처음부터</button>
</div>

<div class="app">
  <div class="hd">
    <button class="back" id="back" hidden>← 뒤로</button>
    <div class="ttl" id="title">사역 신청</div>
    <div class="count" id="count" hidden></div>
  </div>
  <div class="body" id="view"></div>
</div>

<div class="cta-wrap" id="ctaWrap" hidden><div class="cta-in" id="ctaIn"></div></div>

<script>
var TEAMS = __TEAMS__;
var PRINCIPLES = __PRINCIPLES__;
var KEY = 'ministry-demo-2027';
var STATES = ['신청완료', '검토중', '임명확정', '미채택'];

var S = load();
function load(){
  try { var v = JSON.parse(localStorage.getItem(KEY)); if (v && v.picked) return v; } catch (e) {}
  return { step:'intro', me:{gu:'', mok:'', name:''}, picked:[], submitted:false, status:0, open:null };
}
function save(){ try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

// 위원회 순서·묶음
var COMMITTEES = [];
TEAMS.forEach(function (t) { if (COMMITTEES.indexOf(t.committee) < 0) COMMITTEES.push(t.committee); });
function byId(id){ for (var i=0;i<TEAMS.length;i++) if (TEAMS[i].id === id) return TEAMS[i]; return null; }
function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function metaOf(t){
  if (!t.sched) return '';
  return esc(t.sched) + (t.ex ? ' <span class="ex">· 예시</span>' : '');
}

var view = document.getElementById('view'), titleEl = document.getElementById('title'),
    backEl = document.getElementById('back'), countEl = document.getElementById('count'),
    ctaWrap = document.getElementById('ctaWrap'), ctaIn = document.getElementById('ctaIn');

function setCta(html){
  if (!html) { ctaWrap.hidden = true; ctaIn.innerHTML = ''; return; }
  ctaWrap.hidden = false; ctaIn.innerHTML = html;
}

function render(){
  save();
  backEl.hidden = (S.step === 'intro' || S.step === 'done');
  countEl.hidden = (S.step !== 'pick');
  if (S.step === 'pick') countEl.textContent = S.picked.length + ' / 3 선택';
  ({ intro:vIntro, me:vMe, pick:vPick, order:vOrder, done:vDone, admin:vAdmin })[S.step]();
  window.scrollTo(0, 0);
}

/* ① 안내 */
function vIntro(){
  titleEl.textContent = '2027 사역 신청';
  view.innerHTML =
    '<h2 class="st">한 해 동안 섬길 자리를 정합니다</h2>' +
    '<p class="sub">아래 원칙을 먼저 읽어 주세요. 신청은 세 걸음이면 끝납니다 —' +
    ' 부서 고르기 → 우선순위 확인 → 제출.</p>' +
    '<div class="card"><h3>사역 임명 원칙</h3><ol>' +
    PRINCIPLES.map(function (p) { return '<li>' + p + '</li>'; }).join('') +
    '</ol></div>';
  setCta('<button class="cta" onclick="go(\\'me\\')">신청 시작하기</button>');
}

/* ② 내 정보 */
function vMe(){
  titleEl.textContent = '내 정보 확인';
  view.innerHTML =
    '<h2 class="st">이 정보로 신청합니다</h2>' +
    '<p class="sub">실제 앱에서는 로그인 정보로 이미 채워져 있어 적지 않으셔도 됩니다.' +
    ' 데모라서 직접 넣어 보시게 했습니다.</p>' +
    '<div class="card">' +
    '<div class="field"><label>교구</label><input id="f-gu" value="' + esc(S.me.gu) + '" placeholder="예: 사랑"></div>' +
    '<div class="field"><label>목장</label><input id="f-mok" value="' + esc(S.me.mok) + '" placeholder="예: 1목장"></div>' +
    '<div class="field"><label>이름</label><input id="f-name" value="' + esc(S.me.name) + '" placeholder="예: 홍길동"></div>' +
    '</div>' +
    '<div class="hint">전화번호는 받지 않습니다. 교구·목장·이름으로 본인을 확인합니다.</div>';
  ['f-gu','f-mok','f-name'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', function () {
      S.me = { gu: v('f-gu'), mok: v('f-mok'), name: v('f-name') };
      save();
      document.getElementById('go-pick').disabled = !(S.me.gu && S.me.mok && S.me.name);
    });
  });
  var ready = !!(S.me.gu && S.me.mok && S.me.name);
  setCta('<button class="cta" id="go-pick"' + (ready ? '' : ' disabled') +
    ' onclick="go(\\'pick\\')">사역 고르러 가기</button>');
}
function v(id){ return document.getElementById(id).value.trim(); }

/* ③ 부서 고르기 */
function vPick(){
  titleEl.textContent = '사역 신청';
  var html = '<h2 class="st">위원회에서 골라 주세요</h2>' +
    '<p class="sub">최대 3개까지 고를 수 있습니다. 회색으로 잠긴 자리는 신청이 아니라 지명(임명)으로 정해집니다.</p>' +
    '<div class="acc">';
  COMMITTEES.forEach(function (c) {
    var mine = TEAMS.filter(function (t) { return t.committee === c; });
    var picked = mine.filter(function (t) { return S.picked.indexOf(t.id) >= 0; }).length;
    var open = S.open === c;
    html += '<div class="acc-item' + (open ? ' open' : '') + '">' +
      '<button class="acc-head" onclick="toggle(\\'' + c.replace(/'/g, "\\\\'") + '\\')">' +
      '<span>' + esc(c) + (picked ? ' <span class="n">· ' + picked + '개 선택</span>' : '') + '</span>' +
      '<span class="n">' + mine.length + '팀 ' + (open ? '▴' : '▾') + '</span></button>';
    if (open) {
      html += '<div class="acc-body">';
      var lastGrp = null;
      mine.forEach(function (t) {
        if (t.group && t.group !== lastGrp) {
          html += '<div class="grp">' + esc(t.group) + (t.opt ? ' · ' + esc(t.opt) : '') + '</div>';
        }
        lastGrp = t.group;
        var on = S.picked.indexOf(t.id) >= 0;
        html += '<button class="team' + (on ? ' on' : '') + (t.appoint ? ' off' : '') + '"' +
          (t.appoint ? ' disabled' : ' onclick="pick(' + t.id + ')"') + '>' +
          '<span class="info"><span class="nm">' + esc(t.name) +
          (t.appoint ? '<span class="tag">지명</span>' : '') + '</span>' +
          (metaOf(t) ? '<span class="meta">' + metaOf(t) + '</span>' : '') + '</span>' +
          '<span class="chk">' + (on ? '✓' : '') + '</span></button>';
      });
      html += '</div>';
    }
    html += '</div>';
  });
  view.innerHTML = html + '</div>';
  setCta(S.picked.length
    ? '<button class="cta" onclick="go(\\'order\\')">고른 ' + S.picked.length + '개 확인하기</button>'
    : '<button class="cta" disabled>사역을 하나 이상 골라 주세요</button>');
}
function toggle(c){ S.open = (S.open === c ? null : c); render(); }
function pick(id){
  var i = S.picked.indexOf(id);
  if (i >= 0) S.picked.splice(i, 1);
  else if (S.picked.length >= 3) { alert('사역 임명 원칙 2번에 따라 최대 3개까지 신청할 수 있습니다.\\n먼저 고른 것을 빼고 다시 골라 주세요.'); return; }
  else S.picked.push(id);
  render();
}

/* ④ 우선순위 */
function vOrder(){
  titleEl.textContent = '신청 사역 확인';
  var html = '<h2 class="st">신청 순서대로 정리했어요</h2>' +
    '<p class="sub">위아래 화살표로 순서를 바꿀 수 있습니다. 마감 전까지 언제든 고쳐 낼 수 있습니다.</p>';
  S.picked.forEach(function (id, i) {
    var t = byId(id);
    html += '<div class="pri"><span class="num">' + (i + 1) + '</span>' +
      '<span class="info"><span class="nm">' + esc(t.name) +
      ' <span style="color:#6b7280;font-weight:500">· ' + esc(t.committee) + '</span></span>' +
      (metaOf(t) ? '<span class="meta">' + metaOf(t) + '</span>' : '') +
      '<button class="del" onclick="pick(' + id + ')">빼기</button></span>' +
      '<span class="mv">' +
      '<button onclick="move(' + i + ',-1)"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
      '<button onclick="move(' + i + ',1)"' + (i === S.picked.length - 1 ? ' disabled' : '') + '>▼</button>' +
      '</span></div>';
  });
  view.innerHTML = html;
  setCta('<button class="cta" onclick="submit()">제출하기<span class="s">신청 후 임명을 받아야 시작할 수 있어요</span></button>');
}
function move(i, d){
  var j = i + d; if (j < 0 || j >= S.picked.length) return;
  var t = S.picked[i]; S.picked[i] = S.picked[j]; S.picked[j] = t; render();
}
function submit(){ S.submitted = true; S.status = 0; S.step = 'done'; render(); }

/* ⑤ 제출 완료 · 진행 현황 */
function vDone(){
  titleEl.textContent = '내 사역 신청';
  var st = S.status;
  var msg = ['부서 확인을 거쳐 임명이 확정되면 알려 드릴게요.',
             '담당자가 신청 내용을 살펴보고 있습니다.',
             '임명이 확정됐습니다. 첫 모임 안내를 기다려 주세요.',
             '이번에는 다른 분이 임명됐습니다. 다음 기회에 함께해 주세요.'][st];
  var html = '<div class="done"><div class="ck">' + (st === 3 ? '·' : '✓') + '</div>' +
    '<h3>' + (st === 0 ? '신청이 접수됐어요' : STATES[st]) + '</h3>' +
    '<p>' + msg + '</p>' +
    '<span class="state s' + st + '">진행 상태 · ' + STATES[st] + '</span></div>' +
    '<div style="height:16px"></div>';
  S.picked.forEach(function (id, i) {
    var t = byId(id);
    html += '<div class="pri"><span class="num">' + (i + 1) + '</span>' +
      '<span class="info"><span class="nm">' + esc(t.name) + '</span>' +
      '<span class="meta">' + esc(t.committee) + (metaOf(t) ? ' · ' + metaOf(t) : '') + '</span></span></div>';
  });
  html += '<div class="push">🔔 상태가 바뀌면 <b>앱 알림</b>으로 알려 드려요. ' +
    '이 화면에서 진행 현황을 언제든 다시 볼 수 있어요.<br>' +
    '<span style="color:#6b7280">데모에서는 위 「담당자 화면」에서 상태를 바꿔 보실 수 있습니다.</span></div>';
  view.innerHTML = html;
  setCta('<button class="cta ghost" onclick="go(\\'pick\\')">신청 고치기</button>');
}

/* 담당자 화면 */
function vAdmin(){
  titleEl.textContent = '담당자 화면 (데모)';
  if (!S.submitted) {
    view.innerHTML = '<div class="empty">아직 접수된 신청이 없습니다.<br>먼저 성도 화면에서 신청해 보세요.</div>';
    setCta('<button class="cta ghost" onclick="go(\\'intro\\')">성도 화면으로</button>');
    return;
  }
  var names = S.picked.map(function (id, i) { return (i + 1) + '. ' + byId(id).name; }).join('<br>');
  view.innerHTML = '<h2 class="st">접수된 신청 1건</h2>' +
    '<p class="sub">상태를 바꾸면 성도 화면에 그대로 반영됩니다. 실제로는 이때 앱 알림이 한 번 나갑니다.</p>' +
    '<div class="adm"><div class="who">' + esc(S.me.gu) + ' ' + esc(S.me.mok) + ' · ' + esc(S.me.name) + '</div>' +
    '<div class="li">' + names + '</div>' +
    '<div class="btns">' + STATES.map(function (s, i) {
      return '<button class="' + (S.status === i ? 'on' : '') + '" onclick="setStatus(' + i + ')">' + s + '</button>';
    }).join('') + '</div></div>';
  setCta('<button class="cta ghost" onclick="go(\\'done\\')">성도 화면에서 보기</button>');
}
function setStatus(i){ S.status = i; render(); }

function go(step){ S.step = step; render(); }
backEl.onclick = function () {
  go({ me:'intro', pick:'me', order:'pick', admin:(S.submitted ? 'done' : 'intro') }[S.step] || 'intro');
};
document.getElementById('btn-admin').onclick = function () { go('admin'); };
document.getElementById('btn-reset').onclick = function () {
  if (!confirm('데모를 처음 상태로 되돌립니다.')) return;
  try { localStorage.removeItem(KEY); } catch (e) {}
  S = load(); render();
};
render();
</script>
</body>
</html>
"""

html = (HTML
        .replace('__TEAMS__', json.dumps(teams, ensure_ascii=False))
        .replace('__PRINCIPLES__', json.dumps(PRINCIPLES, ensure_ascii=False)))

io.open(OUT_HTML, 'w', encoding='utf-8', newline='').write(html)
print('wrote:', os.path.relpath(OUT_HTML, ROOT))
print('teams:', len(teams), '| committees:', len(set(t['committee'] for t in teams)))
print('size:', round(len(html.encode('utf-8')) / 1024, 1), 'KB')
