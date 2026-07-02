# Supabase 백엔드 (v2)

## 구성
- `schema.sql` — 테이블·인덱스·RLS(기본 차단)·통계 뷰
- `functions/api/index.ts` — API 미들웨어(Edge Function). 클라이언트의 모든 데이터 요청 처리.

## 접근 모델
클라이언트는 DB에 직접 접근하지 않고 **Edge Function `api`** 만 호출한다.
Edge Function은 **service_role** 키로 접속해 RLS(기본 차단)를 우회한다.
→ 데이터 로직이 미들웨어 한 곳에 모이고, anon 키가 노출돼도 DB가 안전하다.

## 최초 설정 순서
1. **스키마 적용**: 대시보드 > SQL Editor 에 `schema.sql` 붙여넣고 실행.
2. **CLI 설치·로그인**
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref <YOUR-PROJECT-REF>
   ```
3. **Edge Function 배포**
   ```bash
   supabase functions deploy api --no-verify-jwt
   ```
   > `--no-verify-jwt`: 익명(비로그인) 성도도 호출하므로 JWT 검증을 끈다.
   > (service_role는 함수 내부에서만 사용, 클라이언트에 노출되지 않음)
4. **시크릿 설정** (service_role 키는 절대 저장소/클라이언트에 두지 말 것)
   ```bash
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   # SUPABASE_URL 은 Edge 런타임에 기본 주입되지만, 명시해도 됨
   ```
5. **클라이언트 설정**: `js/config.js` 의 `URL`, `ANON` 을 대시보드 값으로 채운다.

## 액션(API)
| action | 설명 | 입력 |
| --- | --- | --- |
| `login` | 식별→upsert, 진도·복습 반환 | type, gu, mok, bu, grade, name |
| `saveProgress` | 단계 저장(3단계면 복습 예약) | user_id, verse_no, stage |
| `challenge` | 도전/암송 기록 | user_id, verse_no, mode, score |
| `advanceReview` | 복습 성공→다음 상자 | user_id, verse_no |
| `ranking` | 기간별 순위 | period(today/week/all) |
