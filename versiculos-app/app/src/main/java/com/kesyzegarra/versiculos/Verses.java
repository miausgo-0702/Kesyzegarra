package com.kesyzegarra.versiculos;

import android.content.Context;
import android.content.SharedPreferences;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** Carga los versículos y decide cuál toca hoy. */
public final class Verses {

    public static final class Verse {
        public final String ref;
        public final String text;
        Verse(String ref, String text) { this.ref = ref; this.text = text; }
    }

    private static List<Verse> cache;

    static final String PREFS = "versiculos";
    static final String KEY_OFFSET = "offset";
    static final String KEY_WALLPAPER = "wallpaper";
    static final String KEY_NOTIFICATION = "notification";
    static final String KEY_THEME = "theme";

    public static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static synchronized List<Verse> all(Context c) {
        if (cache != null) return cache;
        List<Verse> list = new ArrayList<>();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(
                c.getAssets().open("versiculos.txt"), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty() || line.startsWith("#")) continue;
                int bar = line.indexOf('|');
                if (bar <= 0) continue;
                list.add(new Verse(line.substring(0, bar).trim(), line.substring(bar + 1).trim()));
            }
        } catch (Exception ignored) { }
        if (list.isEmpty()) list.add(new Verse("Salmos 23:1", "Jehová es mi pastor; nada me faltará."));
        cache = list;
        return list;
    }

    /** Versículo actual: depende del día + los saltos que el usuario haya pedido. */
    public static Verse current(Context c) {
        List<Verse> list = all(c);
        long day = LocalDate.now().toEpochDay();
        // Multiplicar por un primo "mezcla" el orden para que días seguidos no sean versículos seguidos.
        long idx = day * 37 + prefs(c).getLong(KEY_OFFSET, 0);
        return list.get((int) Math.floorMod(idx, (long) list.size()));
    }

    public static void next(Context c) {
        SharedPreferences p = prefs(c);
        p.edit().putLong(KEY_OFFSET, p.getLong(KEY_OFFSET, 0) + 1).apply();
    }

    private Verses() { }
}
