// v1 시트 dump(JSON) → Supabase 이관 실행기
// 사용법: node migrate/import.mjs <ADMIN_SECRET> [dump파일=migrate/v1dump.json]
// 준비: v1 …/exec?action=dump&pw=<ADMIN_PW> 의 응답을 migrate/v1dump.json 으로 저장
import fs from "node:fs";

const SECRET = process.argv[2];
const FILE = process.argv[3] || "migrate/v1dump.json";
if (!SECRET) {
  console.error("사용법: node migrate/import.mjs <ADMIN_SECRET> [dump.json]");
  process.exit(1);
}
const API = "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api";
const ANON = "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-";

const dump = JSON.parse(fs.readFileSync(FILE, "utf8"));
console.log(`불러온 행: 기록 ${dump.rows?.length || 0} · 도전 ${dump.challenge?.length || 0}`);

const res = await fetch(API, {
  method: "POST",
  headers: { "Content-Type": "application/json", "apikey": ANON, "Authorization": "Bearer " + ANON },
  body: JSON.stringify({ action: "importV1", pw: SECRET, rows: dump.rows || [], challenge: dump.challenge || [] }),
});
const data = await res.json();
console.log("결과:", data);
if (!data.ok) process.exit(1);
console.log(`✅ 완료 — 사용자 ${data.users} · 진도 ${data.progress} · 활동로그 ${data.logs}`);
