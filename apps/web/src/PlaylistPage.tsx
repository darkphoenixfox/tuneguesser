import { useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "./Logo";
import { SettingsMenu } from "./Settings";
import { t } from "./i18n";
import { banLocal, getGone, getLocal, getNames, setGone, setLocalName, unbanLocal, updateLocal } from "./local";

interface Song { id: string; title: string; artists: string[]; original?: { title: string; artists: string[] }; edited?: "local" | "default"; banned: boolean; defaultBanned: boolean }
interface Data { id: string; name: string; defaultName: string | null; removedForAll: boolean; artist: string | null; artists: Array<{ name: string; n: number }>; tracks: Song[] }

const post = (path: string, body: unknown) => fetch(path, { method: "POST", body: JSON.stringify(body) });
const PW = "tg_admin";
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** One playlist: check its songs, fix a title or artist, ban or bring back a song, limit the list to one artist. */
export function PlaylistPage({ id }: { id: string }) {
  const [data, setData] = useState<Data>();
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<string>();
  const [title, setTitle] = useState("");
  const [artists, setArtists] = useState("");
  // admin: with the password (set on the server) changes here become the default for everyone instead of staying on this device
  const [adminAvailable, setAdminAvailable] = useState(false);
  const [pw, setPw] = useState(() => { try { return sessionStorage.getItem(PW) ?? ""; } catch { return ""; } });
  const [pwInput, setPwInput] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => { fetch("/api/me").then((r) => r.json()).then((j) => setAdminAvailable(!!j?.admin)).catch(() => {}); }, []);
  const unlock = async () => {
    const ok = await fetch("/api/admin/check", { method: "POST", body: JSON.stringify({ password: pwInput }) }).then((r) => r.json()).then((j) => !!j.ok).catch(() => false);
    if (!ok) { setNote(t("Wrong password")); return; }
    try { sessionStorage.setItem(PW, pwInput); } catch { /* ignore */ }
    setPw(pwInput); setPwInput(""); setNote("");
  };
  const lock = () => { try { sessionStorage.removeItem(PW); } catch { /* ignore */ } setPw(""); };
  const admin = !!pw;
  const global = async (path: string, body: object) => {
    const r = await post(path, { ...body, password: pw });
    if (r.status === 403) { lock(); setNote(t("Wrong password")); }
  };
  const load = useCallback(() => {
    fetch(`/api/youtube/playlist/tracks`, { method: "POST", body: JSON.stringify({ id, local: getLocal() }) })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j as Data; })
      .then(setData)
      .catch((e: Error) => setErr(e.message || t("Cannot reach the server")));
  }, [id]);
  useEffect(load, [load]);

  const back = () => { if (history.length > 1) history.back(); else location.href = "/"; };
  const only = data?.artist ?? null;
  const used = (s: Song) => !s.banned;
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (data?.tracks ?? []).filter((s) => !f || `${s.title} ${s.artists.join(" ")}`.toLowerCase().includes(f));
  }, [data, filter]);

  const [goneHere, setGoneHere] = useState(() => getGone().includes(id));
  /** Takes the playlist off the list on this device, or (unlocked) for everyone; the same button brings it back. */
  const removeHere = () => { setGone(id, !goneHere); setGoneHere(!goneHere); if (!goneHere) back(); };
  const removeAll = async () => { await global("/api/playlist/remove", { id, removed: !data?.removedForAll }); if (!data?.removedForAll) back(); else load(); };
  // the playlist's name: this device's own, else the default for everyone, else YouTube's
  const [nameText, setNameText] = useState("");
  const shownName = getNames()[id] ?? data?.defaultName ?? data?.name ?? "";
  useEffect(() => { if (data) setNameText(getNames()[id] ?? data.defaultName ?? data.name); }, [data, id]);
  const saveName = async () => {
    const n = nameText.trim();
    const original = admin ? data?.name : data?.defaultName ?? data?.name;
    const value = !n || n === original ? null : n; // the original name = no custom name
    if (admin) { await global("/api/playlist/name", { id, name: value }); setLocalName(id, null); } else setLocalName(id, value);
    load();
  };
  const setOnly = async (artist: string | null) => {
    if (admin) { await global("/api/playlist/settings", { id, artist }); updateLocal((l) => { delete l.artists[id]; }); }
    else updateLocal((l) => { l.artists[id] = artist ?? ""; }); // "" = off on this device
    load();
  };
  // the artist's name is guessed (the most common one in the playlist) and can be typed over
  const [artistText, setArtistText] = useState("");
  useEffect(() => { setArtistText(data?.artist ?? ""); }, [data?.artist]);
  const commitArtist = () => { const a = artistText.trim(); if (a && a !== only) void setOnly(a); else setArtistText(only ?? ""); };
  const ban = async (s: Song) => {
    if (admin) { await global("/api/track/ban", { id: s.id, banned: !s.banned, name: `${s.artists.join(", ")} - ${s.title}` }); if (s.banned) unbanLocal(s.id); }
    else if (s.banned) unbanLocal(s.id); else banLocal(s.id);
    load();
  };
  const startEdit = (s: Song) => { setEditing(s.id); setTitle(s.title); setArtists(s.artists.join(", ")); };
  const save = async (s: Song) => {
    const list = artists.split(",").map((a) => a.trim()).filter(Boolean);
    if (admin) { await global("/api/track/edit", { id: s.id, title, artists: list }); updateLocal((l) => { delete l.tracks[s.id]; }); }
    else updateLocal((l) => { l.tracks[s.id] = { title, artists: list }; });
    setEditing(undefined); load();
  };
  const reset = async (s: Song) => {
    if (admin) await global("/api/track/edit", { id: s.id, reset: true });
    updateLocal((l) => { delete l.tracks[s.id]; });
    setEditing(undefined); load();
  };
  /** Makes this device's corrections for this playlist the default for everyone. */
  const publish = async () => {
    const ids = new Set(data?.tracks.map((x) => x.id));
    const l = getLocal();
    const mine = { tracks: Object.fromEntries(Object.entries(l.tracks).filter(([k]) => ids.has(k))), banned: l.banned.filter((b) => ids.has(b)), artists: id in l.artists ? { [id]: l.artists[id] } : {} };
    await global("/api/admin/publish", { local: mine });
    updateLocal((x) => { for (const k of Object.keys(mine.tracks)) delete x.tracks[k]; x.banned = x.banned.filter((b) => !mine.banned.includes(b)); delete x.artists[id]; });
    setNote(t("Published: these are now the defaults for everyone.")); load();
  };
  const localCount = (() => { const l = getLocal(); const ids = new Set(data?.tracks.map((x) => x.id)); return Object.keys(l.tracks).filter((k) => ids.has(k)).length + l.banned.filter((b) => ids.has(b)).length + (id in l.artists ? 1 : 0); })();

  return (
    <main className="screen plpage">
      <button className="backlink" onClick={back}>{t("← Back")}</button>
      <SettingsMenu solo />
      <Logo small />
      {err && <p className="error">{err}</p>}
      {!data && !err && <p className="muted">{t("Loading…")}</p>}
      {data && (
        <>
          <section className="card">
            <h2>{shownName}</h2>
            <label className="opt"><span>{t("Playlist name")}</span>
              <input value={nameText} maxLength={80} onChange={(e) => setNameText(e.target.value)} onBlur={saveName} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              <small className="muted">{admin ? t("Saved as the name for everyone.") : t("Saved on this device. Empty or the original name resets it.")}</small>
            </label>
            <div className="song-btns">
              <button className="btn ghost" onClick={removeHere}>{goneHere ? t("Add this playlist back (this device)") : t("Remove this playlist (this device)")}</button>
              {admin && <button className="btn ghost" onClick={removeAll}>{data.removedForAll ? t("Add this playlist back for everyone") : t("Remove this playlist for everyone")}</button>}
            </div>
            <div className="opt">
              <span>{t("One artist only")}</span>
              <div className="seg">
                <button type="button" className={!only ? "on" : ""} onClick={() => setOnly(null)}>{t("No")}</button>
                <button type="button" className={only ? "on" : ""} onClick={() => { if (!only) void setOnly(data.artists[0]?.name ?? ""); }}>{t("Yes")}</button>
              </div>
              {only && (
                <>
                  <input className="one-artist" list="pl-artists" value={artistText} maxLength={80} onChange={(e) => setArtistText(e.target.value)} onBlur={commitArtist} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} aria-label={t("Artist")} />
                  <datalist id="pl-artists">{data.artists.map((a) => <option key={a.name} value={a.name} />)}</datalist>
                </>
              )}
              <small className="muted">{only ? t("Every song is treated as by {artist}, and the artist does not have to be guessed.", { artist: only }) : t("Turn on for a playlist of a single artist: its most common artist is assumed for all songs (you can change it).")}</small>
            </div>
          </section>
          {adminAvailable && (
            <section className="card admin">
              <h2>{t("Defaults for everyone")}</h2>
              {admin ? (
                <>
                  <p>{t("Unlocked: changes on this page now become the default for all players.")}</p>
                  <div className="song-btns">
                    <button className="btn" disabled={!localCount} onClick={publish}>{t("Publish this device's changes ({n})", { n: localCount })}</button>
                    <button className="btn ghost" onClick={lock}>{t("Lock")}</button>
                  </div>
                </>
              ) : (
                <form className="yt-add" onSubmit={(e) => { e.preventDefault(); void unlock(); }}>
                  <input type="password" value={pwInput} onChange={(e) => setPwInput(e.target.value)} placeholder={t("Admin password")} autoComplete="current-password" aria-label={t("Admin password")} />
                  <button className="btn" type="submit">{t("Unlock")}</button>
                </form>
              )}
              {note && <p className="muted">{note}</p>}
            </section>
          )}
          <section className="card">
            <h2>{t("Songs")} <small className="muted">({t("{n} in the game", { n: data.tracks.filter(used).length })} / {data.tracks.length})</small></h2>
            <input className="pl-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("Search songs")} aria-label={t("Search songs")} />
            <ul className="songs">
              {shown.map((s) => (
                <li key={s.id} className={used(s) ? "" : "off"}>
                  {editing === s.id ? (
                    <div className="song-edit">
                      <label>{t("Title")}<input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
                      <label>{t("Artist")}<input value={artists} maxLength={200} onChange={(e) => setArtists(e.target.value)} /></label>
                      <small className="muted">{t("Several artists: separate them with commas.")}</small>
                      <div className="song-btns">
                        <button className="btn" onClick={() => save(s)}>{t("Save")}</button>
                        <button className="btn ghost" onClick={() => setEditing(undefined)}>{t("Cancel")}</button>
                        {(s.edited === "local" || (admin && s.edited)) && <button className="btn ghost" onClick={() => reset(s)}>{t("Undo my changes")}</button>}
                      </div>
                    </div>
                  ) : (
                    <>
                      <a className="song-thumb" href={`https://www.youtube.com/watch?v=${s.id}`} target="_blank" rel="noreferrer" title={t("Open on YouTube")}>▶</a>
                      <div className="song-main">
                        <b>{s.title}{s.original && <em title={`${s.original.artists.join(", ")} - ${s.original.title}`}> ✎</em>}</b>
                        <small>{s.artists.join(", ")}{s.banned ? ` · ${s.defaultBanned ? t("banned for everyone") : t("banned")}` : ""}{s.edited === "default" ? ` · ${t("default fix")}` : ""}</small>
                      </div>
                      <button className="icon-btn" onClick={() => startEdit(s)} aria-label={t("Edit title and artist")} title={t("Edit title and artist")}>✎</button>
                      <button className={"icon-btn" + (s.banned ? " voted" : "")} disabled={s.defaultBanned && !admin} onClick={() => ban(s)} aria-label={s.banned ? t("Bring this song back") : t("Never play this song")} title={s.banned ? t("Bring this song back") : t("Never play this song")}>{s.banned ? "↩" : "🚫"}</button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
