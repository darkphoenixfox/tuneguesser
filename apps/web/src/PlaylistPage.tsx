import { useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "./Logo";
import { SettingsMenu } from "./Settings";
import { t } from "./i18n";

interface Song { id: string; title: string; artists: string[]; original?: { title: string; artists: string[] }; blacklisted: boolean }
interface Data { id: string; name: string; artist: string | null; artists: Array<{ name: string; n: number }>; tracks: Song[] }

const post = (path: string, body: unknown) => fetch(path, { method: "POST", body: JSON.stringify(body) });
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** One playlist: check its songs, fix a title or artist, ban or bring back a song, limit the list to one artist. */
export function PlaylistPage({ id }: { id: string }) {
  const [data, setData] = useState<Data>();
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<string>();
  const [title, setTitle] = useState("");
  const [artists, setArtists] = useState("");
  const load = useCallback(() => {
    fetch(`/api/youtube/playlist/tracks?id=${encodeURIComponent(id)}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j as Data; })
      .then(setData)
      .catch((e: Error) => setErr(e.message || t("Cannot reach the server")));
  }, [id]);
  useEffect(load, [load]);

  const back = () => { if (history.length > 1) history.back(); else location.href = "/"; };
  const only = data?.artist ?? null;
  const used = (s: Song) => !s.blacklisted && (!only || s.artists.some((a) => same(a, only)));
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (data?.tracks ?? []).filter((s) => !f || `${s.title} ${s.artists.join(" ")}`.toLowerCase().includes(f));
  }, [data, filter]);

  const setOnly = async (artist: string | null) => { await post("/api/playlist/settings", { id, artist }); load(); };
  const ban = async (s: Song) => { await post("/api/track/ban", { id: s.id, banned: !s.blacklisted, name: `${s.artists.join(", ")} - ${s.title}` }); load(); };
  const startEdit = (s: Song) => { setEditing(s.id); setTitle(s.title); setArtists(s.artists.join(", ")); };
  const save = async (s: Song) => {
    await post("/api/track/edit", { id: s.id, title, artists: artists.split(",").map((a) => a.trim()).filter(Boolean) });
    setEditing(undefined); load();
  };
  const reset = async (s: Song) => { await post("/api/track/edit", { id: s.id, reset: true }); setEditing(undefined); load(); };

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
            <h2>{data.name}</h2>
            <div className="opt">
              <span>{t("One artist only")}</span>
              <div className="seg">
                <button type="button" className={!only ? "on" : ""} onClick={() => setOnly(null)}>{t("No")}</button>
                <button type="button" className={only ? "on" : ""} onClick={() => setOnly(only ?? data.artists[0]?.name ?? null)}>{t("Yes")}</button>
              </div>
              {only && (
                <select value={data.artists.find((a) => same(a.name, only))?.name ?? only} onChange={(e) => setOnly(e.target.value)} aria-label={t("Artist")}>
                  {!data.artists.some((a) => same(a.name, only)) && <option value={only}>{only}</option>}
                  {data.artists.map((a) => <option key={a.name} value={a.name}>{a.name} ({a.n})</option>)}
                </select>
              )}
              <small className="muted">{only ? t("Only songs by {artist} are played, and the artist does not have to be guessed.", { artist: only }) : t("Turn on for a playlist of a single artist: other artists' songs are left out.")}</small>
            </div>
          </section>
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
                        {s.original && <button className="btn ghost" onClick={() => reset(s)}>{t("Undo my changes")}</button>}
                      </div>
                    </div>
                  ) : (
                    <>
                      <a className="song-thumb" href={`https://www.youtube.com/watch?v=${s.id}`} target="_blank" rel="noreferrer" title={t("Open on YouTube")}>▶</a>
                      <div className="song-main">
                        <b>{s.title}{s.original && <em title={`${s.original.artists.join(", ")} - ${s.original.title}`}> ✎</em>}</b>
                        <small>{s.artists.join(", ")}{s.blacklisted ? ` · ${t("banned")}` : only && !used(s) ? ` · ${t("other artist")}` : ""}</small>
                      </div>
                      <button className="icon-btn" onClick={() => startEdit(s)} aria-label={t("Edit title and artist")} title={t("Edit title and artist")}>✎</button>
                      <button className={"icon-btn" + (s.blacklisted ? " voted" : "")} onClick={() => ban(s)} aria-label={s.blacklisted ? t("Bring this song back") : t("Never play this song")} title={s.blacklisted ? t("Bring this song back") : t("Never play this song")}>{s.blacklisted ? "↩" : "🚫"}</button>
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
