package kr.onlybible.gocheok.memorize.widget;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import org.json.JSONObject;

import kr.onlybible.gocheok.memorize.BuildConfig;

/**
 * 서버의 공개 읽기 액션을 한 번 부른다. 성공(200 + JSON)이면 그 JSON, 아니면 null.
 * 아이폰 WidgetShared.swift 의 callWidgetApi 와 같은 주소·머리말이다.
 * ⚠️ 네트워크라 메인 스레드에서 부르지 말 것(BaseWidgetProvider 가 따로 스레드를 연다).
 * ⚠️ 공개 키는 앱 코드에 이미 있는 공개 값이다. 여기에 관리자 비번·서비스 키를 넣지 말 것 — 저장소가 공개다.
 */
public final class WidgetApi {
    private WidgetApi() {}

    private static final String API_URL = "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api";
    private static final String ANON_KEY = "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-";
    private static final int TIMEOUT_MS = 8000;

    public static JSONObject call(String action) {
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(API_URL).openConnection();
            con.setRequestMethod("POST");
            con.setConnectTimeout(TIMEOUT_MS);
            con.setReadTimeout(TIMEOUT_MS);
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json");
            con.setRequestProperty("apikey", ANON_KEY);
            con.setRequestProperty("Authorization", "Bearer " + ANON_KEY);
            byte[] body = WidgetLogic.requestBody(action, BuildConfig.WIDGET_DATE).getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = con.getOutputStream()) {
                os.write(body);
            }
            if (con.getResponseCode() != 200) return null;
            try (InputStream is = con.getInputStream()) {
                return new JSONObject(readAll(is));
            }
        } catch (Exception e) {
            return null;   // 통신 실패 — 부르는 쪽이 적어 둔 마지막 것을 쓴다
        } finally {
            if (con != null) con.disconnect();
        }
    }

    private static String readAll(InputStream is) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = is.read(buf)) != -1) out.write(buf, 0, n);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }
}
