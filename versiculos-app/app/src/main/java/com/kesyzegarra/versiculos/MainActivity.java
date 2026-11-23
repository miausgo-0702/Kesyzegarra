package com.kesyzegarra.versiculos;

import android.Manifest;
import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {

    private ImageView preview;
    private Switch wallpaperSwitch, notifSwitch;
    private Button themeButton;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Scheduler.scheduleDaily(this);
        getWindow().setStatusBarColor(0xFF141E30);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(28), dp(20), dp(28));
        root.setBackgroundColor(0xFFF7F3EC);

        TextView title = text("Versículo Diario", 26, 0xFF141E30, true);
        root.addView(title);
        TextView sub = text("Así se verá tu pantalla de bloqueo:", 15, 0xFF555555, false);
        sub.setPadding(0, dp(4), 0, dp(12));
        root.addView(sub);

        preview = new ImageView(this);
        preview.setAdjustViewBounds(true);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(220), ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.CENTER_HORIZONTAL;
        preview.setLayoutParams(lp);
        preview.setClipToOutline(true);
        GradientDrawable round = new GradientDrawable();
        round.setCornerRadius(dp(18));
        round.setColor(Color.BLACK);
        preview.setBackground(round);
        root.addView(preview);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, dp(14), 0, 0);
        Button next = button("Otro versículo");
        next.setOnClickListener(v -> { Verses.next(this); refreshAsync(); });
        themeButton = button("");
        themeButton.setOnClickListener(v -> {
            int t = Verses.prefs(this).getInt(Verses.KEY_THEME, 0) + 1;
            Verses.prefs(this).edit().putInt(Verses.KEY_THEME, Math.floorMod(t, WallpaperHelper.THEMES.length)).apply();
            refreshAsync();
        });
        row.addView(next, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        row.addView(themeButton, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        root.addView(row);

        root.addView(section("Pantalla de bloqueo"));
        wallpaperSwitch = new Switch(this);
        wallpaperSwitch.setText("Poner el versículo como fondo de bloqueo (cambia cada día)");
        wallpaperSwitch.setTextSize(15);
        wallpaperSwitch.setPadding(0, dp(6), 0, dp(6));
        wallpaperSwitch.setChecked(Verses.prefs(this).getBoolean(Verses.KEY_WALLPAPER, false));
        wallpaperSwitch.setOnCheckedChangeListener((b, on) -> {
            Verses.prefs(this).edit().putBoolean(Verses.KEY_WALLPAPER, on).apply();
            new Thread(() -> {
                String msg;
                try {
                    if (on) { WallpaperHelper.applyToLockScreen(this); msg = "Listo: bloquea el teléfono para verlo"; }
                    else { WallpaperHelper.clearLockScreen(this); msg = "Fondo de bloqueo restaurado"; }
                } catch (Exception e) { msg = "No se pudo cambiar el fondo: " + e.getMessage(); }
                final String m = msg;
                runOnUiThread(() -> Toast.makeText(this, m, Toast.LENGTH_LONG).show());
            }).start();
        });
        root.addView(wallpaperSwitch);

        notifSwitch = new Switch(this);
        notifSwitch.setText("Mostrar también como notificación fija en el bloqueo");
        notifSwitch.setTextSize(15);
        notifSwitch.setPadding(0, dp(6), 0, dp(6));
        notifSwitch.setChecked(Verses.prefs(this).getBoolean(Verses.KEY_NOTIFICATION, false));
        notifSwitch.setOnCheckedChangeListener((b, on) -> {
            Verses.prefs(this).edit().putBoolean(Verses.KEY_NOTIFICATION, on).apply();
            if (on) {
                if (Build.VERSION.SDK_INT >= 33
                        && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
                }
                NotificationHelper.show(this);
            } else {
                NotificationHelper.hide(this);
            }
        });
        root.addView(notifSwitch);

        root.addView(section("Widget"));
        TextView help = text("Mantén pulsado un espacio vacío de la pantalla de inicio → Widgets → "
                + "\"Versículo Diario\". En los teléfonos y tabletas que permiten widgets en la pantalla "
                + "de bloqueo (Android 15/16 en algunos modelos) también aparece allí. "
                + "Toca el widget para ver otro versículo.", 14, 0xFF444444, false);
        root.addView(help);
        Button pin = button("Añadir widget a la pantalla de inicio");
        pin.setOnClickListener(v -> {
            AppWidgetManager mgr = getSystemService(AppWidgetManager.class);
            if (mgr.isRequestPinAppWidgetSupported()) {
                mgr.requestPinAppWidget(new ComponentName(this, VerseWidget.class), null, null);
            } else {
                Toast.makeText(this, "Tu lanzador no lo permite; añádelo manualmente desde Widgets", Toast.LENGTH_LONG).show();
            }
        });
        LinearLayout.LayoutParams plp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        plp.topMargin = dp(8);
        root.addView(pin, plp);

        TextView foot = text("Textos: Reina-Valera 1960", 12, 0xFF888888, false);
        foot.setGravity(Gravity.CENTER);
        foot.setPadding(0, dp(24), 0, 0);
        root.addView(foot);

        ScrollView sv = new ScrollView(this);
        sv.setFillViewport(true);
        sv.setBackgroundColor(0xFFF7F3EC);
        sv.addView(root);
        setContentView(sv);
    }

    @Override
    protected void onResume() {
        super.onResume();
        updatePreview();
    }

    private void updatePreview() {
        int t = Math.floorMod(Verses.prefs(this).getInt(Verses.KEY_THEME, 0), WallpaperHelper.THEMES.length);
        themeButton.setText("Color: " + WallpaperHelper.THEME_NAMES[t]);
        Bitmap b = WallpaperHelper.render(this, Verses.current(this), 540, 1170);
        preview.setImageBitmap(b);
    }

    private void refreshAsync() {
        updatePreview();
        VerseWidget.refreshAll(this);
        new Thread(() -> Scheduler.refreshEverything(getApplicationContext())).start();
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(android.graphics.Typeface.SERIF, android.graphics.Typeface.BOLD);
        return t;
    }

    private TextView section(String s) {
        TextView t = text(s, 18, 0xFF141E30, true);
        t.setPadding(0, dp(24), 0, dp(4));
        return t;
    }

    private Button button(String s) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        return b;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
