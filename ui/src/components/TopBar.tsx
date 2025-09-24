//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useEffect, useRef } from "react";
import { useStore } from "../state.store";
import cls from "classnames";
import { usePipecatSocket } from "../hooks.usePipecatSocket";
import { useWhisker } from "../hooks.useWhisker";

export function TopBar() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const connected = useStore((s) => s.connected);
  const url = useStore((s) => s.wsUrl);
  const setUrl = useStore((s) => s.setWsUrl);
  const resetPipeline = useStore((s) => s.resetPipeline);
  const { connect, disconnect } = usePipecatSocket();
  const { loadMessages } = useWhisker();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "d")
        setTheme(theme === "light" ? "dark" : "light");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [theme, setTheme]);

  const handleButtonClick = () => {
    fileInputRef.current?.click(); // open file dialog
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.readAsArrayBuffer(file);

    reader.onload = () => {
      const CLEAR_PIPELINE_MS = 500;

      resetPipeline();

      // We just give time to Cytoscape to clear everything.
      setTimeout(() => {
        loadMessages(reader.result);
        e.target.value = "";
      }, CLEAR_PIPELINE_MS);
    };

    reader.onerror = () => {
      console.error("Error reading file", reader.error);
    };
  };

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

      <button onClick={handleButtonClick} className="btn primary">
        Load session
      </button>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* Spacer pushes next item to far right */}
      <div style={{ flex: 1 }} />

      <div>Tip: Connect any time, frames are buffered while disconnected.</div>

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
