package net.phoenixfox.tuneguesser;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/** TuneGuesser: full screen (system bars hidden, back after a swipe) and the screen stays on during a game */
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    hideSystemBars();
    // The web client shows a Quit button on its main menu when this exists (window.TuneGuesserApp.quit())
    getBridge().getWebView().addJavascriptInterface(new Object() {
      @JavascriptInterface
      public void quit() {
        runOnUiThread(() -> finishAndRemoveTask());
      }

      /** Open a web page in the system browser (Spotify login must not run inside this WebView). */
      @JavascriptInterface
      public void openExternal(String url) {
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) return;
        runOnUiThread(() -> {
          try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
          catch (Exception e) { /* no browser on this device (Android TV): the page offers a QR code instead */ }
        });
      }
    }, "TuneGuesserApp");
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) hideSystemBars();
  }

  private void hideSystemBars() {
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    View decor = getWindow().getDecorView();
    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), decor);
    controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    controller.hide(WindowInsetsCompat.Type.systemBars());
  }
}
