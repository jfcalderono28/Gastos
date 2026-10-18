package com.mifinanzas.app;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;

public class NotificationCapture extends NotificationListenerService {

    private static final String PREFS_NAME = "notif_captures";
    private static final String PREFS_KEY  = "captures";
    private static final int    MAX_CAPTURES = 100;

    // In-memory cache; SharedPreferences is the source of truth across restarts
    public static final ArrayList<JSONObject> captures = new ArrayList<>();
    public static NotificationPlugin pluginRef = null;

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            Notification n = sbn.getNotification();
            Bundle extras = n.extras;

            String title  = extras.getString(Notification.EXTRA_TITLE, "");
            CharSequence textCs = extras.getCharSequence(Notification.EXTRA_TEXT);
            String text   = textCs != null ? textCs.toString() : "";
            CharSequence bigTextCs = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
            String bigText = bigTextCs != null ? bigTextCs.toString() : "";
            String subText = extras.getString(Notification.EXTRA_SUB_TEXT, "");

            // Content-based ID: same app + same text within 60s = same event.
            // 60s window absorbs Nequi's double-notification pattern (push + update).
            // Different senders/amounts produce different IDs so legitimate duplicates are kept.
            String contentId = sbn.getPackageName()
                + "|" + title
                + "|" + (text.isEmpty() ? bigText : text)
                + "|" + (sbn.getPostTime() / 60000);

            JSONObject obj = new JSONObject();
            obj.put("id",          contentId);
            obj.put("packageName", sbn.getPackageName());
            obj.put("title",       title);
            obj.put("text",        text.isEmpty() ? bigText : text);
            obj.put("subText",     subText);
            obj.put("timestamp",   sbn.getPostTime());

            // Update in-memory cache
            if (captures.size() >= MAX_CAPTURES) captures.remove(0);
            captures.add(obj);

            // Persist to disk so captures survive process death
            persistCapture(obj);

            if (pluginRef != null) pluginRef.onNewCapture(obj);

        } catch (JSONException ignored) {}
    }

    /** Appends one capture to the SharedPreferences JSON array. */
    private void persistCapture(JSONObject obj) {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            JSONArray arr = loadArray(prefs);
            // Trim oldest if at limit
            while (arr.length() >= MAX_CAPTURES) {
                JSONArray trimmed = new JSONArray();
                for (int i = 1; i < arr.length(); i++) trimmed.put(arr.get(i));
                arr = trimmed;
            }
            arr.put(obj);
            prefs.edit().putString(PREFS_KEY, arr.toString()).apply();
        } catch (Exception ignored) {}
    }

    /** Loads all persisted captures into the in-memory list. No-op if already loaded. */
    public static void loadFromPrefs(Context ctx) {
        if (!captures.isEmpty()) return;
        try {
            SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            JSONArray arr = loadArray(prefs);
            for (int i = 0; i < arr.length(); i++) {
                captures.add(arr.getJSONObject(i));
            }
        } catch (Exception ignored) {}
    }

    /** Clears both in-memory cache and persisted data. */
    public static void clearAll(Context ctx) {
        captures.clear();
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
           .edit().remove(PREFS_KEY).apply();
    }

    private static JSONArray loadArray(SharedPreferences prefs) {
        try {
            String saved = prefs.getString(PREFS_KEY, "[]");
            return new JSONArray(saved);
        } catch (Exception e) {
            return new JSONArray();
        }
    }
}
