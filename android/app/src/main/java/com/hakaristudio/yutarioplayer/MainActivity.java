package com.hakaristudio.yutarioplayer;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Expose the native permission bridge (notifications + audio files)
    // to the WebView JavaScript layer as window.Capacitor.Plugins.YutarioPermissions.
    registerPlugin(YutarioPermissionsPlugin.class);
  }
}
