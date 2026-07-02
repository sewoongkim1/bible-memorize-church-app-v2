# 성경말씀 암송 앱 — v2 (스테이징)

고척교회 제자양육부 신앙운동팀 · 성경말씀 암송 웹앱의 **2차 버전 개발용 저장소**입니다.

- **v1(운영 중)**: [bible-memorize-church-app](https://github.com/sewoongkim1/bible-memorize-church-app) — Google Apps Script + Google Sheets 백엔드
- **v2(이 저장소)**: 프론트엔드(PWA)는 v1을 계승하되, 백엔드를 **Supabase(PostgreSQL · Auth · Edge Functions · Storage)** 로 전환

## 목표
- 사용자 증가 대비 **관계형 DB + 미들웨어(API)** 구조로 전환
- 개인정보 보호(RLS), 통계·CSV 추출, 매일 암송/복습 알림
- v1 운영에 영향 없이 **병행·검증 후 컷오버**

## 상태
🚧 개발 중 (스테이징). 운영 서비스는 v1을 사용하세요.

## 전환 계획 요약
1. Supabase 프로젝트(서울 리전) + 스키마·인증 구성
2. v1 → Supabase **이중 기록**으로 데이터 축적
3. 과거 Sheets 데이터 이관 + 검증
4. 클라이언트 데이터 계층을 supabase-js로 전환
5. 정식 전환(롤백 플랜 유지)
