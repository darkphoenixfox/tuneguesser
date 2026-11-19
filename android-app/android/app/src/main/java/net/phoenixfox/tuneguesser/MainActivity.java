package net.phoenixfox.tuneguesser;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import java.util.ArrayList;
import org.json.JSONObject;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
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

      /** Voice answers: native speech recognition (the WebView has none). Results come back through window.__tgSpeech(kind, text). */
      @JavascriptInterface
      public boolean canListen() {
        return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
      }

      @JavascriptInterface
      public void startListening(String lang) {
        runOnUiThread(() -> beginListening(lang));
      }

      @JavascriptInterface
      public void stopListening() {
        runOnUiThread(() -> { if (recognizer != null) recognizer.stopListening(); });
      }

      @JavascriptInterface
      public void cancelListening() {
        runOnUiThread(() -> destroyRecognizer());
      }
    }, "TuneGuesserApp");
  }

  private static final int REQ_AUDIO = 7001;
  private SpeechRecognizer recognizer;
  private String pendingLang = "";

  private void toJs(String kind, String text) {
    final String js = "window.__tgSpeech&&window.__tgSpeech(" + JSONObject.quote(kind) + "," + JSONObject.quote(text) + ")";
    getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(js, null));
  }

  private void destroyRecognizer() {
    if (recognizer != null) { try { recognizer.destroy(); } catch (Exception e) { /* already gone */ } recognizer = null; }
  }

  private void beginListening(String lang) {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      pendingLang = lang == null ? "" : lang;
      ActivityCompat.requestPermissions(this, new String[] { Manifest.permission.RECORD_AUDIO }, REQ_AUDIO); // the system asks the user
      return;
    }
    destroyRecognizer();
    recognizer = SpeechRecognizer.createSpeechRecognizer(this);
    recognizer.setRecognitionListener(new RecognitionListener() {
      private String first(Bundle b) {
        ArrayList<String> r = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return r == null || r.isEmpty() ? "" : r.get(0);
      }
      @Override public void onPartialResults(Bundle b) { String t = first(b); if (!t.isEmpty()) toJs("partial", t); }
      @Override public void onResults(Bundle b) { String t = first(b); if (!t.isEmpty()) toJs("final", t); toJs("end", ""); }
      @Override public void onError(int e) {
        toJs("error", e == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ? "not-allowed"
            : (e == SpeechRecognizer.ERROR_NO_MATCH || e == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) ? "no-speech" : "error");
        toJs("end", "");
      }
      @Override public void onReadyForSpeech(Bundle b) {}
      @Override public void onBeginningOfSpeech() {}
      @Override public void onRmsChanged(float v) {}
      @Override public void onBufferReceived(byte[] b) {}
      @Override public void onEndOfSpeech() {}
      @Override public void onEvent(int i, Bundle b) {}
    });
    Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
    i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
    if (lang != null && !lang.isEmpty()) i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
    recognizer.startListening(i);
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode != REQ_AUDIO) return;
    if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) beginListening(pendingLang);
    else { toJs("error", "not-allowed"); toJs("end", ""); }
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
