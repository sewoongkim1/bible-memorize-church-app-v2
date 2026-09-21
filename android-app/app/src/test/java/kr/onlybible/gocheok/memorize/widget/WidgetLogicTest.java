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
}
