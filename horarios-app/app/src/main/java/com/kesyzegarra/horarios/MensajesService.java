package com.kesyzegarra.horarios;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Recibe las notificaciones push del servidor, aunque la app esté cerrada. */
public class MensajesService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage m) {
        Map<String, String> d = m.getData();
        String titulo = d.get("titulo"), texto = d.get("texto"), id = d.get("id");
        if (titulo == null && m.getNotification() != null) {
            titulo = m.getNotification().getTitle();
            texto = m.getNotification().getBody();
        }
        if (titulo == null) return;
        Notifs.mostrar(this, id != null ? id : String.valueOf(System.currentTimeMillis()), titulo, texto != null ? texto : "");
    }

    @Override
    public void onNewToken(@NonNull String token) {
        // la app lo registra en el servidor la próxima vez que se abre
        getSharedPreferences(Notifs.PREFS, MODE_PRIVATE).edit().putString("fcmToken", token).apply();
    }
}
