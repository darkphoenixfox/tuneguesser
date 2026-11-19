/** The game logo (artwork + wordmark). `small` is for the lobby and other screens that already have lots of content. */
export function Logo({ small }: { small?: boolean }) {
  return (
    <div className={"brand" + (small ? " small" : "")}>
      <img src="/tuneguesser.png" alt="" width={998} height={905} />
      <h1 className="logo">Tune<span>Guesser</span></h1>
    </div>
  );
}
