package com.kesyzegarra.versiculos;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

/** Notificación fija que se ve en la pantalla de bloqueo. */
public final class NotificationHelper {
    static final String CHANNEL = "versiculo";
    static final int ID = 1;

    public static void show(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Versículo del día",
                NotificationManager.IMPORTANCE_DEFAULT);
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setShowBadge(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);

        Verses.Verse v = Verses.current(c);
        PendingIntent open = PendingIntent.getActivity(c, 0,
                new Intent(c, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent next = UpdateReceiver.nextIntent(c, 2);

        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_book)
                .setContentTitle(v.ref)
                .setContentText(v.text)
                .setStyle(new Notification.BigTextStyle().bigText(v.text))
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setContentIntent(open)
                .addAction(new Notification.Action.Builder(null, "Otro versículo", next).build())
                .build();
        nm.notify(ID, n);
    }

    public static void hide(Context c) {
        c.getSystemService(NotificationManager.class).cancel(ID);
    }

    private NotificationHelper() { }
}
