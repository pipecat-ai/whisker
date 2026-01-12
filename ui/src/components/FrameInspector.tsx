//
// Copyright (c) 2025-2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state.store";
import { FrameMessage } from "../types";
import { useWhisker } from "../hooks.useWhisker";

export function FrameInspector() {
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [typeSearch, setTypeSearch] = useState("");
  const [showPush, setShowPush] = useState(true);
  const [showProcess, setShowProcess] = useState(true);
  const [showUpstream, setShowUpstream] = useState(true);
  const [showDownstream, setShowDownstream] = useState(true);
  const frames = useStore((s) => s.frames);
  const selected = useStore((s) => s.selectedProcessor);
  const selectedFrame = useStore((s) => s.selectedFrame);
  const setSelectedFrame = useStore((s) => s.setSelectedFrame);
  const setSelectedFramePath = useStore((s) => s.setSelectedFramePath);

  const getBaseName = (name: string) => name.replace(/#\d+$/, "");

  const allFrames = useMemo(() => {
    if (!selected) return [];
    return frames[selected.id] ?? [];
  }, [frames, selected]);

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    Object.values(frames).forEach((frameList) =>
      frameList.forEach((f) => types.add(getBaseName(f.name)))
    );
    return Array.from(types).sort();
  }, [frames]);

  const filteredTypes = useMemo(() => {
    if (!typeSearch) return availableTypes;
    const q = typeSearch.toLowerCase();
    return availableTypes.filter((t) => t.toLowerCase().includes(q));
  }, [availableTypes, typeSearch]);

  const sortedFrames = useMemo(() => {
    if (!selected) return [];
    let filtered = allFrames;
    if (selectedTypes.size > 0) {
      filtered = filtered.filter((f) => selectedTypes.has(getBaseName(f.name)));
    }
    filtered = filtered.filter(
      (f) =>
        (f.event === "push" && showPush) ||
        (f.event === "process" && showProcess)
    );
    filtered = filtered.filter(
      (f) =>
        (f.direction === "upstream" && showUpstream) ||
        (f.direction === "downstream" && showDownstream)
    );
    return filtered.sort((a, b) => a.timestamp - b.timestamp);
  }, [
    selectedTypes,
    allFrames,
    selected,
    showPush,
    showProcess,
    showUpstream,
    showDownstream,
  ]);

  const toggleType = (type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedTypes(new Set(filteredTypes));
  };

  const clearAll = () => {
    setSelectedTypes(new Set());
  };

  return (
    <div className="split">
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            style={{
              width: "100%",
              padding: "8px 10px",
              fontSize: "14px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              margin: "4px 0 4px 0",
              background: "var(--bg)",
              color: "var(--text)",
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              {selectedTypes.size === 0
                ? "All frames"
                : `${selectedTypes.size} frame type${selectedTypes.size > 1 ? "s" : ""} selected`}
            </span>
            <span>{isFilterOpen ? "▲" : "▼"}</span>
          </button>
          {isFilterOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                zIndex: 100,
                maxHeight: "300px",
                overflowY: "auto",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  padding: "8px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <button
                  onClick={selectAll}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    fontSize: "14px",
                    borderRadius: "4px",
                    border: "none",
                    background: "var(--border)",
                    color: "var(--text)",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Select All
                </button>
                <button
                  onClick={clearAll}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    fontSize: "14px",
                    borderRadius: "4px",
                    border: "none",
                    background: "var(--border)",
                    color: "var(--text)",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Clear All
                </button>
              </div>
              <div
                style={{
                  padding: "8px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <input
                  type="text"
                  placeholder="Search frames..."
                  value={typeSearch}
                  onChange={(e) => setTypeSearch(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    fontSize: "14px",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              {filteredTypes.length === 0 ? (
                <div
                  style={{
                    padding: "12px",
                    color: "var(--text)",
                    opacity: 0.6,
                  }}
                >
                  No frames available
                </div>
              ) : (
                filteredTypes.map((type) => (
                  <label
                    key={type}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 12px",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border)",
                      fontSize: "14px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTypes.has(type)}
                      onChange={() => toggleType(type)}
                      style={{ cursor: "pointer" }}
                    />
                    <span style={{ color: "var(--text)" }}>{type}</span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            padding: "6px 10px",
            border: "1px solid var(--border)",
            borderRadius: "8px",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              cursor: "pointer",
              fontSize: "14px",
              color: "var(--text)",
            }}
          >
            <input
              type="checkbox"
              checked={showPush}
              onChange={(e) => setShowPush(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            PUSH
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              cursor: "pointer",
              fontSize: "14px",
              color: "var(--text)",
            }}
          >
            <input
              type="checkbox"
              checked={showProcess}
              onChange={(e) => setShowProcess(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            PROCESS
          </label>
        </div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            padding: "6px 10px",
            border: "1px solid var(--border)",
            borderRadius: "8px",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              cursor: "pointer",
              fontSize: "14px",
              color: "var(--text)",
            }}
          >
            <input
              type="checkbox"
              checked={showUpstream}
              onChange={(e) => setShowUpstream(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            UPSTREAM
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              cursor: "pointer",
              fontSize: "14px",
              color: "var(--text)",
            }}
          >
            <input
              type="checkbox"
              checked={showDownstream}
              onChange={(e) => setShowDownstream(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            DOWNSTREAM
          </label>
        </div>
      </div>
      <span
        style={{
          fontSize: "14px",
          color: "var(--text)",
          opacity: 0.7,
          margin: "4px 0",
        }}
      >
        Showing {sortedFrames.length} frames out of {allFrames.length}
      </span>
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

  const { frameBackground } = useWhisker();

  return (
    <div
      key={`frame-${frame.id}-${idx}`}
      ref={ref}
      className="list-item"
      style={{
        background: frameBackground(frame),
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
          {JSON.stringify(frame.payload, null, 2)}
        </div>
      )}
    </div>
  );
}
