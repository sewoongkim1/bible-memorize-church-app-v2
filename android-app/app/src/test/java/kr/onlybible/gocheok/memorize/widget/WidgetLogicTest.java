package kr.onlybible.gocheok.memorize.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.time.Instant;

import org.json.JSONObject;
import org.junit.Test;

// 아이폰 WidgetShared.swift · 각 위젯의 isValid 와 같은 규칙인지 본다.
public class WidgetLogicTest {
    private static long t(String iso) { return Instant.parse(iso).toEpochMilli(); }
    private static JSONObject j(String s) throws Exception { return new JSONObject(s); }

    @Test public void nextKstMidnight_justBeforeMidnight() {
        // KST 09-21 23:59:59 = UTC 14:59:59 → 다음 자정(KST 09-22 00:00) = UTC 09-21 15:00
        assertEquals(t("2026-09-21T15:00:00Z"), WidgetLogic.nextKstMidnight(t("2026-09-21T14:59:59Z")));
    }

    @Test public void nextKstMidnight_atMidnightGoesToTheNextOne() {
        assertEquals(t("2026-09-22T15:00:00Z"), WidgetLogic.nextKstMidnight(t("2026-09-21T15:00:00Z")));
    }

    @Test public void nextKstMidnight_morningKst() {
        // KST 09-21 09:00 = UTC 00:00 → 그날 밤 자정
        assertEquals(t("2026-09-21T15:00:00Z"), WidgetLogic.nextKstMidnight(t("2026-09-21T00:00:00Z")));
    }

    @Test public void meditationNext_morningUsesSixHours() {
        long now = t("2026-09-21T01:00:00Z"); // KST 10:00
        assertEquals(now + 6 * 3600_000L, WidgetLogic.meditationNext(now));
    }

    @Test public void meditationNext_eveningUsesMidnight() {
        long now = t("2026-09-21T11:00:00Z"); // KST 20:00 → 자정이 6시간 뒤(02:00)보다 이르다
        assertEquals(t("2026-09-21T15:00:00Z"), WidgetLogic.meditationNext(now));
    }

    @Test public void refreshAt_freshUsesNext_failureRetriesIn30Minutes() {
        long now = 1_000_000L, next = 90_000_000L;
        assertEquals(next, WidgetLogic.refreshAt(true, next, now));
        assertEquals(now + 30 * 60_000L, WidgetLogic.refreshAt(false, next, now));
    }

    @Test public void str_nullMissingAndNonStringAreEmpty() throws Exception {
        assertEquals("", WidgetLogic.str(null, "text"));
        assertEquals("", WidgetLogic.str(j("{}"), "text"));
        assertEquals("", WidgetLogic.str(j("{\"text\":null}"), "text"));
        assertEquals("", WidgetLogic.str(j("{\"text\":38}"), "text"));
        assertEquals("롬 14:8", WidgetLogic.str(j("{\"ref\":\"롬 14:8\"}"), "ref"));
    }

    @Test public void verseValid_needsText() throws Exception {
        // getWeeklyVerse 에는 ok 칸이 없다 — 본문만 본다(아이폰 verseIsValid 와 같다)
        assertTrue(WidgetLogic.verseValid(j("{\"no\":38,\"ref\":\"롬 14:8\",\"text\":\"우리가 살아도\"}")));
        assertFalse(WidgetLogic.verseValid(j("{\"no\":38,\"text\":\"\"}")));
        assertFalse(WidgetLogic.verseValid(j("{\"text\":null}")));
        assertFalse(WidgetLogic.verseValid(null));
    }

    @Test public void meditationValid_needsOkAndMessageOrQuestion() throws Exception {
        assertTrue(WidgetLogic.meditationValid(j("{\"ok\":true,\"message\":\"본문\",\"question\":\"\"}")));
        assertTrue(WidgetLogic.meditationValid(j("{\"ok\":true,\"message\":\"\",\"question\":\"질문\"}")));
        assertFalse(WidgetLogic.meditationValid(j("{\"ok\":true,\"message\":\"\",\"question\":\"\"}")));
        assertFalse(WidgetLogic.meditationValid(j("{\"ok\":false,\"message\":\"본문\"}")));
        assertFalse(WidgetLogic.meditationValid(null));
    }

