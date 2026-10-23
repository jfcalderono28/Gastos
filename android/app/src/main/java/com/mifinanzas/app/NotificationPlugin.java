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

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;

@CapacitorPlugin(name = "NotificationCapture")
public class NotificationPlugin extends Plugin {

    @Override
    public void load() {
        NotificationCapture.pluginRef = this;
        NotificationCapture.loadAllowedPackages(getContext());
        NotificationCapture.loadFromPrefs(getContext());
    }

    @PluginMethod
    public void setAllowedPackages(PluginCall call) {
        try {
            JSArray arr = call.getArray("packages", new JSArray());
            HashSet<String> pkgs = new HashSet<>();
            for (int i = 0; i < arr.length(); i++) pkgs.add(arr.getString(i));
            NotificationCapture.setAllowedPackages(getContext(), pkgs);
            call.resolve();
        } catch (Exception e) {
            call.reject("Error setting allowed packages: " + e.getMessage());
        }
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

    @PluginMethod
    public void scanActiveNotifications(PluginCall call) {
        NotificationCapture.scanActiveNotifications();
        call.resolve();
    }

    /** Returns a base64 PNG of the installed app's icon, or empty if not installed. */
    @PluginMethod
    public void getAppIcon(PluginCall call) {
        String packageName = call.getString("packageName", "");
        try {
            android.content.pm.PackageManager pm = getContext().getPackageManager();
            android.graphics.drawable.Drawable drawable = pm.getApplicationIcon(packageName);
            android.graphics.Bitmap bitmap = drawableToBitmap(drawable);
            java.io.ByteArrayOutputStream stream = new java.io.ByteArrayOutputStream();
            bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, stream);
            String b64 = android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP);
            JSObject ret = new JSObject();
            ret.put("icon", "data:image/png;base64," + b64);
            call.resolve(ret);
        } catch (android.content.pm.PackageManager.NameNotFoundException e) {
            call.resolve(new JSObject()); // app not installed → no icon
        } catch (Exception e) {
            call.resolve(new JSObject());
        }
    }

    private static android.graphics.Bitmap drawableToBitmap(android.graphics.drawable.Drawable drawable) {
        // AdaptiveIconDrawable (API 26+) returns -1 for intrinsic size, so use a fixed canvas.
        final int SIZE = 192;
        android.graphics.Bitmap bitmap = android.graphics.Bitmap.createBitmap(SIZE, SIZE, android.graphics.Bitmap.Config.ARGB_8888);
        android.graphics.Canvas canvas = new android.graphics.Canvas(bitmap);
        drawable.setBounds(0, 0, SIZE, SIZE);
        drawable.draw(canvas);
        return bitmap;
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
