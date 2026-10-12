package kr.onlybible.gocheok.memorize.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import java.util.List;

import org.json.JSONObject;

import kr.onlybible.gocheok.memorize.LauncherActivity;
import kr.onlybible.gocheok.memorize.R;

/**
 * 말씀 · 묵상 · 기도 돌려 보기(2026-10-13 · 아이폰 1.1.1 의 RotateWidget 과 같은 위젯).
 * 이번주 말씀 → 오늘의 묵상 → 축복 기도문 → 쉴만한 물가가 **30분마다 저절로** 바뀐다. 오른쪽 위에 날짜·시각.
 * 누르면 그때 보이던 장의 화면으로 간다.
 *
 * 다른 위젯 셋(BaseWidgetProvider)과 달리 네 가지를 함께 받고, 받는 때와 장이 바뀌는 때가 따로라 뼈대를 따로 둔다.
 *   · 30분 경계마다 깨어(알람) 그 시각의 장을 그린다 — 몇째 장인지는 시각으로 정한다(WidgetLogic.rotateIndex).
 *   · 받는 것은 다음 한국 자정과 6시간 뒤 중 이른 때(묵상이 주일 오후 설교를 반나절 안에 따라가게) · 하나라도 못 받았으면 30분 뒤.
 *   · 받은 것은 종류마다 따로 적어 둔다(rotate-verse …) — 통신이 안 될 때도 마지막 것으로 돈다. 다른 위젯 셋의 것과는 따로다.
 * ⚠️ 장이 바뀌는 때는 몇 분 늦을 수 있다 — 정확한 시각 알람은 권한(SCHEDULE_EXACT_ALARM)이 들어 쓰지 않는다.
 *    안드로이드 12 부터는 늦어도 10분 안(setWindow 의 가장 짧은 폭). 시각 글자는 런처가 스스로 넘기므로(TextClock) 늘 맞다.
 * ⚠️ 로그인 없이 보이는 공개 정보만 다룬다 — user_id·개인정보는 보내지도 담지도 않는다.
 * ⚠️ 이 클래스 이름(매니페스트의 receiver)을 바꾸지 말 것 — 성도님이 놓아 둔 위젯이 이 이름으로 이어진다.
 */
