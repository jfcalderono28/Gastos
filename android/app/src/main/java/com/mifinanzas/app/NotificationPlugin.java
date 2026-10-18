package com.mifinanzas.app;

import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
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
        // Restore captures from disk if the process was restarted
        NotificationCapture.loadFromPrefs(getContext());
    }

    @PluginMethod
    public void isPermissionGranted(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasListenerPermission());
        call.resolve(ret);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getActivity().startActivity(intent);
        call.resolve();
    }

    /** Returns whether the app is exempted from battery optimization. */
    @PluginMethod
    public void isBatteryOptimized(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
        boolean ignoring = pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        JSObject ret = new JSObject();
        ret.put("optimized", !ignoring); // true = still being optimized (bad)
        call.resolve(ret);
    }

    /** Opens the system dialog to request battery optimization exemption. */
    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
        } catch (Exception e) {
            // Fallback: open generic battery settings
            Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(fallback);
        }
        call.resolve();
    }

    @PluginMethod
    public void getCaptures(PluginCall call) {
        // loadFromPrefs is a no-op if already loaded; covers edge cases
        NotificationCapture.loadFromPrefs(getContext());
        JSArray arr = new JSArray();
        for (JSONObject obj : NotificationCapture.captures) {
            arr.put(obj);
        }
        JSObject ret = new JSObject();
        ret.put("captures", arr);
        call.resolve(ret);
    }

    @PluginMethod
    public void clearCaptures(PluginCall call) {
        NotificationCapture.clearAll(getContext());
        call.resolve();
    }

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
