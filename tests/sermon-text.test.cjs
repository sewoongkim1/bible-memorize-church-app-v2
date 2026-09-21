// node --test tests/sermon-text.test.cjs — 준비물 없이(node 만). admin-stats.html 의 sermon-text 덩이를 떼어 돌린다.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','admin-stats.html'),'utf8');
const m=html.match(/\/\/ ==== sermon-text[\s\S]*?\/\/ ==== \/sermon-text ====/);
assert.ok(m,'admin-stats.html 에서 sermon-text 덩이를 못 찾았다');
const ctx={}; vm.createContext(ctx); vm.runInContext(m[0],ctx);

test('영상 번호 — 여러 꼴 (job-lib.test.mjs 와 같은 표본)',()=>{
  for(const u of ['https://www.youtube.com/watch?v=9YgDMXP77NE','https://youtu.be/9YgDMXP77NE?si=abc',
    'https://www.youtube.com/live/9YgDMXP77NE','https://youtube.com/shorts/9YgDMXP77NE',
    'https://www.youtube.com/watch?feature=share&v=9YgDMXP77NE','9YgDMXP77NE']) assert.equal(ctx.stVideoId(u),'9YgDMXP77NE',u);
  assert.equal(ctx.stVideoId(''),'');
  assert.equal(ctx.stVideoId('https://example.com/watch?v=short'),'');
  assert.equal(ctx.stVideoId('https://www.youtube.com/watch?v=9YgDMXP77NEX'),'');   // 12자로 잘못 쓴 것은 거른다
});

test('자막 — 시각이 제 줄에 있는 꼴',()=>{
  assert.equal(ctx.stCleanTranscript('0:03\n오늘 말씀은\n0:07\n요한복음 3:16절\n1:02:15\n아멘'),'오늘 말씀은 요한복음 3:16절 아멘');
});
test('자막 — 시각이 줄 앞에 붙은 꼴 · 빈 줄 · 윈도 줄바꿈',()=>{
  assert.equal(ctx.stCleanTranscript('0:03 오늘 말씀은\r\n\r\n12:07  사랑입니다\r\n'),'오늘 말씀은 사랑입니다');
});
test('자막 — 본문 속 장절(3:16)은 지우지 않는다',()=>{
  assert.equal(ctx.stCleanTranscript('3:16절 말씀을 봅니다'),'3:16절 말씀을 봅니다');
});
test('자막 — 자모 분리(NFD)는 완성형으로',()=>{
  assert.equal(ctx.stCleanTranscript('하나님'.normalize('NFD')),'하나님');
});

test('제목 — 교회 머리표·목사님 꼬리표·날짜를 뗀다(add-video.mjs cleanTitle + 5-migrate 날짜)',()=>{
  assert.equal(ctx.stCleanTitle('[고척교회] 하나님은 공장장이 아니라 아버지입니다 ㅣ 차동혁 위임목사'),'하나님은 공장장이 아니라 아버지입니다');
  assert.equal(ctx.stCleanTitle('2026.09.20 주일예배 | 홍길동 목사'),'주일예배');
  assert.equal(ctx.stCleanTitle(''),'');
});

test('한국 날짜 — 9/19 0시(한국)가 9/18 로 보이던 버그',()=>{
  assert.equal(ctx.stKstDate('2026-09-18T15:00:00+00:00'),'2026-09-19');
  assert.equal(ctx.isoDateInput('2026-09-18T15:00:00+00:00'),'2026-09-19');
  // 열고 저장을 되풀이해도 날짜가 그대로다(화면은 칸 값 + "T00:00:00+09:00" 로 저장한다)
  let d='2026-09-18T15:00:00+00:00';
  for(let i=0;i<3;i++) d=ctx.isoDateInput(d)+'T00:00:00+09:00';
  assert.equal(ctx.isoDateInput(d),'2026-09-19');
  assert.equal(ctx.stKstDate(''),'');
  assert.equal(ctx.stKstDate('엉뚱'),'');
});

test('지난 주일(한국)',()=>{
  assert.equal(ctx.stLastSundayKst(new Date('2026-09-20T01:00:00Z')),'2026-09-20');   // 주일 오전 10시
  assert.equal(ctx.stLastSundayKst(new Date('2026-09-21T03:00:00Z')),'2026-09-20');   // 월요일
  assert.equal(ctx.stLastSundayKst(new Date('2026-09-19T16:00:00Z')),'2026-09-20');   // UTC 토요일 = 한국 주일 새벽 1시
  assert.equal(ctx.stLastSundayKst(new Date('2026-09-26T14:00:00Z')),'2026-09-20');   // 한국 토요일 밤 11시
});
test('날짜 더하기 · 글자 수',()=>{
  assert.equal(ctx.stAddDays('2026-09-19',7),'2026-09-26');
  assert.equal(ctx.stAddDays('2026-12-28',7),'2027-01-04');
  assert.equal(ctx.stAddDays('',7),'');
  assert.equal(ctx.stKorCount(23916),'2.4만 자');
  assert.equal(ctx.stKorCount(4800),'4,800자');
});
