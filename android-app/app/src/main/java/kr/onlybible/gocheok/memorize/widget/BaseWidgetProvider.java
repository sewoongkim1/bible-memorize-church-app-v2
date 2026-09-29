package kr.onlybible.gocheok.memorize.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import kr.onlybible.gocheok.memorize.LauncherActivity;

/**
 * 위젯 셋이 함께 쓰는 뼈대 — 받아 오기 → 그리기 → 다음 새로 고침 예약, 그리고 누르면 앱 열기.
 * 아이폰 WidgetShared.swift 의 fetchWithFallback · refreshDate 와 같은 규칙이다.
 * ⚠️ 위젯은 로그인 없이 보이는 공개 정보만 다룬다 — user_id·개인정보는 보내지도 담지도 않는다.
 */
public abstract class BaseWidgetProvider extends AppWidgetProvider {

    /** 마지막 성공 응답을 적어 둘 이름(위젯마다 다르게). */
    protected abstract String kind();

    /** 부를 서버 액션. */
    protected abstract String action();

    /** PendingIntent 요청 번호 — 위젯마다 달라야 서로 덮어쓰지 않는다. */
    protected abstract int requestCode();

    protected abstract boolean isValid(JSONObject json);

    /** json 은 null 일 수 있다(한 번도 받지 못했을 때). large 는 세로로 늘렸는지. */
    protected abstract RemoteViews render(Context context, JSONObject json, boolean large);

    /** 새로 받았을 때 다음 새로 고침 시각. 기본은 다음 한국 자정. */
    protected long nextRefresh(long now) {
        return WidgetLogic.nextKstMidnight(now);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        final PendingResult result = goAsync();
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                refresh(app);
            } finally {
                result.finish();
            }
        }).start();
    }

    private void refresh(Context app) {
        JSONObject fetched = WidgetApi.call(action());
        boolean fresh = isValid(fetched);
        JSONObject json;
        if (fresh) {
            WidgetStore.save(app, kind(), fetched);
            json = fetched;
        } else {
            json = WidgetStore.load(app, kind());   // 통신이 안 되면 마지막 성공분(없으면 null → 실패 문구)
        }
        AppWidgetManager manager = AppWidgetManager.getInstance(app);
        for (int id : ids(app)) {
            manager.updateAppWidget(id, render(app, json, isLarge(manager, id)));
        }
        long now = System.currentTimeMillis();
        schedule(app, WidgetLogic.refreshAt(fresh, nextRefresh(now), now));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        // 크기를 바꿨을 때 — 새로 받지 않고 적어 둔 것으로 모양만 다시 그린다.
        manager.updateAppWidget(appWidgetId,
                render(context, WidgetStore.load(context, kind()), isLarge(manager, appWidgetId)));
    }

    @Override
    public void onDisabled(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(refreshIntent(context));
    }

    private int[] ids(Context c) {
        return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, getClass()));
    }

    private static boolean isLarge(AppWidgetManager manager, int id) {
        Bundle o = manager.getAppWidgetOptions(id);
        // 폰을 세워 들었을 때의 실제 크기 = 너비 MIN_WIDTH · 높이 MAX_HEIGHT
        return WidgetLogic.useLargeLayout(o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH),
                o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT));
    }

    // ⚠️ 정확한 시각 알람(setExact*)은 쓰지 않는다 — 안드로이드 12+ 에서 SCHEDULE_EXACT_ALARM 권한이 필요하다.
    //    RTC(깨우지 않음): 폰이 잠들어 있으면 다음에 깰 때 새로 고친다. 화면을 켜야 위젯이 보이니 충분하다.
    private void schedule(Context c, long at) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.set(AlarmManager.RTC, at, refreshIntent(c));
    }

    private PendingIntent refreshIntent(Context c) {
        Intent i = new Intent(c, getClass()).setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids(c));
        return PendingIntent.getBroadcast(c, requestCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
    }

    /**
     * 누르면 우리 앱(TWA)을 그 주소로 연다. 자기 패키지의 LauncherActivity 를 콕 집어 부르므로
     * 시험판 위젯은 시험판을, 정식판 위젯은 정식판을 연다. LauncherActivity.getLaunchingUrl() 이 인텐트 주소를 쓴다.
     */
    protected PendingIntent openApp(Context c, String url) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.setClass(c, LauncherActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, requestCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
    }

    protected static void setTextOrHide(RemoteViews v, int viewId, String text) {
        if (text == null || text.isEmpty()) {
            v.setViewVisibility(viewId, View.GONE);
        } else {
            v.setViewVisibility(viewId, View.VISIBLE);
            v.setTextViewText(viewId, text);
        }
    }

    private static int immutable() {
        return Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
    }
}
