//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useEffect } from "react";
import { useStore } from "../state.store";
import cls from "classnames";
import { usePipecatSocket } from "../hooks.usePipecatSocket";

export function TopBar() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const connected = useStore((s) => s.connected);
  const url = useStore((s) => s.wsUrl);
  const setUrl = useStore((s) => s.setWsUrl);
  const { connect, disconnect } = usePipecatSocket();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "d")
        setTheme(theme === "light" ? "dark" : "light");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [theme, setTheme]);

  return (
    <div className="topbar">
      <div className="brand">ᓚᘏᗢ Whisker</div>
      <span
        className={cls("pill")}
        style={{ borderColor: connected ? "var(--accent)" : "var(--danger)" }}
      >
        {connected ? "Connected" : "Disconnected"}
      </span>
      <input
        className="input"
        placeholder="ws://host:port"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      {connected ? (
        <button className="btn danger" onClick={disconnect}>
          Disconnect
        </button>
      ) : (
        <button className="btn primary" onClick={connect}>
          Connect
        </button>
      )}

      <div>Tip: Connect any time, frames are buffered while disconnected.</div>

      {/* Spacer pushes next item to far right */}
      <div style={{ flex: 1 }} />

      <button
        className="btn"
        style={{ color: "var(--text)" }}
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      >
        {theme === "light" ? "🌙 Dark" : "☀️ Light"}
      </button>
    </div>
  );
}