    @Test public void blessingValid_needsOkAndPrayer() throws Exception {
        assertTrue(WidgetLogic.blessingValid(j("{\"ok\":true,\"prayer\":\"하나님\"}")));
        assertFalse(WidgetLogic.blessingValid(j("{\"ok\":true,\"prayer\":\"\"}")));
        assertFalse(WidgetLogic.blessingValid(j("{\"ok\":false,\"prayer\":\"하나님\"}")));
        assertFalse(WidgetLogic.blessingValid(null));
    }

    @Test public void meditationBody_prefersMessage_fallsBackToQuestion() throws Exception {
        // 적용 질문은 위젯에 싣지 않는다 — 본문이 비고 질문만 오는 날에만 질문을 본문 자리에(2026-09-21)
        assertEquals("본문", WidgetLogic.meditationBody(j("{\"message\":\"본문\",\"question\":\"질문\"}")));
        assertEquals("질문", WidgetLogic.meditationBody(j("{\"message\":\"\",\"question\":\"질문\"}")));
        assertEquals("", WidgetLogic.meditationBody(null));
    }

    @Test public void meditationTitle_withAndWithoutDay() {
        assertEquals("오늘의 묵상 · 월요일", WidgetLogic.meditationTitle("월"));
        assertEquals("오늘의 묵상", WidgetLogic.meditationTitle(""));
        assertEquals("오늘의 묵상", WidgetLogic.meditationTitle(null));
    }

    @Test public void useLargeLayout_byHeightToWidth() {
        assertFalse(WidgetLogic.useLargeLayout(330, 180));   // 4×2
        assertTrue(WidgetLogic.useLargeLayout(330, 350));    // 4×4
        assertTrue(WidgetLogic.useLargeLayout(330, 264));    // 경계: 높이 ≥ 너비 × 0.8
        assertFalse(WidgetLogic.useLargeLayout(330, 263));
        assertFalse(WidgetLogic.useLargeLayout(0, 400));     // 크기를 아직 모를 때는 중간
        assertFalse(WidgetLogic.useLargeLayout(330, 0));
    }

    @Test public void verseUrl_withAndWithoutNumber() throws Exception {
        assertEquals("https://gocheok.onlybible.kr/?v=38", WidgetLogic.verseUrl(j("{\"no\":38}")));
        assertEquals("https://gocheok.onlybible.kr/", WidgetLogic.verseUrl(j("{\"no\":null}")));
        assertEquals("https://gocheok.onlybible.kr/", WidgetLogic.verseUrl(null));
        assertEquals("https://gocheok.onlybible.kr/?w=meditation", WidgetLogic.MEDITATION_URL);
        assertEquals("https://gocheok.onlybible.kr/?w=prayer", WidgetLogic.PRAYER_URL);
    }

    @Test public void requestBody_carriesActionAndOnlyANonEmptyDate() throws Exception {
        JSONObject plain = new JSONObject(WidgetLogic.requestBody("getWeeklyVerse", ""));
        assertEquals("getWeeklyVerse", plain.getString("action"));
        assertFalse(plain.has("date"));
        assertFalse(new JSONObject(WidgetLogic.requestBody("getWeeklyVerse", null)).has("date"));
        JSONObject dated = new JSONObject(WidgetLogic.requestBody("getTodayMeditation", "2026-09-13"));
        assertEquals("2026-09-13", dated.getString("date"));
        assertFalse(dated.has("user_id"));   // ⚠️ 위젯은 신원을 보내지 않는다
    }

    // ── 돌려 보기 위젯(2026-10-13 · 아이폰 RotateWidget 과 같은 규칙) ──

