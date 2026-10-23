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

    private static final String PREFS_NAME    = "notif_captures";
    private static final String PREFS_KEY     = "captures";
    private static final String PREFS_ALLOWED = "allowed_packages";
    private static final int    MAX_CAPTURES  = 100;

    // In-memory cache; SharedPreferences is the source of truth across restarts
    public static final ArrayList<JSONObject> captures = new ArrayList<>();
    public static final java.util.Set<String> allowedPackages = new java.util.HashSet<>();
    public static NotificationPlugin pluginRef = null;
    public static NotificationCapture serviceInstance = null;

    /** Returns true if this package should be captured. */
    public static boolean isAllowed(String pkg) {
        return allowedPackages.contains(pkg);
    }

    /** Called from JS whenever bolsillos change. Persists the whitelist. */
    public static void setAllowedPackages(android.content.Context ctx, java.util.Set<String> pkgs) {
        allowedPackages.clear();
        allowedPackages.addAll(pkgs);
        try {
            org.json.JSONArray arr = new org.json.JSONArray();
            for (String p : pkgs) arr.put(p);
            ctx.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
               .edit().putString(PREFS_ALLOWED, arr.toString()).apply();
        } catch (Exception ignored) {}
    }

    /** Restores the whitelist from disk (called on app start). */
    public static void loadAllowedPackages(android.content.Context ctx) {
        try {
            String saved = ctx.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
                              .getString(PREFS_ALLOWED, "[]");
            org.json.JSONArray arr = new org.json.JSONArray(saved);
            allowedPackages.clear();
            for (int i = 0; i < arr.length(); i++) allowedPackages.add(arr.getString(i));
        } catch (Exception ignored) {}
    }

    @Override
    public void onListenerConnected() { serviceInstance = this; }

    @Override
    public void onListenerDisconnected() { serviceInstance = null; }

    /**
     * Rescans notifications currently visible in the status bar.
     * Persists new captures to SharedPreferences (same as onNotificationPosted)
     * so getCaptures() picks them up. Also fires events for the JS processor.
     */
    public static void scanActiveNotifications() {
        if (serviceInstance == null || pluginRef == null) return;
        for (android.service.notification.StatusBarNotification sbn : serviceInstance.getActiveNotifications()) {
            if (!isAllowed(sbn.getPackageName())) continue;
            try {
                android.app.Notification n = sbn.getNotification();
                android.os.Bundle extras = n.extras;
                String title   = extras.getString(android.app.Notification.EXTRA_TITLE, "");
                CharSequence textCs    = extras.getCharSequence(android.app.Notification.EXTRA_TEXT);
                String text    = textCs != null ? textCs.toString() : "";
                CharSequence bigTextCs = extras.getCharSequence(android.app.Notification.EXTRA_BIG_TEXT);
                String bigText = bigTextCs != null ? bigTextCs.toString() : "";
                String body    = text.isEmpty() ? bigText : text;
                String contentId = sbn.getPackageName() + "|" + title + "|" + body + "|" + (sbn.getPostTime() / 60000);

                // Skip if already in in-memory captures (already persisted)
                boolean alreadySaved = false;
                for (JSONObject existing : captures) {
                    try {
                        if (contentId.equals(existing.getString("id"))) { alreadySaved = true; break; }
                    } catch (JSONException ignored2) {}
                }

                JSONObject obj = new JSONObject();
                obj.put("id", contentId);
                obj.put("packageName", sbn.getPackageName());
                obj.put("title", title);
                obj.put("text", body);
                obj.put("subText", extras.getString(android.app.Notification.EXTRA_SUB_TEXT, ""));
                obj.put("timestamp", sbn.getPostTime());

                if (!alreadySaved) {
                    // Persist to SharedPreferences so getCaptures() returns it
                    if (captures.size() >= MAX_CAPTURES) captures.remove(0);
                    captures.add(obj);
                    serviceInstance.persistCapture(obj);
                }

                // Always fire event so JS processor can handle it
                pluginRef.onNewCapture(obj);
            } catch (JSONException ignored) {}
        }
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        // Only process packages the user has linked to a bolsillo
        if (!NotificationCapture.isAllowed(sbn.getPackageName())) return;
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
    void persistCapture(JSONObject obj) {
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
