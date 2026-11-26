package com.kesyzegarra.horarios;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/** Muestra la app web incluida en el APK, servida desde https://appassets.androidplatform.net */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 21) w.setStatusBarColor(Color.parseColor("#3a4108"));

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                // enlaces externos: se abren en el navegador
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });
        web.addJavascriptInterface(new Puente(), "AndroidApp");
        Notifs.crearCanal(this);
        setContentView(web);
        boolean abrirNotifs = "notificaciones".equals(getIntent().getStringExtra("abrir"));
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("https://" + HOST + "/index.html" + (abrirNotifs ? "#notificaciones" : ""));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if ("notificaciones".equals(intent.getStringExtra("abrir")))
            web.evaluateJavascript("window.abrirNotificaciones && window.abrirNotificaciones()", null);
    }

    /** Funciones que la app web puede llamar como window.AndroidApp.* */
    private class Puente {
        @JavascriptInterface
        public String permiso() {
            if (Notifs.permitido(MainActivity.this)) return "granted";
            if (Build.VERSION.SDK_INT >= 33 && !getSharedPreferences(Notifs.PREFS, MODE_PRIVATE).getBoolean("pidio", false)) return "default";
            return "denied";
        }

        @JavascriptInterface
        public void pedirPermiso() {
            if (Build.VERSION.SDK_INT < 33) return;
            runOnUiThread(() -> {
                if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    getSharedPreferences(Notifs.PREFS, MODE_PRIVATE).edit().putBoolean("pidio", true).apply();
                    requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 7);
                }
            });
        }

        @JavascriptInterface
        public void notificar(String id, String titulo, String texto) {
            Notifs.mostrar(MainActivity.this, id, titulo, texto);
        }

        /** Guarda (o borra) la sesión para revisar cambios en segundo plano. */
        @JavascriptInterface
        public void guardarSesion(String json) {
            Context c = getApplicationContext();
            SharedPreferences p = c.getSharedPreferences(Notifs.PREFS, MODE_PRIVATE);
            WorkManager wm = WorkManager.getInstance(c);
            if (json == null || json.isEmpty()) {
                p.edit().remove("sesion").apply();
                wm.cancelUniqueWork("revisar-cambios");
                return;
            }
            p.edit().putString("sesion", json).apply();
            PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(RevisarCambiosWorker.class, 15, TimeUnit.MINUTES)
                    .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .build();
            wm.enqueueUniquePeriodicWork("revisar-cambios", ExistingPeriodicWorkPolicy.UPDATE, req);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
