package kr.onlybible.gocheok.memorize.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

import kr.onlybible.gocheok.memorize.R;

/**
 * 오늘의 묵상 — 이번 주 설교의 오늘 요일 묵상. 무엇을 보일지는 서버가 앱과 같은 규칙으로 고른다
 * (getTodayMeditation · tests/widget-parity.py). 누르면 앱의 매일 묵상 창(/?w=meditation).
 */
public class MeditationWidget extends BaseWidgetProvider {
    @Override protected String kind() { return "meditation"; }
    @Override protected String action() { return "getTodayMeditation"; }
    @Override protected int requestCode() { return 2; }
    @Override protected boolean isValid(JSONObject json) { return WidgetLogic.meditationValid(json); }

    /** 주일 오후에 올라오는 설교가 늦어도 반나절 안에 따라오게 — 다음 자정과 6시간 뒤 중 이른 때. */
    @Override protected long nextRefresh(long now) { return WidgetLogic.meditationNext(now); }

    @Override
    protected RemoteViews render(Context c, JSONObject json, boolean large) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_meditation);
        v.setTextViewText(R.id.widget_title, WidgetLogic.meditationTitle(WidgetLogic.str(json, "dayLabel")));
        if (WidgetLogic.meditationValid(json)) {
            setTextOrHide(v, R.id.widget_heading, WidgetLogic.str(json, "heading"));
            v.setTextViewText(R.id.widget_body, WidgetLogic.meditationBody(json));
        } else {
            setTextOrHide(v, R.id.widget_heading, "");
            v.setTextViewText(R.id.widget_body, c.getString(R.string.widget_meditation_fail));
        }
        v.setOnClickPendingIntent(R.id.widget_root, openApp(c, WidgetLogic.MEDITATION_URL));
        return v;
    }
}
