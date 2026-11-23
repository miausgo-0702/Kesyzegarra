package com.kesyzegarra.versiculos;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        final Context c = context.getApplicationContext();
        Scheduler.scheduleDaily(c);
        final PendingResult pr = goAsync();
        new Thread(() -> {
            try { Scheduler.refreshEverything(c); } finally { pr.finish(); }
        }).start();
    }
}
