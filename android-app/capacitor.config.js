// The app is a shell around the live web client. The server address comes from the environment at build time:
//   TUNEGUESSER_URL=https://your.host npm run apk
const url = process.env.TUNEGUESSER_URL;
if (!url) throw new Error("Set TUNEGUESSER_URL to the address of your TuneGuesser server before building the APK");

module.exports = {
  appId: "net.phoenixfox.tuneguesser",
  appName: "TuneGuesser",
  webDir: "www",
  server: { url, cleartext: true },
  android: { allowMixedContent: true, backgroundColor: "#0b0b1a" },
};
