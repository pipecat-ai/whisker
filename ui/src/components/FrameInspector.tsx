//
// Copyright (c) 2025-2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state.store";
import { FrameMessage } from "../types";
import { useWhisker } from "../hooks.useWhisker";
import cls from "classnames";

export function FrameInspector() {
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [typeSearch, setTypeSearch] = useState("");
  const [showUpstream, setShowUpstream] = useState(true);
  const [showDownstream, setShowDownstream] = useState(true);
  const frames = useStore((s) => s.frames);
  const showPush = useStore((s) => s.showPush);
  const showProcess = useStore((s) => s.showProcess);
  const setShowPush = useStore((s) => s.setShowPush);
  const setShowProcess = useStore((s) => s.setShowProcess);
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
      <div className="filter-row">
        <div className="filter-dropdown">
          <button
            className="filter-button"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
          >
            <span>
              {selectedTypes.size === 0
                ? "All frames"
                : `${selectedTypes.size} frame type${selectedTypes.size > 1 ? "s" : ""} selected`}
            </span>
            <span>{isFilterOpen ? "▲" : "▼"}</span>
          </button>
          {isFilterOpen && (
            <div className="filter-menu">
              <div className="filter-menu-header">
                <button className="btn-sm" onClick={selectAll}>
                  Select All
                </button>
                <button className="btn-sm" onClick={clearAll}>
                  Clear All
                </button>
              </div>
              <div className="filter-menu-search">
                <input
                  type="text"
                  className="filter-input"
                  placeholder="Search frames..."
                  value={typeSearch}
                  onChange={(e) => setTypeSearch(e.target.value)}
                />
              </div>
              {filteredTypes.length === 0 ? (
                <div className="filter-menu-empty">No frames available</div>
              ) : (
                filteredTypes.map((type) => (
                  <label key={type} className="filter-menu-item">
                    <input
                      type="checkbox"
                      checked={selectedTypes.has(type)}
                      onChange={() => toggleType(type)}
                    />
                    <span>{type}</span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>
        <div className="checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showPush}
              onChange={(e) => setShowPush(e.target.checked)}
            />
            PUSH
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showProcess}
              onChange={(e) => setShowProcess(e.target.checked)}
            />
            PROCESS
          </label>
        </div>
        <div className="checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showUpstream}
              onChange={(e) => setShowUpstream(e.target.checked)}
            />
            UPSTREAM
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showDownstream}
              onChange={(e) => setShowDownstream(e.target.checked)}
            />
            DOWNSTREAM
          </label>
        </div>
      </div>
      <span className="frame-count">
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
      className={cls("list-item", "frame-item", { selected: isSelected })}
      style={{ background: frameBackground(frame) }}
    >
      <div className="frame-header" onClick={onClick}>
        <span>{frame.direction === "upstream" ? "⬆️️" : "⬇️️"}</span>
        <span>
          <b>{frame.event === "process" ? "PROCESS ⚙️️" : "PUSH 🚀"}</b>
        </span>
        <b>#{frame.name}</b>
        <span className="footer-note">
          • {new Date(frame.timestamp).toISOString()}
        </span>
        <span className="ml-auto">{isSelected ? "▼" : "▶"}</span>
      </div>
      {isSelected && (
        <div className="footer-note frame-details">
          {JSON.stringify(frame.payload, null, 2)}
        </div>
      )}
    </div>
  );
}
