package com.kesyzegarra.horarios;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.util.HashSet;
import java.util.Set;

/** Muestra notificaciones de "cambio en tu horario" y recuerda cuáles ya se mostraron. */
final class Notifs {
    static final String CANAL = "cambios";
    static final String PREFS = "mis_horarios";

    private Notifs() { }

    static void crearCanal(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CANAL, "Cambios de horario", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Avisos cuando un administrador cambia tu horario");
            c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
    }

    static boolean permitido(Context c) {
        if (Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return NotificationManagerCompat.from(c).areNotificationsEnabled();
    }

    /** Devuelve false si esa notificación ya se había mostrado. */
    static synchronized boolean mostrar(Context c, String id, String titulo, String texto) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Set<String> vistos = new HashSet<>(p.getStringSet("vistos", new HashSet<String>()));
        if (vistos.contains(id)) return false;
        vistos.add(id);
        p.edit().putStringSet("vistos", vistos).apply();
        if (!permitido(c)) return true;
        crearCanal(c);
        Intent abrir = new Intent(c, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("abrir", "notificaciones");
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(c, id.hashCode(), abrir, flags);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CANAL)
                .setSmallIcon(R.drawable.ic_notif)
                .setColor(0xFFB3BB06)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .addAction(0, "Ver y aprobar", pi);
        try { NotificationManagerCompat.from(c).notify(id.hashCode(), b.build()); } catch (SecurityException ignored) { }
        return true;
    }
}