    @Test public void rotateIndex_isTheThirtyMinuteSlotModCount() {
        long base = t("2026-10-13T00:00:00Z");                   // 30분 칸의 시작
        assertEquals(30 * 60_000L, WidgetLogic.ROTATE_MS);       // 친구 결정 2026-10-07(아이폰 rotateSeconds)
        int i0 = WidgetLogic.rotateIndex(base, 4);
        assertEquals((int) ((base / (30 * 60_000L)) % 4), i0);   // 아이폰: Int(시각 / 30분) % 장 수
        assertEquals(i0, WidgetLogic.rotateIndex(base + 29 * 60_000L + 59_999L, 4));   // 같은 칸 안에서는 그대로
        assertEquals((i0 + 1) % 4, WidgetLogic.rotateIndex(base + 30 * 60_000L, 4));   // 다음 칸 → 다음 장
        assertEquals((i0 + 2) % 4, WidgetLogic.rotateIndex(base + 60 * 60_000L, 4));
        assertEquals(0, WidgetLogic.rotateIndex(base, 1));
        assertEquals(0, WidgetLogic.rotateIndex(base, 0));        // 장이 없으면 0(나눗셈 오류 없이)
        for (int k = 0; k < 20; k++) {
            int i = WidgetLogic.rotateIndex(base + k * 30 * 60_000L, 3);
            assertTrue(i >= 0 && i < 3);
        }
    }

    @Test public void nextRotateAt_isTheNextThirtyMinuteBoundary() {
        assertEquals(t("2026-10-13T08:30:00Z"), WidgetLogic.nextRotateAt(t("2026-10-13T08:12:34Z")));
        assertEquals(t("2026-10-13T09:00:00Z"), WidgetLogic.nextRotateAt(t("2026-10-13T08:30:00Z")));   // 딱 경계면 그다음
        // 한국 자정(UTC 15:00)도 30분 경계다 — 날이 바뀌는 칸에 장이 바뀐다
        assertEquals(t("2026-10-13T15:00:00Z"), WidgetLogic.nextRotateAt(t("2026-10-13T14:45:00Z")));
    }

    @Test public void rotateAlarmAt_isTheEarlierOfNextSlideAndAFutureFetch() {
        long now = t("2026-10-13T08:12:00Z");
        assertEquals(t("2026-10-13T08:30:00Z"), WidgetLogic.rotateAlarmAt(now, t("2026-10-13T14:12:00Z")));
        assertEquals(t("2026-10-13T08:20:00Z"), WidgetLogic.rotateAlarmAt(now, t("2026-10-13T08:20:00Z")));   // 실패 뒤 다시 받기가 먼저
        assertEquals(t("2026-10-13T08:30:00Z"), WidgetLogic.rotateAlarmAt(now, now));                          // 지난 시각은 무시
        assertEquals(t("2026-10-13T08:30:00Z"), WidgetLogic.rotateAlarmAt(now, 0));
    }

    @Test public void rotateShouldFetch_whenNeverFetchedDueOrTheClockWentBack() {
        long now = t("2026-10-13T08:00:00Z");
        assertTrue(WidgetLogic.rotateShouldFetch(now, 0));                              // 처음
        assertTrue(WidgetLogic.rotateShouldFetch(now, now));                            // 때가 됐다
        assertTrue(WidgetLogic.rotateShouldFetch(now, now - 1));
        assertFalse(WidgetLogic.rotateShouldFetch(now, now + 6 * 3_600_000L));         // 6시간 뒤 — 기다린다
        assertTrue(WidgetLogic.rotateShouldFetch(now, now + 7 * 3_600_000L));          // 6시간 반 넘게 남았다 = 폰 시계를 뒤로 돌렸다
    }

    @Test public void rotateValid_matchesEachSourcesOwnRule() throws Exception {
        assertTrue(WidgetLogic.rotateValid("verse", j("{\"text\":\"말씀\"}")));
        assertFalse(WidgetLogic.rotateValid("verse", j("{\"text\":\"\"}")));
        assertTrue(WidgetLogic.rotateValid("meditation", j("{\"ok\":true,\"message\":\"m\"}")));
        assertFalse(WidgetLogic.rotateValid("meditation", j("{\"ok\":false,\"message\":\"m\"}")));
        assertTrue(WidgetLogic.rotateValid("blessing", j("{\"ok\":true,\"prayer\":\"p\"}")));
        assertFalse(WidgetLogic.rotateValid("blessing", j("{\"ok\":true}")));
        // 쉴만한 물가 — 「아직 열리지 않음」(ready:false)도 지금의 진짜 상태다(그 장만 빠진다)
        assertTrue(WidgetLogic.rotateValid("psalm", j("{\"ok\":true,\"ready\":false}")));
        assertFalse(WidgetLogic.rotateValid("psalm", j("{\"ready\":true,\"text\":\"t\"}")));
        assertFalse(WidgetLogic.rotateValid("psalm", null));
        assertFalse(WidgetLogic.rotateValid("nope", j("{\"ok\":true}")));
    }

