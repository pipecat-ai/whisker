//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state.store";
import { FrameMessage } from "../types";

export function FrameInspector() {
  const [filter, setFilter] = useState("");
  const frames = useStore((s) => s.frames);
  const selected = useStore((s) => s.selectedProcessor);
  const selectedFrame = useStore((s) => s.selectedFrame);
  const setSelectedFrame = useStore((s) => s.setSelectedFrame);
  const setSelectedFramePath = useStore((s) => s.setSelectedFramePath);

  const sortedFrames = useMemo(() => {
    if (!selected) return [];
    const all = frames[selected.id] ?? [];
    const q = filter.toLowerCase();
    return all
      .filter((f) => f.name.toLowerCase().includes(q))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [filter, frames, selected]);

  return (
    <div className="split">
      <input
        type="text"
        placeholder="Filter by frame…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 10px",
          fontSize: "14px",
          borderRadius: "8px",
          border: "1px solid #ccc",
          margin: "4px 0 4px 0",
        }}
      />
      <div className="pane">
        <div className="list">
          {sortedFrames.length === 0 && (
            <div className="footer-note">Select a processor.</div>
          )}
          {sortedFrames.map((f, idx) => {
            const isSelected = selectedFrame?.id === f.id;
            return (
              <FrameItem
                idx={idx}
                frame={f}
                isSelected={isSelected}
                onClick={() => {
                  setSelectedFrame(isSelected ? undefined : f);
                  setSelectedFramePath(isSelected ? undefined : f);
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FrameItem({
  idx,
  frame,
  isSelected,
  onClick,
}: {
  idx: number;
  frame: FrameMessage;
  isSelected: boolean;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isSelected && ref.current) {
      ref.current.scrollIntoView({ block: "nearest" });
    }
  }, [isSelected]);

  return (
    <div
      key={`frame-${frame.id}-${idx}`}
      ref={ref}
      className="list-item"
      style={{
        background:
          frame.event === "process"
            ? "rgba(16,185,129,0.15)"
            : "rgba(59,130,246,0.15)",
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        border: isSelected ? "2px solid black" : "1px solid transparent",
      }}
      onClick={onClick}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span>{frame.direction === "upstream" ? "⬆️️" : "⬇️️"}</span>
        <span>
          <b>{frame.event === "process" ? "PROCESS ⚙️️" : "PUSH 🚀"}</b>
        </span>
        <b>#{frame.name}</b>
        <span className="footer-note">
          • {new Date(frame.timestamp).toISOString()}
        </span>
        <span style={{ marginLeft: "auto" }}>{isSelected ? "▼" : "▶"}</span>
      </div>
      {isSelected && (
        <div
          className="footer-note"
          style={{ whiteSpace: "pre-wrap", marginTop: 4 }}
        >
          {JSON.stringify(JSON.parse(frame.payload), null, 2)}
        </div>
      )}
    </div>
  );
}
