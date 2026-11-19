import { Component, type ReactNode } from "react";
import { t } from "./i18n";

/** Without this, any error while rendering unmounts the whole app and leaves a black screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen" style={{ padding: 24, textAlign: "center" }}>
        <h2>{t("Something went wrong")}</h2>
        <p className="muted" style={{ wordBreak: "break-word" }}>{String(this.state.error.message || this.state.error)}</p>
        <button className="btn big" onClick={() => location.reload()}>{t("Reload")}</button>
      </div>
    );
  }
}