    @Test public void rotateSlides_inOrderAndSkipsWhatIsUnusable() throws Exception {
        JSONObject verse = j("{\"no\":38,\"text\":\" 주의 말씀은 \",\"ref\":\"시편 119:105\"}");
        JSONObject med = j("{\"ok\":true,\"dayLabel\":\"화\",\"heading\":\"제목\",\"message\":\"\",\"question\":\"질문\"}");
        JSONObject bless = j("{\"ok\":true,\"title\":\"아론의 축복\",\"ref\":\"민수기 6:24\",\"prayer\":\"기도\"}");
        JSONObject psalm = j("{\"ok\":true,\"ready\":true,\"ref\":\"시편 23:1\",\"text\":\"여호와는 나의 목자시니\"}");

        java.util.List<WidgetLogic.Slide> all = WidgetLogic.rotateSlides(verse, med, bless, psalm);
        assertEquals(4, all.size());
        WidgetLogic.Slide v = all.get(0);
        assertEquals("verse", v.kind);
        assertEquals("이번주 말씀", v.header);
        assertEquals("", v.title);
        assertEquals("주의 말씀은", v.body);                          // 앞뒤 빈칸은 걷는다(아이폰 rotateText)
        assertEquals("시편 119:105", v.footer);
        assertEquals("https://gocheok.onlybible.kr/?v=38", v.url);
        WidgetLogic.Slide m = all.get(1);
        assertEquals("오늘의 묵상 · 화요일", m.header);
        assertEquals("제목", m.title);
        assertEquals("질문", m.body);                                 // 본문이 비면 질문을 본문 자리에
        assertEquals("", m.footer);
        assertEquals(WidgetLogic.MEDITATION_URL, m.url);
        WidgetLogic.Slide b = all.get(2);
        assertEquals("축복 기도문", b.header);
        assertEquals("아론의 축복", b.title);
        assertEquals("민수기 6:24", b.footer);
        assertEquals(WidgetLogic.PRAYER_URL, b.url);
        WidgetLogic.Slide p = all.get(3);
        assertEquals("쉴만한 물가", p.header);
        assertEquals("시편 23:1", p.footer);
        assertEquals("https://gocheok.onlybible.kr/?w=psalm", p.url);

        // 쉴만한 물가가 아직 안 열렸으면(ready:false) 세 장으로 돈다
        java.util.List<WidgetLogic.Slide> three = WidgetLogic.rotateSlides(verse, med, bless, j("{\"ok\":true,\"ready\":false}"));
        assertEquals(3, three.size());
        assertEquals("blessing", three.get(2).kind);
        // 하나가 비어도 나머지는 돈다 · 아무것도 없으면 빈 목록
        assertEquals(2, WidgetLogic.rotateSlides(null, med, null, psalm).size());
        assertEquals("meditation", WidgetLogic.rotateSlides(null, med, null, psalm).get(0).kind);
        assertEquals(0, WidgetLogic.rotateSlides(null, null, null, null).size());
        assertEquals("오늘의 묵상", WidgetLogic.rotateSlides(null, j("{\"ok\":true,\"message\":\"m\"}"), null, null).get(0).header);
        // 구절 번호를 모르면 첫 화면
        assertEquals("https://gocheok.onlybible.kr/", WidgetLogic.rotateSlides(j("{\"text\":\"t\"}"), null, null, null).get(0).url);
    }

    @Test public void rotateTint_perKindLikeTheIphone() {
        assertEquals(0xFF007AFF, WidgetLogic.rotateTint("verse"));
        assertEquals(0xFF34C759, WidgetLogic.rotateTint("meditation"));
        assertEquals(0xFFFF9500, WidgetLogic.rotateTint("blessing"));
        assertEquals(0xFF30B0C7, WidgetLogic.rotateTint("psalm"));
        assertEquals(0xFF007AFF, WidgetLogic.rotateTint("모름"));
    }
}
