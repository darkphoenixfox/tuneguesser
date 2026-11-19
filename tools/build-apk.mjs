#!/usr/bin/env node
// Builds the Android debug APK (Capacitor shell, android-app/) on Windows from WSL and copies it to apps/web/public/tuneguesser.apk.
// Settings (environment or untracked .env): TUNEGUESSER_URL (public https address of the server), JAVA_HOME (Windows path), ANDROID_HOME (Windows path)
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const dotenv = fs.existsSync(".env") ? fs.readFileSync(".env", "utf-8") : "";
const setting = (k) => process.env[k] || new RegExp(`^${k}=(.+)$`, "m").exec(dotenv)?.[1]?.trim();
const need = (k) => { const v = setting(k); if (!v) throw new Error(`${k} is not set (environment or .env)`); return v; };
const URL_ = need("TUNEGUESSER_URL");
const JAVA = need("JAVA_HOME");
const SDK = need("ANDROID_HOME");
const win = (p) => execFileSync("wslpath", ["-w", p]).toString().trim();
const BUILD = "/mnt/c/Users/Public/tuneguesser-apk-build";

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });
run("npm", ["install", "--no-audit", "--no-fund"], { cwd: "android-app" });
run("npx", ["cap", "sync", "android"], { cwd: "android-app", env: { ...process.env, TUNEGUESSER_URL: URL_ } });
fs.rmSync(BUILD, { recursive: true, force: true });
run("sh", ["-c", `mkdir -p ${BUILD} && tar --exclude=android/build --exclude=android/app/build --exclude=android/.gradle -cf - -C android-app . | tar -xf - -C ${BUILD}`]);
fs.writeFileSync(`${BUILD}/android/local.properties`, `sdk.dir=${SDK.replace(/\\/g, "\\\\").replace(":", "\\:")}\n`);
const buildWin = win(BUILD);
run("powershell.exe", ["-NoProfile", "-Command", `$env:JAVA_HOME='${JAVA}'; cd '${buildWin}\\android'; .\\gradlew.bat assembleDebug --console=plain; exit $LASTEXITCODE`]);
fs.copyFileSync(`${BUILD}/android/app/build/outputs/apk/debug/app-debug.apk`, "apps/web/public/tuneguesser.apk");
console.log("APK: apps/web/public/tuneguesser.apk");
