// Supabase 연결 설정 (공개돼도 되는 값 — publishable key는 RLS로 보호됨)
//
// ⚠️ 운영과 개발은 **사람이 손으로 고르지 않는다.** 주소를 보고 저절로 갈린다.
//
//      gocheok.onlybible.kr  →  운영
//      그 밖의 모든 주소       →  개발   (localhost · 미리보기 · 브랜치 · github.io)
//
//    기본값이 '개발'인 것이 핵심이다. 새 미리보기 주소가 생겨도 실수로 운영에 붙지 않는다.
//    반대로 두면(모르는 주소 → 운영) 개발 중 실수 한 번이 성도님 기록을 건드리고,
//    그건 되돌릴 수 없다. 잘못 갈렸을 때 '빈 화면'은 눈에 보이지만 '남의 기록을 지운 것'은
//    안 보인다 — 그래서 보이는 쪽으로 틀리게 둔다.
//
//    개발 쪽일 때는 화면 구석에 띠가 하나 뜬다(아래). 빈 목록을 보고 고장으로 오해하지 않도록.
(function () {
  var PROD = {
    URL: "https://xnomlgydifiqiybervtf.supabase.co",
    ANON: "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-",
  };
  var DEV = {
    URL: "https://ktpwthwqzgcqcrmsafdo.supabase.co",
    ANON: "sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y",
  };

  var isProd = location.hostname === "gocheok.onlybible.kr";

  window.SUPA = {
    URL: isProd ? PROD.URL : DEV.URL,
    ANON: isProd ? PROD.ANON : DEV.ANON,
    env: isProd ? "prod" : "dev",
  };

  // 아직 개발 프로젝트가 없는 형제 앱(말씀 아카이브 sermon 함수)을 부를 때 쓴다.
  // 그쪽이 개발 프로젝트를 갖게 되면 이 예외를 지운다.
  window.SUPA_PROD = PROD;

  if (isProd) return;

  // ---- 개발 표시 ----
  // 어느 쪽 데이터를 보고 있는지 한눈에 알리는 것이 목적이다.
  // pointer-events:none — 어떤 단추도 가리지 않고 탭을 먹지 않는다.
  function mark() {
    if (document.getElementById("dev-env-mark")) return;
    var el = document.createElement("div");
    el.id = "dev-env-mark";
    el.textContent = "개발 DB";
    el.style.cssText = [
      "position:fixed", "top:0", "right:0", "z-index:2147483647",
      "background:#b5891f", "color:#fff",
      "font:700 11px/1 system-ui,sans-serif", "letter-spacing:.3px",
      "padding:5px 9px", "border-radius:0 0 0 8px",
      "pointer-events:none", "opacity:.9",
    ].join(";");
    document.body.appendChild(el);
  }
  if (document.body) mark();
  else document.addEventListener("DOMContentLoaded", mark);
})();
