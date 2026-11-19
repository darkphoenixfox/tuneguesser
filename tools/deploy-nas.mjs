#!/usr/bin/env node
// Deploys TuneGuesser to the NAS: copies files to the NAS share (NAS_DIR)
// and creates/updates the separate Portainer stack "tuneguesser".
// Blue/green: two game servers (a, b). A deploy goes to the IDLE one, then NGINX is told to send NEW rooms there.
// Rooms already running stay on the old server (their sockets are routed by room code) until they finish.
//   node tools/deploy-nas.mjs            build, start the new version on the idle server, switch new rooms to it
//   node tools/deploy-nas.mjs --stack    also push deploy/docker-compose.yml to the stack (first time: sets up blue/green;
//                                        recreating containers ends running games, so only when no one is playing)
//   node tools/deploy-nas.mjs --force    deploy even though the idle server still has running rooms (they will be cut)
//   node tools/deploy-nas.mjs --files    copy files only, no Portainer, no switch
// Settings come from the environment or the (untracked) .env file, never from the repo:
//   NAS_DIR (path of the NAS share), TUNEGUESSER_REDIRECT_URI (public https://host/callback), PORTAINER_URL, PORTAINER_TOKEN, SPOTIFY_CLIENT_ID
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const NAME = "tuneguesser";
const dotenv = fs.existsSync(".env") ? fs.readFileSync(".env", "utf-8") : "";
const setting = (k) => process.env[k] || new RegExp(`^${k}=(.+)$`, "m").exec(dotenv)?.[1]?.trim();
const need = (k) => { const v = setting(k); if (!v) throw new Error(`${k} is not set (environment or .env)`); return v; };
const NAS = need("NAS_DIR");
const REDIRECT = need("TUNEGUESSER_REDIRECT_URI");
const args = new Set(process.argv.slice(2));

const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { stdio: "inherit", ...opts });
const win = (p) => execFileSync("wslpath", ["-w", p]).toString().trim();

