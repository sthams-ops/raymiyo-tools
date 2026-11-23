package com.raymiyo.field;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createChatChannel();
    }

    // The "Chat messages" channel: Raymiyo ding, vibration, number on the app icon.
    // Made here as soon as the app opens, so a message that arrives while the
    // app is closed always rings with the right sound.
    private void createChatChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel("chat") != null) return;
        NotificationChannel channel = new NotificationChannel("chat", "Chat messages", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Messages from the Raymiyo team");
        Uri sound = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + getPackageName() + "/raw/chat_ding");
        AudioAttributes attributes = new AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
            .build();
        channel.setSound(sound, attributes);
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 180, 120, 180 });
        channel.enableLights(true);
        channel.setLightColor(0xFF38645B);
        channel.setShowBadge(true);
        manager.createNotificationChannel(channel);
    }
}
