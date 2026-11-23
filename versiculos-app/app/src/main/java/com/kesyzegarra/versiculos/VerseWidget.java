package com.kesyzegarra.versiculos;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.widget.RemoteViews;

/** Widget para la pantalla de inicio y (en los móviles que lo permiten) la de bloqueo. */
public class VerseWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context c, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(c));
        Scheduler.scheduleDaily(c);
    }

    static RemoteViews build(Context c) {
        Verses.Verse v = Verses.current(c);
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_verse);
        rv.setTextViewText(R.id.widget_text, "“" + v.text + "”");
        rv.setTextViewText(R.id.widget_ref, v.ref);
        rv.setOnClickPendingIntent(R.id.widget_root, UpdateReceiver.nextIntent(c, 1));
        return rv;
    }

    public static void refreshAll(Context c) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(c);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(c, VerseWidget.class));
        if (ids.length > 0) mgr.updateAppWidget(ids, build(c));
    }
}
