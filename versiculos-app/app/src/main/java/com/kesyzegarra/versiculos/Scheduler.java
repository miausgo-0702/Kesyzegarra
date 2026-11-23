package com.kesyzegarra.versiculos;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

import java.time.LocalDate;
import java.time.ZoneId;

/** Programa la actualización diaria (poco después de medianoche). */
public final class Scheduler {

    public static void scheduleDaily(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        Intent i = new Intent(c, UpdateReceiver.class).setAction(UpdateReceiver.ACTION_DAILY);
        PendingIntent pi = PendingIntent.getBroadcast(c, 10, i,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        long nextMidnight = LocalDate.now().plusDays(1).atStartOfDay(ZoneId.systemDefault())
                .toInstant().toEpochMilli() + 60_000;
        am.setInexactRepeating(AlarmManager.RTC, nextMidnight, AlarmManager.INTERVAL_DAY, pi);
    }

    /** Actualiza todo lo que el usuario tenga activado. Llamar fuera del hilo principal si incluye fondo. */
    public static void refreshEverything(Context c) {
        VerseWidget.refreshAll(c);
        if (Verses.prefs(c).getBoolean(Verses.KEY_NOTIFICATION, false)) NotificationHelper.show(c);
        if (Verses.prefs(c).getBoolean(Verses.KEY_WALLPAPER, false)) {
            try { WallpaperHelper.applyToLockScreen(c); } catch (Exception ignored) { }
        }
    }

    private Scheduler() { }
}
