#!/usr/bin/env node
// Deploys TuneGuesser to the NAS: copies files to the NAS share (NAS_DIR)
// and creates/updates the separate Portainer stack "tuneguesser".
//   node tools/deploy-nas.mjs            build, copy files, create/update stack (or restart the server)
//   node tools/deploy-nas.mjs --stack    also push deploy/docker-compose.yml to the stack
//   node tools/deploy-nas.mjs --files    copy files only, no Portainer
// Settings come from the environment or the (untracked) .env file, never from the repo:
//   NAS_DIR (path of the NAS share), TUNEGUESSER_REDIRECT_URI (public https://host/callback), PORTAINER_URL, PORTAINER_TOKEN, SPOTIFY_CLIENT_ID
import { execFileSync } from "node:child_process";
import fs from "node:fs";

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

console.log("=== TuneGuesser NAS deploy ===");
sh("npm", ["run", "build", "--workspaces", "--if-present"]);

if (!fs.existsSync("/mnt/c/WINDOWS/system32/robocopy.exe")) throw new Error("robocopy not found: run from WSL on Windows");
copy("apps/web/dist", `${NAS}\\www`, { mirror: true }); // build output: stale hashed files are removed
copy("apps/server/dist", `${NAS}\\server`, { files: ["server.mjs"] });
copy("deploy/nginx", `${NAS}\\nginx`, { files: ["nginx.conf"] });

if (args.has("--files")) process.exit(0);

const URL_ = need("PORTAINER_URL").replace(/\/$/, "");
const TOKEN = setting("PORTAINER_TOKEN");
if (!TOKEN) {
  console.log("PORTAINER_TOKEN not set: files copied. Create/update the stack by hand in Portainer.");
  process.exit(0);
}

async function api(method, path, body) {
  const res = await fetch(URL_ + path, { method, headers: { "X-API-Key": TOKEN, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300).replace(/\s+/g, " ")}`);
  try { return JSON.parse(text); } catch { return text; }
}

function clientId() {
  if (process.env.SPOTIFY_CLIENT_ID) return process.env.SPOTIFY_CLIENT_ID;
  const m = /^SPOTIFY_CLIENT_ID=(.+)$/m.exec(fs.existsSync(".env") ? fs.readFileSync(".env", "utf-8") : "");
  return m?.[1].trim() ?? "";
}

try {
  const [ep] = await api("GET", "/api/endpoints");
  const stacks = await api("GET", "/api/stacks");
  const stack = stacks.find((s) => s.Name === NAME && s.EndpointId === ep.Id);
  const compose = fs.readFileSync("deploy/docker-compose.yml", "utf-8");
  const env = [{ name: "SPOTIFY_CLIENT_ID", value: clientId() }, { name: "SPOTIFY_REDIRECT_URI", value: REDIRECT }];
  if (!env[0].value) throw new Error("SPOTIFY_CLIENT_ID is not set in .env: stack not touched");

  if (!stack) {
    await api("POST", `/api/stacks/create/standalone/string?endpointId=${ep.Id}`, { name: NAME, stackFileContent: compose, env });
    console.log(`> Portainer: stack '${NAME}' created`);
  } else if (args.has("--stack")) {
    // keep any variables already set in Portainer, overriding only ours
    const keep = (stack.Env || []).filter((v) => !env.some((e) => e.name === v.name));
    await api("PUT", `/api/stacks/${stack.Id}?endpointId=${ep.Id}`, { stackFileContent: compose, env: [...keep, ...env], prune: false, pullImage: false });
    console.log(`> Portainer: stack '${NAME}' updated`);
  } else {
    const c = (await api("GET", `/api/endpoints/${ep.Id}/docker/containers/json?all=1`)).find((x) => x.Names?.includes(`/${NAME}-server`));
    if (!c) throw new Error(`container ${NAME}-server not found (run with --stack)`);
    await api("POST", `/api/endpoints/${ep.Id}/docker/containers/${c.Id}/restart`);
    console.log(`> Portainer: ${NAME}-server restarted`);
  }
  console.log(`\nDeployed: ${new URL(REDIRECT).origin}`);
} catch (e) {
  console.log(`Portainer: ${e.message}\nFiles are copied; finish by hand in ${URL_}.`);
  process.exitCode = 1;
}
