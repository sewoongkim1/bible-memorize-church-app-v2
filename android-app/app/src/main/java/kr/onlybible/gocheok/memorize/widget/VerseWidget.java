package kr.onlybible.gocheok.memorize.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

import kr.onlybible.gocheok.memorize.R;

/**
 * 이번주 말씀 — 가로로 긴 것(4×2), 세로로 늘리면 같은 말씀을 글씨만 크게.
 * 누르면 그 구절 암송 화면(/?v=번호 — 로그인 없이도 열린다).
 */
public class VerseWidget extends BaseWidgetProvider {
    @Override protected String kind() { return "verse"; }
    @Override protected String action() { return "getWeeklyVerse"; }
    @Override protected int requestCode() { return 1; }
    @Override protected boolean isValid(JSONObject json) { return WidgetLogic.verseValid(json); }

    @Override
    protected RemoteViews render(Context c, JSONObject json, boolean large) {
        RemoteViews v = new RemoteViews(c.getPackageName(),
                large ? R.layout.widget_verse_large : R.layout.widget_verse_medium);
        if (WidgetLogic.verseValid(json)) {
            v.setTextViewText(R.id.widget_body, WidgetLogic.str(json, "text"));
            setTextOrHide(v, R.id.widget_ref, WidgetLogic.str(json, "ref"));
        } else {
            v.setTextViewText(R.id.widget_body, c.getString(R.string.widget_verse_fail));
            setTextOrHide(v, R.id.widget_ref, "");
        }
        v.setOnClickPendingIntent(R.id.widget_root, openApp(c, WidgetLogic.verseUrl(json)));
        return v;
    }
}
