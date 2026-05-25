//
// Copyright (c) 2025-2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { selectFrames, useStore } from "../state.store";
import { FrameItem } from "./FrameItem";
import { FrameFilters } from "./FrameFilters";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export function FrameInspector() {
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [showUpstream, setShowUpstream] = useState(true);
  const [showDownstream, setShowDownstream] = useState(true);
  const frames = useStore(selectFrames);
  const showPush = useStore((s) => s.showPush);
  const showProcess = useStore((s) => s.showProcess);
  const setShowPush = useStore((s) => s.setShowPush);
  const setShowProcess = useStore((s) => s.setShowProcess);
  const selected = useStore((s) => s.selectedProcessor);
  const selectedFrame = useStore((s) => s.selectedFrame);
  const setSelectedFrame = useStore((s) => s.setSelectedFrame);
  const setSelectedFramePath = useStore((s) => s.setSelectedFramePath);
  const setKeyboardFocus = useStore((s) => s.setKeyboardFocus);

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

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: sortedFrames.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const frame = sortedFrames[index];
      const isSelected = selectedFrame?.id === frame?.id;
      // Return larger estimate for selected/expanded items
      return isSelected ? 200 : 60;
    },
    overscan: 5,
    measureElement: (el) => {
      if (!el) return 60;
      const rect = el.getBoundingClientRect();
      return rect.height;
    },
  });

  // Up/Down navigation. Handler reads live state and lives at the parent
  // so it isn't tied to a single virtualized item's closure.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (!selectedFrame || sortedFrames.length === 0) return;
    const idx = sortedFrames.findIndex((f) => f.id === selectedFrame.id);
    if (idx < 0) return;
    if (e.key === "ArrowDown" && idx < sortedFrames.length - 1) {
      e.preventDefault();
      const next = sortedFrames[idx + 1];
      setSelectedFrame(next);
      setSelectedFramePath(next);
      virtualizer.scrollToIndex(idx + 1, { align: "auto" });
    }
    if (e.key === "ArrowUp" && idx > 0) {
      e.preventDefault();
      const prev = sortedFrames[idx - 1];
      setSelectedFrame(prev);
      setSelectedFramePath(prev);
      virtualizer.scrollToIndex(idx - 1, { align: "auto" });
    }
  };

  return (
    <Card className="flex flex-col min-h-0 overflow-hidden h-full">
      <CardHeader className="pb-2 flex-shrink-0 px-4 pt-4">
        <CardTitle className="text-sm text-muted-foreground truncate">
          Frames{selected ? ` (processor: ${selected.name})` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-hidden p-2">
        <div className="flex flex-col gap-2 h-full min-h-0">
          <FrameFilters
            availableTypes={availableTypes}
            selectedTypes={selectedTypes}
            onTypesChange={setSelectedTypes}
            showPush={showPush}
            showProcess={showProcess}
            showUpstream={showUpstream}
            showDownstream={showDownstream}
            onShowPushChange={setShowPush}
            onShowProcessChange={setShowProcess}
            onShowUpstreamChange={setShowUpstream}
            onShowDownstreamChange={setShowDownstream}
            visibleCount={sortedFrames.length}
            totalCount={allFrames.length}
          />
          <div
            className="border border-dashed rounded-lg p-1 overflow-hidden flex flex-col flex-1 min-h-0 my-1"
            onKeyDown={handleKeyDown}
            onFocus={() => setKeyboardFocus("frames")}
          >
        <div
          ref={parentRef}
          className="flex-1 min-h-0 overflow-auto font-mono text-xs"
          style={{ contain: "strict" }}
        >
          {sortedFrames.length === 0 ? (
            <div className="text-muted-foreground text-xs p-2">
              Select a processor.
            </div>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const f = sortedFrames[virtualItem.index];
                const isSelected = selectedFrame?.id === f.id;
                return (
                  <div
                    key={`frame-${f.id}-${virtualItem.index}`}
                    ref={virtualizer.measureElement}
                    data-index={virtualItem.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      paddingBottom: "6px", // Gap between items
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <FrameItem
                      frame={f}
                      isSelected={isSelected}
                      onClick={() => {
                        const wasSelected = isSelected;
                        setSelectedFrame(wasSelected ? undefined : f);
                        setSelectedFramePath(wasSelected ? undefined : f);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
