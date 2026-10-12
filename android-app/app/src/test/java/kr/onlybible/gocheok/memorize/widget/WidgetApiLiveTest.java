package kr.onlybible.gocheok.memorize.widget;

import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

// 운영 서버의 공개 읽기 액션 셋을 진짜로 불러 본다(인터넷이 필요하다). 읽기만 하고 아무것도 쓰지 않는다.
public class WidgetApiLiveTest {
    @Test public void weeklyVerse() {
        JSONObject j = WidgetApi.call("getWeeklyVerse");
        assertTrue("이번주 말씀을 못 받았다: " + j, WidgetLogic.verseValid(j));
    }

    @Test public void todayMeditation() {
        JSONObject j = WidgetApi.call("getTodayMeditation");
        assertTrue("오늘의 묵상을 못 받았다: " + j, WidgetLogic.meditationValid(j));
    }

    @Test public void todayBlessing() {
        JSONObject j = WidgetApi.call("getTodayBlessing");
        assertTrue("오늘의 기도문을 못 받았다: " + j, WidgetLogic.blessingValid(j));
    }

    // 돌려 보기 넷째 장(2026-10-13) — 열려 있으면 ready:true 와 본문, 닫혀 있어도 ok:true(그 장만 빠진다)
    @Test public void todayPsalm() {
        JSONObject j = WidgetApi.call("getTodayPsalm");
        assertTrue("쉴만한 물가 응답을 못 받았다: " + j, WidgetLogic.rotateValid("psalm", j));
        assertTrue("ready 인데 본문이 없다: " + j, !j.optBoolean("ready") || !WidgetLogic.str(j, "text").isEmpty());
    }
}
