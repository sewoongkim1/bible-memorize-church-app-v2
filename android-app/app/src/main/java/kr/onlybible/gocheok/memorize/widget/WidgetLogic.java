package kr.onlybible.gocheok.memorize.widget;

import java.util.ArrayList;
import java.util.List;

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
    public static final String PSALM_URL = SITE + "/?w=psalm";

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

    // ── 돌려 보기 위젯(2026-10-13 · 아이폰 TodayVerseWidgetBundle.swift 의 RotateWidget 과 같은 규칙) ──
    //   이번주 말씀 → 오늘의 묵상 → 축복 기도문 → 쉴만한 물가가 30분마다 바뀐다. 쓸 수 없는 것은 그 장만 빠진다.

    /** 한 장이 떠 있는 시간(친구 결정 2026-10-07 · 아이폰 rotateSeconds). 너무 짧으면 읽다가 바뀐다. */
    public static final long ROTATE_MS = 30 * MINUTE;

    /** 몇째 장인가 = 시각을 30분으로 나눈 몫 % 장 수 — 다시 받아도 같은 시각에는 같은 장(첫 장으로 되돌아가지 않는다). */
    public static int rotateIndex(long nowMillis, int count) {
        if (count <= 0) return 0;
        return (int) ((nowMillis / ROTATE_MS) % count);
    }

    /** 다음 장이 바뀌는 때(다음 30분 경계). 딱 경계면 그다음. */
    public static long nextRotateAt(long nowMillis) {
        return (nowMillis / ROTATE_MS + 1) * ROTATE_MS;
    }

    /** 다음에 깨울 때 — 다음 장 바뀜과 (앞날의) 다시 받기 중 이른 때. */
    public static long rotateAlarmAt(long nowMillis, long nextFetchMillis) {
        long slide = nextRotateAt(nowMillis);
        return (nextFetchMillis > nowMillis && nextFetchMillis < slide) ? nextFetchMillis : slide;
    }

    /** 지금 새로 받을까 — 처음이거나 때가 됐거나, 남은 시간이 6시간 반을 넘으면(폰 시계를 뒤로 돌렸다) 받는다. */
    public static boolean rotateShouldFetch(long nowMillis, long nextFetchMillis) {
        return nextFetchMillis <= 0 || nowMillis >= nextFetchMillis || nextFetchMillis - nowMillis > 6 * HOUR + ROTATE_MS;
    }

    /** 받은 응답을 적어 둘 만한가 — 위젯마다의 규칙과 같다. 쉴만한 물가는 「아직 열리지 않음」(ready:false)도 지금의 진짜 상태다. */
    public static boolean rotateValid(String key, JSONObject j) {
        switch (key) {
            case "verse": return verseValid(j);
            case "meditation": return meditationValid(j);
            case "blessing": return blessingValid(j);
            case "psalm": return j != null && j.optBoolean("ok");
            default: return false;
        }
    }

    /** 돌려 보기의 한 장. */
    public static final class Slide {
        public final String kind;     // verse · meditation · blessing · psalm
        public final String header;   // 머리줄(마크 옆)
        public final String title;    // 제목(없으면 "")
        public final String body;
        public final String footer;   // 출처(없으면 "")
        public final String url;      // 누르면 열 화면

        Slide(String kind, String header, String title, String body, String footer, String url) {
            this.kind = kind;
            this.header = header;
            this.title = title;
            this.body = body;
            this.footer = footer;
            this.url = url;
        }
    }

    private static String trimmed(JSONObject j, String key) {
        return str(j, key).trim();
    }

    /** 받아 둔 것 → 장 목록(아이폰 rotateSlides). 하나가 비어도 나머지는 돈다. */
    public static List<Slide> rotateSlides(JSONObject verse, JSONObject meditation, JSONObject blessing, JSONObject psalm) {
        List<Slide> out = new ArrayList<>();

        String verseText = trimmed(verse, "text");
        if (!verseText.isEmpty()) {
            out.add(new Slide("verse", "이번주 말씀", "", verseText, trimmed(verse, "ref"), verseUrl(verse)));
        }

        // 묵상 — 본문이 비고 질문만 오는 날에는 질문을 본문 자리에(MeditationWidget 과 같다)
        String message = trimmed(meditation, "message");
        String body = message.isEmpty() ? trimmed(meditation, "question") : message;
        if (!body.isEmpty()) {
            out.add(new Slide("meditation", meditationTitle(trimmed(meditation, "dayLabel")),
                    trimmed(meditation, "heading"), body, "", MEDITATION_URL));
        }

        String prayer = trimmed(blessing, "prayer");
        if (!prayer.isEmpty()) {
            out.add(new Slide("blessing", "축복 기도문", trimmed(blessing, "title"), prayer,
                    trimmed(blessing, "ref"), PRAYER_URL));
        }

        // 쉴만한 물가 — ready 가 아니면(게이트 꺼짐·시작 전) 이 장은 없다
        String psalmText = trimmed(psalm, "text");
        if (psalm != null && psalm.optBoolean("ready") && !psalmText.isEmpty()) {
            out.add(new Slide("psalm", "쉴만한 물가", "", psalmText, trimmed(psalm, "ref"), PSALM_URL));
        }
        return out;
    }

    /** 장마다 다른 색 한 줄(아이폰 rotateTint 의 시스템 색 — 파랑·초록·주황·청록). 밝을 때·어두울 때 바탕 둘 다에서 보인다. */
    public static int rotateTint(String kind) {
        switch (kind) {
            case "meditation": return 0xFF34C759;
            case "blessing": return 0xFFFF9500;
            case "psalm": return 0xFF30B0C7;
            default: return 0xFF007AFF;
        }
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
