//
// Copyright (c) 2025-2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useMemo, useState } from "react";
import { useStore } from "../state.store";
import { ScrollArea } from "./ui/scroll-area";
import { FrameItem } from "./FrameItem";
import { FrameFilters } from "./FrameFilters";

export function FrameInspector() {
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
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

  return (
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
      />
      <span className="text-sm text-foreground/70 my-1 flex-shrink-0">
        Showing {sortedFrames.length} frames out of {allFrames.length}
      </span>
      <div className="border border-dashed rounded-lg p-1 overflow-hidden flex flex-col flex-1 min-h-0 my-1">
        <ScrollArea className="flex-1 min-h-0">
          <div className="grid gap-1.5 font-mono text-xs content-start">
            {sortedFrames.length === 0 && (
              <div className="text-muted-foreground text-xs">
                Select a processor.
              </div>
            )}
            {sortedFrames.map((f, idx) => {
              const isSelected = selectedFrame?.id === f.id;
              return (
                <FrameItem
                  key={`frame-${f.id}-${idx}`}
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
        </ScrollArea>
      </div>
    </div>
  );
}
