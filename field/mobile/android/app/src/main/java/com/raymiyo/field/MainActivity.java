package com.raymiyo.field;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    // Android fixes a channel's sound when it is first made, so a new sound
    // needs a new channel. "chat" (the old ding) is removed.
    static final String CHAT_CHANNEL = "chat_v2";
    static final String APP_URL = "https://field.raymiyo.com/";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createChatChannel();
        // Opened by tapping a chat notification while the app was closed:
        // start straight in that person's chat.
        String sender = takeSender(getIntent());
        if (sender != null && bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().loadUrl(APP_URL + "?chat=" + Uri.encode(sender));
        }
    }

    // Tapped while the app was still running in the background.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String sender = takeSender(intent);
        if (sender == null || bridge == null) return;
        WebView web = bridge.getWebView();
        if (web == null) return;
        String js = "window.dispatchEvent(new CustomEvent('field:chat-open',{detail:{email:" + JSONObject.quote(sender) + "}}))";
        web.post(() -> web.evaluateJavascript(js, null));
    }

    // Firebase puts the message's data on the intent; "sender" is who wrote it.
    private String takeSender(Intent intent) {
        if (intent == null || intent.getExtras() == null) return null;
        String sender = intent.getStringExtra("sender");
        if (sender == null) sender = intent.getStringExtra("from_email");
        if (sender == null || !sender.contains("@")) return null;
        intent.removeExtra("sender");
        return sender;
    }

    // The "Chat messages" channel: Raymiyo chime, long vibration, number on the app icon.
    private void createChatChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        if (manager.getNotificationChannel("chat") != null) manager.deleteNotificationChannel("chat");
        if (manager.getNotificationChannel(CHAT_CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(CHAT_CHANNEL, "Chat messages", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Messages from the Raymiyo team");
        Uri sound = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + getPackageName() + "/raw/raymiyo_chime");
        AudioAttributes attributes = new AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
            .build();
        channel.setSound(sound, attributes);
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 300, 150, 300, 150, 500 });
        channel.enableLights(true);
        channel.setLightColor(0xFF38645B);
        channel.setShowBadge(true);
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(channel);
    }
}
