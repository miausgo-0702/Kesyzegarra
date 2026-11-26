package com.kesyzegarra.horarios;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Corre cada ~15 minutos aunque la app esté cerrada: consulta en Firestore los cambios
 * pendientes del empleado y muestra una notificación por cada cambio nuevo.
 */
public class RevisarCambiosWorker extends Worker {
    public RevisarCambiosWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    @NonNull @Override
    public Result doWork() {
        SharedPreferences p = getApplicationContext().getSharedPreferences(Notifs.PREFS, Context.MODE_PRIVATE);
        String ses = p.getString("sesion", "");
        if (ses.isEmpty()) return Result.success();
        try {
            JSONObject s = new JSONObject(ses);
            String apiKey = s.getString("apiKey"), proyecto = s.getString("projectId"), persona = s.getString("persona");
            // 1) token de acceso a partir del token de renovación de la sesión
            JSONObject tok = new JSONObject(http("https://securetoken.googleapis.com/v1/token?key=" + URLEncoder.encode(apiKey, "UTF-8"),
                    "application/x-www-form-urlencoded",
                    "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(s.getString("refreshToken"), "UTF-8"), null));
            s.put("refreshToken", tok.getString("refresh_token"));
            p.edit().putString("sesion", s.toString()).apply();
            // 2) cambios pendientes de esta persona
            String q = "{\"structuredQuery\":{\"from\":[{\"collectionId\":\"cambios\"}],\"where\":{\"compositeFilter\":{\"op\":\"AND\",\"filters\":["
                    + "{\"fieldFilter\":{\"field\":{\"fieldPath\":\"persona\"},\"op\":\"EQUAL\",\"value\":{\"stringValue\":" + JSONObject.quote(persona) + "}}},"
                    + "{\"fieldFilter\":{\"field\":{\"fieldPath\":\"estado\"},\"op\":\"EQUAL\",\"value\":{\"stringValue\":\"pendiente\"}}}]}}}}";
            JSONArray res = new JSONArray(http("https://firestore.googleapis.com/v1/projects/" + proyecto + "/databases/(default)/documents:runQuery",
                    "application/json", q, tok.getString("id_token")));
            // 3) agrupar por lote (un cambio de varios días = una notificación)
            Map<String, String[]> lotes = new LinkedHashMap<>();
            for (int i = 0; i < res.length(); i++) {
                JSONObject d = res.getJSONObject(i).optJSONObject("document");
                if (d == null) continue;
                JSONObject f = d.getJSONObject("fields");
                String nombre = d.getString("name");
                String lote = f.has("lote") ? f.getJSONObject("lote").optString("stringValue") : nombre.substring(nombre.lastIndexOf('/') + 1);
                String fecha = f.getJSONObject("fecha").optString("stringValue");
                boolean trabaja = f.has("t") && f.getJSONObject("t").optBoolean("booleanValue");
                String h = f.has("h") ? f.getJSONObject("h").optString("stringValue") : "";
                String por = f.has("por") ? f.getJSONObject("por").optString("stringValue") : "un administrador";
                String que = trabaja ? (h.isEmpty() ? "trabajás" : "trabajás " + h) : "franco";
                String[] prev = lotes.get(lote);
                if (prev == null) lotes.put(lote, new String[]{fecha, fecha, que, por});
                else { if (fecha.compareTo(prev[0]) < 0) prev[0] = fecha; if (fecha.compareTo(prev[1]) > 0) prev[1] = fecha; }
            }
            for (Map.Entry<String, String[]> e : lotes.entrySet()) {
                String[] v = e.getValue();
                String cuando = v[0].equals(v[1]) ? fmt(v[0]) : "Del " + fmt(v[0]) + " al " + fmt(v[1]);
                Notifs.mostrar(getApplicationContext(), e.getKey(), "Cambio en tu horario",
                        cuando + ": " + v[2] + ". Lo cargó " + v[3] + ". Tocá para aprobarlo.");
            }
            return Result.success();
        } catch (Exception ex) {
            return Result.retry();
        }
    }

    private static String fmt(String ymd) {
        String[] m = {"ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"};
        String[] x = ymd.split("-");
        return Integer.parseInt(x[2]) + " " + m[Integer.parseInt(x[1]) - 1];
    }

    private static String http(String url, String tipo, String cuerpo, String token) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(15000);
        c.setRequestMethod("POST"); c.setDoOutput(true);
        c.setRequestProperty("Content-Type", tipo);
        if (token != null) c.setRequestProperty("Authorization", "Bearer " + token);
        try (OutputStream o = c.getOutputStream()) { o.write(cuerpo.getBytes("UTF-8")); }
        int cod = c.getResponseCode();
        InputStream in = cod < 400 ? c.getInputStream() : c.getErrorStream();
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[8192]; int n;
        while (in != null && (n = in.read(buf)) > 0) b.write(buf, 0, n);
        if (cod >= 400) throw new Exception("HTTP " + cod);
        return b.toString("UTF-8");
    }
}
