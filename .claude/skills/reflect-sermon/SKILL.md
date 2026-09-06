---
name: reflect-sermon
description: 유튜브 설교 영상 URL을 받아 말씀 아카이브(gocheok-sermons)에 반영하고, 필요하면 이번 주 암송구절 연상 그림까지 만든다. "설교 반영해줘", "이 설교 넣어줘", "설교 URL ...", "이번주 암송말씀 그림 넣어줘" 같은 요청에 사용.
---

# 설교 URL 반영

유튜브 설교 링크 하나를 받으면, 전체 절차는 **반드시**
`c:\Projects\gocheok-sermons\docs\설교-url-반영-절차.md` 를 열어 그 순서대로 따른다.
그 문서가 원본이고, 아래는 이 스킬이 매칭돼야 할 트리거와 절대 잊으면 안 되는
세 가지만 남긴 요약이다 — 자세한 명령어·검증 방법은 반드시 원본 문서에서 본다.

## 언제 이 스킬인가

- "설교 [URL] 반영해줘" / "이 설교 넣어줘" / "설교 아카이브에도 반영"
- "이번주 암송말씀 그림 넣어줘" (그림만 요청해도, 먼저 그 구절 설교가
  아카이브에 반영돼 있는지 0단계 확인부터 한다 — 그림과 설교는 같은 구절을 다룬다)

## 잊으면 안 되는 세 가지 (원본 문서 0·2·6장)

1. **순서**: `verses.sermon_url`이 먼저 채워져 있어야 설교 쪽 매칭(`4-link.mjs`)이
   그 구절 번호로 연결된다. 반대 순서면 매칭이 비어서 나온다.
2. **`yt-dlp` 없으면 조용히 "완료"만 찍고 실제로는 빈 항목**이 들어간다.
   `node scripts/add-local.mjs`를 돌린 뒤 로그에서 반드시
   `✓ 자막 <id>` / `✓ <id> (1/1) <제목>` / DB 적재 편수가 **+1** 됐는지 세 줄을 확인한다.
3. **저장소가 이 컴퓨터에 없을 수 있다** — `gh repo clone sewoongkim1/gocheok-sermons`로
   받고, `.env`(ANTHROPIC_API_KEY·AZURE_SPEECH_KEY·AZURE_SPEECH_REGION·SERMON_ADMIN,
   `bible-memorize-church-app-v2/.env`와 동일 값)를 만든 뒤 진행한다.

## 말씀 연상 그림까지 요청받았다면

`img/verse/암송말씀_그림_만들기.md`(이 저장소 안)를 열어 그 순서(심상 문장 →
Higgsfield 생성 → 사람 눈 검수 → `tools/verse-img.py` → `app.js` 등록 →
`tools/bump.py` → 커밋·푸시)로 따른다.
