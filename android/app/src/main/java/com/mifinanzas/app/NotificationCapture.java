package com.mifinanzas.app;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;

public class NotificationCapture extends NotificationListenerService {

    // Shared store: last 100 captures, lives as long as the process
    public static final ArrayList<JSONObject> captures = new ArrayList<>();
    public static NotificationPlugin pluginRef = null;

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            Notification n = sbn.getNotification();
            Bundle extras = n.extras;

            String title   = extras.getString(Notification.EXTRA_TITLE, "");
            CharSequence textCs = extras.getCharSequence(Notification.EXTRA_TEXT);
            String text    = textCs != null ? textCs.toString() : "";
            CharSequence bigTextCs = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
            String bigText = bigTextCs != null ? bigTextCs.toString() : "";
            String subText = extras.getString(Notification.EXTRA_SUB_TEXT, "");

            JSONObject obj = new JSONObject();
            obj.put("id",          sbn.getKey());
            obj.put("packageName", sbn.getPackageName());
            obj.put("title",       title);
            obj.put("text",        text.isEmpty() ? bigText : text);
            obj.put("subText",     subText);
            obj.put("timestamp",   sbn.getPostTime());

            if (captures.size() >= 100) captures.remove(0);
            captures.add(obj);

            if (pluginRef != null) pluginRef.onNewCapture(obj);

        } catch (JSONException ignored) {}
    }
}
