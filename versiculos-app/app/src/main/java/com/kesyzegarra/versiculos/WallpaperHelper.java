package com.kesyzegarra.versiculos;

import android.app.WallpaperManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.util.DisplayMetrics;
import android.view.WindowManager;

/** Dibuja el versículo en una imagen y la pone como fondo de la pantalla de bloqueo. */
public final class WallpaperHelper {

    /** Pares de colores (arriba, abajo) para el degradado. */
    static final int[][] THEMES = {
            {0xFF141E30, 0xFF243B55},   // azul noche
            {0xFF3A1C71, 0xFFD76D77},   // atardecer
            {0xFF0F2027, 0xFF2C5364},   // océano
            {0xFF232526, 0xFF414345},   // grafito
            {0xFF134E5E, 0xFF71B280},   // bosque
            {0xFF4B134F, 0xFFC94B4B},   // vino
    };
    static final String[] THEME_NAMES = {"Azul noche", "Atardecer", "Océano", "Grafito", "Bosque", "Vino"};

    public static Bitmap render(Context c, Verses.Verse v, int w, int h) {
        int theme = Math.floorMod(Verses.prefs(c).getInt(Verses.KEY_THEME, 0), THEMES.length);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);

        Paint bg = new Paint();
        bg.setShader(new LinearGradient(0, 0, w * 0.3f, h, THEMES[theme][0], THEMES[theme][1], Shader.TileMode.CLAMP));
        canvas.drawRect(0, 0, w, h, bg);

        int margin = (int) (w * 0.10f);
        int textWidth = w - 2 * margin;

        TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        tp.setColor(Color.WHITE);
        tp.setTypeface(Typeface.create(Typeface.SERIF, Typeface.NORMAL));
        tp.setShadowLayer(w * 0.006f, 0, w * 0.003f, 0x80000000);

        String body = "“" + v.text + "”";
        // Tamaño de letra que quepa en ~40% del alto (debajo del reloj, encima de los atajos).
        float size = w * 0.068f;
        StaticLayout layout;
        while (true) {
            tp.setTextSize(size);
            layout = StaticLayout.Builder.obtain(body, 0, body.length(), tp, textWidth)
                    .setAlignment(Layout.Alignment.ALIGN_CENTER)
                    .setLineSpacing(0, 1.18f)
                    .build();
            if (layout.getHeight() <= h * 0.40f || size < w * 0.03f) break;
            size *= 0.92f;
        }

        TextPaint rp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        rp.setColor(0xFFFFD9A0);
        rp.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));
        rp.setTextSize(Math.max(size * 0.72f, w * 0.035f));
        rp.setTextAlign(Paint.Align.CENTER);
        rp.setLetterSpacing(0.06f);
        rp.setShadowLayer(w * 0.006f, 0, w * 0.003f, 0x80000000);

        Rect rb = new Rect();
        rp.getTextBounds(v.ref, 0, v.ref.length(), rb);
        float gap = size * 1.1f;
        float block = layout.getHeight() + gap + rb.height();
        float top = h * 0.56f - block / 2f;   // un poco por debajo del centro para no tapar el reloj

        canvas.save();
        canvas.translate(margin, top);
        layout.draw(canvas);
        canvas.restore();

        canvas.drawText(v.ref.toUpperCase(), w / 2f, top + layout.getHeight() + gap + rb.height(), rp);
        return bmp;
    }

    public static void applyToLockScreen(Context c) throws Exception {
        WindowManager wm = c.getSystemService(WindowManager.class);
        int w, h;
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            Rect b = wm.getMaximumWindowMetrics().getBounds();
            w = b.width(); h = b.height();
        } else {
            DisplayMetrics dm = new DisplayMetrics();
            wm.getDefaultDisplay().getRealMetrics(dm);
            w = dm.widthPixels; h = dm.heightPixels;
        }
        if (w > h) { int t = w; w = h; h = t; }   // siempre vertical
        Bitmap bmp = render(c, Verses.current(c), w, h);
        WallpaperManager.getInstance(c).setBitmap(bmp, null, true, WallpaperManager.FLAG_LOCK);
        bmp.recycle();
    }

    /** Quita el versículo: la pantalla de bloqueo vuelve a usar el fondo de inicio. */
    public static void clearLockScreen(Context c) throws Exception {
        WallpaperManager.getInstance(c).clear(WallpaperManager.FLAG_LOCK);
    }

    private WallpaperHelper() { }
}
