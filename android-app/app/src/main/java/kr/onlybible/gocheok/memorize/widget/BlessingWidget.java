package kr.onlybible.gocheok.memorize.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

import kr.onlybible.gocheok.memorize.R;

/**
 * 오늘의 축복 기도문 — 앱의 「오늘 한 편」과 같은 편(getTodayBlessing).
 * ⚠️ 위젯은 로그인 이름을 모른다 — 이름 자리는 서버가 「우리 가족」으로 채운다.
 * 누르면 기도문 화면(/?w=prayer) — 앱은 로그인한 이름으로 같은 편을 보인다.
 */
public class BlessingWidget extends BaseWidgetProvider {
    @Override protected String kind() { return "blessing"; }
    @Override protected String action() { return "getTodayBlessing"; }
    @Override protected int requestCode() { return 3; }
    @Override protected boolean isValid(JSONObject json) { return WidgetLogic.blessingValid(json); }

    @Override
    protected RemoteViews render(Context c, JSONObject json, boolean large) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_blessing);
        if (WidgetLogic.blessingValid(json)) {
            setTextOrHide(v, R.id.widget_heading, WidgetLogic.str(json, "title"));
            setTextOrHide(v, R.id.widget_ref, WidgetLogic.str(json, "ref"));
            v.setTextViewText(R.id.widget_body, WidgetLogic.str(json, "prayer"));
        } else {
            setTextOrHide(v, R.id.widget_heading, "");
            setTextOrHide(v, R.id.widget_ref, "");
            v.setTextViewText(R.id.widget_body, c.getString(R.string.widget_blessing_fail));
        }
        v.setOnClickPendingIntent(R.id.widget_root, openApp(c, WidgetLogic.PRAYER_URL));
        return v;
    }
}
