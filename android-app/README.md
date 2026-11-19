# TuneGuesser for Android

A [Capacitor](https://capacitorjs.com) shell: the app opens the game's web client full screen (system bars hidden, screen kept on).
It loads the live site, so a web update needs no new APK. The server address is read from `TUNEGUESSER_URL` when the APK is built
(environment or the untracked `.env`), so it is not stored in the repo.

## Build a debug APK

Needs JDK 17+ and the Android SDK (Android Studio installs both on Windows).

```
npm run build:apk        # from the repo root: builds the APK and puts it in apps/web/public/tuneguesser.apk
npm run deploy:nas       # publishes it; the main screen's settings menu links to it
```

`tools/build-apk.mjs` syncs Capacitor, copies the project to a Windows folder (Gradle does not like WSL paths), runs `gradlew.bat assembleDebug`
and copies the result back. Set `JAVA_HOME` and `ANDROID_HOME` for it, or keep them in `.env`.

Notes
- The APK contains the server address, so `apps/web/public/*.apk` is git-ignored.
- A debug APK is for your own devices (allow installs from the source). A Play Store release needs a signed build and a listing (not set up).
- Voice answers inside the app use Android's own speech recognizer (the WebView has none): the first use asks for the microphone permission. It needs a recognition service on the device (the Google app; on Android TV/Shield it is usually there).
- The launcher icon and splash are generated from `apps/web/public/tuneguesser.png`.
