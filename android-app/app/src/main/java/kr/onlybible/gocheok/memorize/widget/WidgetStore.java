package kr.onlybible.gocheok.memorize.widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * 위젯별 마지막 성공 응답 — 통신이 안 될 때 빈 위젯 대신 이것을 보인다(아이폰 saveLastGood/loadLastGood).
 * 공개 정보뿐이라 암호화하지 않는다.
 */
public final class WidgetStore {
    private WidgetStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("widget-last-good", Context.MODE_PRIVATE);
    }

    public static void save(Context c, String kind, JSONObject json) {
        prefs(c).edit().putString(kind, json.toString()).apply();
    }

    public static JSONObject load(Context c, String kind) {
        String s = prefs(c).getString(kind, null);
        if (s == null) return null;
        try {
            return new JSONObject(s);
        } catch (JSONException e) {
            return null;
        }
    }
}
