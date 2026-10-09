package com.mifinanzas.app;

import android.content.ComponentName;
import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

@CapacitorPlugin(name = "NotificationCapture")
public class NotificationPlugin extends Plugin {

    @Override
    public void load() {
        NotificationCapture.pluginRef = this;
    }

    /** Returns whether the user has granted Notification Listener access to this app. */
    @PluginMethod
    public void isPermissionGranted(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasListenerPermission());
        call.resolve(ret);
    }

    /** Opens the system Notification Access settings screen. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getActivity().startActivity(intent);
        call.resolve();
    }

    /** Returns all captures collected since the service started. */
    @PluginMethod
    public void getCaptures(PluginCall call) {
        JSArray arr = new JSArray();
        for (JSONObject obj : NotificationCapture.captures) {
            arr.put(obj);
        }
        JSObject ret = new JSObject();
        ret.put("captures", arr);
        call.resolve(ret);
    }

    /** Clears all stored captures. */
    @PluginMethod
    public void clearCaptures(PluginCall call) {
        NotificationCapture.captures.clear();
        call.resolve();
    }

    /** Called by NotificationCapture service when a new notification arrives. */
    public void onNewCapture(JSONObject capture) {
        JSObject data = new JSObject();
        try {
            data.put("id",          capture.getString("id"));
            data.put("packageName", capture.getString("packageName"));
            data.put("title",       capture.getString("title"));
            data.put("text",        capture.getString("text"));
            data.put("subText",     capture.getString("subText"));
            data.put("timestamp",   capture.getLong("timestamp"));
        } catch (Exception ignored) {}
        notifyListeners("notificationReceived", data);
    }

    private boolean hasListenerPermission() {
        String pkgName = getContext().getPackageName();
        String flat = Settings.Secure.getString(
            getContext().getContentResolver(),
            "enabled_notification_listeners"
        );
        if (!TextUtils.isEmpty(flat)) {
            for (String name : flat.split(":")) {
                ComponentName cn = ComponentName.unflattenFromString(name);
                if (cn != null && pkgName.equals(cn.getPackageName())) return true;
            }
        }
        return false;
    }
}
