package com.kesyzegarra.versiculos;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class UpdateReceiver extends BroadcastReceiver {
    static final String ACTION_DAILY = "com.kesyzegarra.versiculos.DAILY";
    static final String ACTION_NEXT = "com.kesyzegarra.versiculos.NEXT";

    static PendingIntent nextIntent(Context c, int requestCode) {
        Intent i = new Intent(c, UpdateReceiver.class).setAction(ACTION_NEXT);
        return PendingIntent.getBroadcast(c, requestCode, i,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        final Context c = context.getApplicationContext();
        if (ACTION_NEXT.equals(intent.getAction())) Verses.next(c);
        // Actualizar al instante el widget, y el fondo en segundo plano.
        VerseWidget.refreshAll(c);
        final PendingResult pr = goAsync();
        new Thread(() -> {
            try { Scheduler.refreshEverything(c); } finally { pr.finish(); }
        }).start();
    }
}
