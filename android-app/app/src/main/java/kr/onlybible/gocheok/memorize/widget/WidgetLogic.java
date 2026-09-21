package kr.onlybible.gocheok.memorize.widget;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * 위젯 규칙 중 안드로이드에 기대지 않는 것 — JVM 시험(WidgetLogicTest)으로 굳힌다.
 * 아이폰 WidgetShared.swift(nextKSTMidnight · refreshDate)와 각 위젯의 isValid 와 **같은 규칙**이다.
 * 한쪽을 고치면 다른 쪽도 함께 고칠 것.
 *
 * ⚠️ java.time 을 쓰지 않는다 — 안드로이드 8.0 미만 폰에는 없다. 한국 시간은 +9시간으로 셈한다(서머타임 없음).
 *    Math.floorDiv 도 쓰지 않는다(안드로이드 7.0 미만에 없다) — 시각은 늘 양수라 그냥 나눗셈이면 된다.
 */
public final class WidgetLogic {
    private WidgetLogic() {}

    public static final String SITE = "https://gocheok.onlybible.kr";
    public static final String MEDITATION_URL = SITE + "/?w=meditation";
    public static final String PRAYER_URL = SITE + "/?w=prayer";

    private static final long MINUTE = 60_000L;
    private static final long HOUR = 60 * MINUTE;
    private static final long DAY = 24 * HOUR;
    private static final long KST_OFFSET = 9 * HOUR;

    /** 다음 한국 자정(밀리초). 딱 자정이면 그다음 자정. 서버가 한국 날짜로 고르므로 같은 기준을 쓴다. */
    public static long nextKstMidnight(long nowMillis) {
        long kst = nowMillis + KST_OFFSET;
        return (kst / DAY + 1) * DAY - KST_OFFSET;
    }

    /** 묵상 — 다음 자정과 6시간 뒤 중 이른 때(주일 오후에 올라오는 설교가 늦어도 반나절 안에 따라오게). */
    public static long meditationNext(long nowMillis) {
        return Math.min(nextKstMidnight(nowMillis), nowMillis + 6 * HOUR);
    }

    /** 새로 받았으면 next, 실패했으면 자정까지 기다리지 않고 30분 뒤(아이폰 refreshDate 와 같다). */
    public static long refreshAt(boolean fresh, long nextMillis, long nowMillis) {
        return fresh ? nextMillis : nowMillis + 30 * MINUTE;
    }

    /** 문자열 칸만 꺼낸다. 없거나 null 이거나 문자열이 아니면 "". (org.json 은 null 을 "null" 로 돌려주는 판이 있다) */
    public static String str(JSONObject j, String key) {
        if (j == null) return "";
        Object v = j.opt(key);
        return (v instanceof String) ? (String) v : "";
    }

    /** getWeeklyVerse 에는 ok 칸이 없다 — 본문이 있으면 쓸 만하다. */
    public static boolean verseValid(JSONObject j) {
        return !str(j, "text").isEmpty();
    }

    /** 「준비하고 있어요」(ready:false)도 지금의 진짜 상태이므로 쓸 만한 응답으로 본다. */
    public static boolean meditationValid(JSONObject j) {
        return j != null && j.optBoolean("ok")
                && (!str(j, "message").isEmpty() || !str(j, "question").isEmpty());
    }

    public static boolean blessingValid(JSONObject j) {
        return j != null && j.optBoolean("ok") && !str(j, "prayer").isEmpty();
    }

    /** 적용 질문은 위젯에 싣지 않는다(2026-09-21) — 본문이 비고 질문만 오는 날에만 질문을 본문 자리에. */
    public static String meditationBody(JSONObject j) {
        String message = str(j, "message");
        return message.isEmpty() ? str(j, "question") : message;
    }

    public static String meditationTitle(String dayLabel) {
        return (dayLabel == null || dayLabel.isEmpty()) ? "오늘의 묵상" : "오늘의 묵상 · " + dayLabel + "요일";
    }

    /**
     * 큰 글씨 모양을 쓸 만큼 세로로 늘렸나. 런처마다 칸 크기가 달라 절대 높이 대신 너비와의 비로 본다
     * (4×2 는 대개 0.5~0.7, 4×4 는 1 안팎). 크기를 아직 모르면(0) 가로로 긴 모양.
     */
    public static boolean useLargeLayout(int widthDp, int heightDp) {
        if (widthDp <= 0 || heightDp <= 0) return false;
        return heightDp >= widthDp * 0.8;
    }

    /** 구절 번호를 알면 그 구절 암송 화면(/?v=번호), 모르면 첫 화면. 웹 routeAfterLoad 가 받는다. */
    public static String verseUrl(JSONObject j) {
        if (j != null) {
            Object no = j.opt("no");
            if (no instanceof Number) return SITE + "/?v=" + ((Number) no).intValue();
        }
        return SITE + "/";
    }

    /** 서버에 보내는 본문 — 액션 이름과 (시험판에서만) 날짜. ⚠️ user_id·개인정보는 절대 넣지 않는다. */
    public static String requestBody(String action, String date) {
        JSONObject body = new JSONObject();
        try {
            body.put("action", action);
            if (date != null && !date.isEmpty()) body.put("date", date);
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
        return body.toString();
    }
}
