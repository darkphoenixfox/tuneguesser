/** Full-screen message when the room cannot be reached (wrong code, host quit, server restarted…). */
export function ErrorPage({ error, onBack, host }: { error: string; onBack: () => void; host?: boolean }) {
  const missing = /not found/i.test(error);
  return (
    <main className="screen center errorpage">
      <div className="card center">
        <div className="errorpage-icon" aria-hidden="true">{missing ? "🔍" : "⚠️"}</div>
        <h1>{missing ? "Room not found" : "Something went wrong"}</h1>
        <p className="errorpage-text">
          {missing
            ? host
              ? "We couldn't find this room. The game may have ended or the server was restarted, so it is gone. Go back and create a new room."
              : "We couldn't find that room. Check the 4-letter code, or the host may have quit the game or closed the room. Ask the host for a fresh code and try again."
            : error}
        </p>
        <button className="btn next-btn" data-pad-first onClick={onBack}>{host ? "Back to start" : "Back to main screen"}</button>
      </div>
    </main>
  );
}