public class RotateWidget extends AppWidgetProvider {
    private static final String[] KEYS = {"verse", "meditation", "blessing", "psalm"};
    private static final String[] ACTIONS = {"getWeeklyVerse", "getTodayMeditation", "getTodayBlessing", "getTodayPsalm"};
    private static final int REQUEST_CODE = 4;            // 다른 위젯(1·2·3)과 겹치지 않게
    private static final String PREFS = "widget-rotate";
    private static final String NEXT_FETCH = "next-fetch";
    private static final int[] DOTS = {R.id.widget_dot0, R.id.widget_dot1, R.id.widget_dot2, R.id.widget_dot3};

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        final PendingResult result = goAsync();
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                tick(app);
            } finally {
                result.finish();
            }
        }).start();
    }

    /** 깰 때마다 — (때가 됐으면) 받고, 지금 시각의 장을 그리고, 다음에 깰 때를 맞춘다. */
    private void tick(Context app) {
        SharedPreferences p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        long nextFetch = p.getLong(NEXT_FETCH, 0);
        if (WidgetLogic.rotateShouldFetch(now, nextFetch)) {
            boolean fresh = fetchAll(app);
            now = System.currentTimeMillis();
            nextFetch = WidgetLogic.refreshAt(fresh, WidgetLogic.meditationNext(now), now);
            p.edit().putLong(NEXT_FETCH, nextFetch).apply();
        }
        int[] ids = ids(app);
        if (ids.length == 0) return;                      // 다 치웠으면 깨우지 않는다
        RemoteViews views = render(app, now);
        AppWidgetManager manager = AppWidgetManager.getInstance(app);
        for (int id : ids) manager.updateAppWidget(id, views);
        schedule(app, WidgetLogic.rotateAlarmAt(now, nextFetch));
    }

    /** 넷을 함께 받는다. 하나라도 이번에 새로 못 받았으면 false(30분 뒤 다시). 쓸 만한 것만 적어 둔다. */
    private static boolean fetchAll(Context app) {
        final JSONObject[] got = new JSONObject[KEYS.length];
        Thread[] threads = new Thread[KEYS.length];
        for (int i = 0; i < KEYS.length; i++) {
            final int k = i;
            threads[i] = new Thread(() -> got[k] = WidgetApi.call(ACTIONS[k]));
            threads[i].start();
        }
        for (Thread t : threads) {
            try {
                t.join(20_000);                           // 하나는 길어도 연결 8초 + 읽기 8초
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        boolean all = true;
        for (int i = 0; i < KEYS.length; i++) {
            JSONObject j = got[i];
            if (WidgetLogic.rotateValid(KEYS[i], j)) {
                WidgetStore.save(app, "rotate-" + KEYS[i], j);
            } else {
                all = false;
            }
        }
        return all;
    }

    private static RemoteViews render(Context c, long now) {
        List<WidgetLogic.Slide> slides = WidgetLogic.rotateSlides(
                WidgetStore.load(c, "rotate-verse"), WidgetStore.load(c, "rotate-meditation"),
                WidgetStore.load(c, "rotate-blessing"), WidgetStore.load(c, "rotate-psalm"));
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_rotate);

        WidgetLogic.Slide s;
        int index, count;
        if (slides.isEmpty()) {
            // 한 번도 못 받았다 — 「말씀 · 묵상 · 기도」 / 「말씀을 불러오지 못했습니다」(아이폰 rotateEmpty)
            s = null;
            index = 0;
            count = 1;
        } else {
            count = slides.size();
            index = WidgetLogic.rotateIndex(now, count);
            s = slides.get(index);
        }
        String kind = s == null ? "verse" : s.kind;
        int tint = WidgetLogic.rotateTint(kind);

        v.setTextViewText(R.id.widget_title, s == null ? c.getString(R.string.widget_rotate_empty_header) : s.header);
        if (s == null) {
            v.setViewVisibility(R.id.widget_heading, View.GONE);
            v.setTextViewText(R.id.widget_body, c.getString(R.string.widget_verse_fail));
            v.setTextViewText(R.id.widget_ref, "");
        } else {
            setTextOrHide(v, R.id.widget_heading, s.title);
            v.setTextViewText(R.id.widget_body, s.body);
            v.setTextViewText(R.id.widget_ref, s.footer);  // 비어도 줄은 남긴다(오른쪽 점 자리)
        }

        // 장마다 다른 색 — 왼쪽 세로줄과 지금 장의 점. ⚠️ 런처는 같은 모양이면 옛 화면에 덧칠한다(reapply) —
        //    그래서 색은 장마다 **늘 다시** 정한다(지난 장의 색이 남지 않게). 0 은 색을 입히지 않는다.
        v.setInt(R.id.widget_bar, "setColorFilter", tint);
        for (int i = 0; i < DOTS.length; i++) {
            if (i >= count) {
                v.setViewVisibility(DOTS[i], View.GONE);
                continue;
            }
            v.setViewVisibility(DOTS[i], View.VISIBLE);
            boolean on = i == index;
            v.setImageViewResource(DOTS[i], on ? R.drawable.widget_rotate_dot : R.drawable.widget_rotate_dot_off);
            v.setInt(DOTS[i], "setColorFilter", on ? tint : 0);
        }

        v.setOnClickPendingIntent(R.id.widget_root, openApp(c, s == null ? WidgetLogic.SITE + "/" : s.url));
        return v;
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        // 크기를 바꿨을 때 — 새로 받지 않고 적어 둔 것으로 다시 그린다(글씨는 칸에 맞춰 저절로 줄고 는다).
        manager.updateAppWidget(appWidgetId, render(context, System.currentTimeMillis()));
    }

    @Override
    public void onDisabled(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(refreshIntent(context));
    }

    private int[] ids(Context c) {
        return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, getClass()));
    }

    // ⚠️ 정확한 시각 알람(setExact*)은 쓰지 않는다 — 안드로이드 12+ 에서 SCHEDULE_EXACT_ALARM 권한이 필요하다.
    //    setWindow 는 「이때부터 이 폭 안에」 — 그냥 set 은 30분 뒤 알람을 20분 넘게 미룰 수 있어 폭을 좁힌다
    //    (12+ 는 폭을 10분보다 좁게 못 한다 — 그래도 set 보다 낫다). RTC(깨우지 않음): 폰이 잠들어 있으면 깰 때 그린다.
    private void schedule(Context c, long at) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.setWindow(AlarmManager.RTC, at, 60_000L, refreshIntent(c));
    }

    private PendingIntent refreshIntent(Context c) {
        Intent i = new Intent(c, getClass()).setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids(c));
        return PendingIntent.getBroadcast(c, REQUEST_CODE, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** 누르면 우리 앱(TWA)을 그 주소로 연다 — BaseWidgetProvider.openApp 과 같다(시험판 위젯은 시험판을 연다). */
    private static PendingIntent openApp(Context c, String url) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.setClass(c, LauncherActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, REQUEST_CODE, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void setTextOrHide(RemoteViews v, int viewId, String text) {
        if (text == null || text.isEmpty()) {
            v.setViewVisibility(viewId, View.GONE);
        } else {
            v.setViewVisibility(viewId, View.VISIBLE);
            v.setTextViewText(viewId, text);
        }
    }
}