function copy(srcDir, destDir, { mirror = false, files = [] } = {}) {
  // robocopy exit codes 0-7 are success
  try {
    execFileSync("/mnt/c/WINDOWS/system32/robocopy.exe", [win(srcDir), destDir, ...files, mirror ? "/MIR" : "/E", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/NP"], { cwd: "/mnt/c", stdio: "pipe" });
  } catch (e) {
    if (e.status > 7) throw new Error(`robocopy failed (${e.status}) for ${srcDir} -> ${destDir}`);
  }
  console.log(`> ${srcDir} -> ${destDir}`);
}


const WIN = "/mnt/c/WINDOWS/system32";
const ORIGIN = new URL(REDIRECT).origin;
const other = (x) => (x === "a" ? "b" : "a");
const cmdOut = (c) => { try { return execFileSync(`${WIN}/cmd.exe`, ["/c", c], { cwd: "/mnt/c", stdio: ["ignore", "pipe", "pipe"] }).toString(); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("=== TuneGuesser NAS deploy ===");
sh("npm", ["run", "build", "--workspaces", "--if-present"]);
if (!fs.existsSync(`${WIN}/robocopy.exe`)) throw new Error("robocopy not found: run from WSL on Windows");

// the stack bind-mounts this folder (Spotify logins); Docker refuses to start if it is missing
cmdOut(`if not exist ${NAS}\\data mkdir ${NAS}\\data`);

/** The slot that takes new rooms, from nginx/active.conf on the NAS (undefined = not set up yet). */
const readActive = () => /tuneguesser-server-([ab])/.exec(cmdOut(`type ${NAS}\\nginx\\active.conf`) ?? "")?.[1];
const writeActive = (slot) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-"));
  fs.writeFileSync(path.join(dir, "active.conf"), `map $host $active_server { default tuneguesser-server-${slot}; }\n`);
  copy(dir, `${NAS}\\nginx`, { files: ["active.conf"] });
};
/** Rooms still running on a server (null: not reachable). */
async function slotRooms(slot) {
  try { const r = await fetch(`${ORIGIN}/slot/${slot}`, { signal: AbortSignal.timeout(4000) }); return r.ok ? (await r.json()).rooms : null; } catch { return null; }
}
const copyWww = () => { // additive: players with the old page open still need its hashed files; old ones are pruned after 14 days
  copy("apps/web/dist", `${NAS}\\www`);
  cmdOut(`forfiles /P ${NAS}\\www\\assets /D -14 /C "cmd /c del @path"`);
};
const copyServer = (slot) => copy("apps/server/dist", `${NAS}\\server-${slot}`, { files: ["server.mjs"] });
const copyNginx = () => copy("deploy/nginx", `${NAS}\\nginx`, { files: ["nginx.conf"] });

let active = readActive();

if (args.has("--files")) {
  copyWww(); copyNginx();
  copyServer(active ? other(active) : "a");
  console.log("Files copied (no restart, no switch).");
  process.exit(0);
}

const URL_ = need("PORTAINER_URL").replace(/\/$/, "");
const TOKEN = setting("PORTAINER_TOKEN");
if (!TOKEN) {
  console.log("PORTAINER_TOKEN not set: cannot restart servers or switch. Nothing deployed.");
  process.exit(0);
}

async function api(method, path_, body) {
  const res = await fetch(URL_ + path_, { method, headers: { "X-API-Key": TOKEN, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path_}: ${res.status} ${text.slice(0, 300).replace(/\s+/g, " ")}`);
  try { return JSON.parse(text); } catch { return text; }
}

function clientId() {
  if (process.env.SPOTIFY_CLIENT_ID) return process.env.SPOTIFY_CLIENT_ID;
  const m = /^SPOTIFY_CLIENT_ID=(.+)$/m.exec(dotenv);
  return m?.[1].trim() ?? "";
}

try {
  const [ep] = await api("GET", "/api/endpoints");
  const D = `/api/endpoints/${ep.Id}/docker`;
  const containers = async () => await api("GET", `${D}/containers/json?all=1`);
  const find = async (name) => (await containers()).find((x) => x.Names?.includes(`/${name}`));
  const stacks = await api("GET", "/api/stacks");
  const stack = stacks.find((s) => s.Name === NAME && s.EndpointId === ep.Id);
  const compose = fs.readFileSync("deploy/docker-compose.yml", "utf-8");

  const pushStack = async () => {
    const env = [{ name: "SPOTIFY_CLIENT_ID", value: clientId() }, { name: "SPOTIFY_REDIRECT_URI", value: REDIRECT }];
    const ytKey = process.env.YOUTUBE_API_KEY || (/^YOUTUBE_API_KEY=(.+)$/m.exec(dotenv) ?? [])[1];
    if (ytKey) env.push({ name: "YOUTUBE_API_KEY", value: ytKey });
    const adminPw = process.env.ADMIN_PASSWORD || (/^ADMIN_PASSWORD=(.+)$/m.exec(dotenv) ?? [])[1]; // optional: otherwise set it in Portainer
    if (adminPw) env.push({ name: "ADMIN_PASSWORD", value: adminPw });
    if (!env[0].value) throw new Error("SPOTIFY_CLIENT_ID is not set in .env: stack not touched");
    if (!stack) {
      await api("POST", `/api/stacks/create/standalone/string?endpointId=${ep.Id}`, { name: NAME, stackFileContent: compose, env });
      console.log(`> Portainer: stack '${NAME}' created`);
    } else {
      const keep = (stack.Env || []).filter((v) => !env.some((e) => e.name === v.name)); // variables already set in Portainer
      await api("PUT", `/api/stacks/${stack.Id}?endpointId=${ep.Id}`, { stackFileContent: compose, env: [...keep, ...env], prune: false, pullImage: false });
      console.log(`> Portainer: stack '${NAME}' updated`);
    }
  };
  const waitReady = async (slot) => {
    for (let i = 0; i < 40; i++) { if ((await slotRooms(slot)) !== null) return; await sleep(1500); }
    throw new Error(`server ${slot} did not come up (check its logs in Portainer)`);
  };
  const restart = async (slot) => {
    const c = await find(`${NAME}-server-${slot}`);
    if (!c) throw new Error(`container ${NAME}-server-${slot} not found (run with --stack)`);
    await api("POST", `${D}/containers/${c.Id}/restart`);
    console.log(`> Portainer: server ${slot} restarted`);
  };
  const exec = async (container, cmd) => {
    const c = await find(container);
    if (!c) throw new Error(`container ${container} not found`);
    const ex = await api("POST", `${D}/containers/${c.Id}/exec`, { Cmd: cmd, AttachStdout: true, AttachStderr: true });
    await api("POST", `${D}/exec/${ex.Id}/start`, { Detach: false, Tty: false });
    return (await api("GET", `${D}/exec/${ex.Id}/json`)).ExitCode;
  };
  const NGINX = ["nginx", "-c", "/etc/nginx/tg/nginx.conf"];

  if (!active) {
    // ---- first time: set up blue/green. Containers are (re)created, so running games end ----
    if (!args.has("--stack")) throw new Error("blue/green is not set up on the NAS yet: run once with --stack (this restarts everything, so do it when nobody is playing)");
    copyWww(); copyNginx(); copyServer("a"); copyServer("b"); writeActive("a");
    await pushStack();
    const old = await find(`${NAME}-server`);
    if (old) { await api("DELETE", `${D}/containers/${old.Id}?force=true`); console.log("> removed the old single server container"); }
    await waitReady("a");
    console.log(`\nBlue/green is set up. New rooms: a.\nDeployed: ${ORIGIN}`);
  } else {
    const idle = other(active);
    const busy = await slotRooms(idle);
    if (busy && !args.has("--force")) throw new Error(`server ${idle} (the previous version) still has ${busy} running room(s). Try again when they finish, or use --force to cut them.`);
    if (args.has("--stack")) { await pushStack(); await waitReady(active); }
    copyServer(idle);
    await restart(idle);
    await waitReady(idle);
    copyWww();
    copyNginx();
    writeActive(idle);
    if ((await exec(`${NAME}-web`, [...NGINX, "-t"])) !== 0) { writeActive(active); throw new Error("nginx rejected the new config; kept sending new rooms to the old server"); }
    if ((await exec(`${NAME}-web`, [...NGINX, "-s", "reload"])) !== 0) { writeActive(active); throw new Error("nginx reload failed"); }
    const left = await slotRooms(active);
    console.log(`> new rooms now go to server ${idle}; server ${active} keeps its ${left ?? 0} running room(s) until they finish`);
    console.log(`\nDeployed: ${ORIGIN}`);
  }
} catch (e) {
  console.log(`Deploy stopped: ${e.message}`);
  process.exitCode = 1;
}
