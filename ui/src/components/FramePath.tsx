//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useStore } from "../state.store";
import { FramePathItem } from "./FramePathItem";

export function FramePath() {
  const frames = useStore((s) => s.frames);
  const framePaths = useStore((s) => s.framePaths);
  const processors = useStore((s) => s.processors);
  const selectedFrame = useStore((s) => s.selectedFrame);
  const selectedFramePath = useStore((s) => s.selectedFramePath);
  const setSelectedFrame = useStore((s) => s.setSelectedFrame);
  const setSelectedFramePath = useStore((s) => s.setSelectedFramePath);
  const setSelectedProcessor = useStore((s) => s.setSelectedProcessorById);
  const showPush = useStore((s) => s.showPush);
  const showProcess = useStore((s) => s.showProcess);

  const frameTimeline = useMemo(() => {
    if (!selectedFrame) return [];
    const processors = framePaths[selectedFrame.name] || [];

    // Flatten all processor + frame combinations
    const timeline = processors.flatMap((proc) => {
      return (frames[proc.id] || [])
        .filter((frame) => frame.name === selectedFrame.name)
        .filter(
          (frame) =>
            (frame.event === "push" && showPush) ||
            (frame.event === "process" && showProcess)
        )
        .map((frame) => ({ processor: proc, frame }));
    });

    // Sort by frame timestamp
    timeline.sort((a, b) => a.frame.timestamp - b.frame.timestamp);

    return timeline;
  }, [
    frames,
    framePaths,
    processors,
    selectedFrame,
    selectedFramePath,
    showPush,
    showProcess,
  ]);

  const parentRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const virtualizer = useVirtualizer({
    count: frameTimeline.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 5,
    measureElement: (el) => {
      return el?.getBoundingClientRect().height ?? 60;
    },
  });

  useEffect(() => {
    if (selectedFramePath) {
      const idx = frameTimeline.findIndex(
        ({ frame }) => frame.id === selectedFramePath.id
      );
      if (idx >= 0) {
        virtualizer.scrollToIndex(idx, { align: "center", behavior: "smooth" });
        const item = itemRefs.current.get(idx);
        if (item) {
          item.focus();
        }
      }
    }
  }, [selectedFramePath, frameTimeline, virtualizer]);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="border border-dashed rounded-lg p-1 overflow-hidden flex flex-col flex-1 min-h-0 my-1">
        <div
          ref={parentRef}
          className="flex-1 min-h-0 overflow-auto font-mono text-xs"
          style={{ contain: "strict" }}
        >
          {frameTimeline.length === 0 ? (
            <div className="text-muted-foreground text-xs p-2">
              Select a frame.
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
                const { processor, frame } = frameTimeline[virtualItem.index];
                const isSelected = selectedFrame?.id === frame.id;
                return (
                  <div
                    key={`path-${frame.id}-${virtualItem.index}`}
                    ref={(el) => {
                      if (el) {
                        itemRefs.current.set(virtualItem.index, el);
                        virtualizer.measureElement(el);
                      } else {
                        itemRefs.current.delete(virtualItem.index);
                      }
                    }}
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
                    <FramePathItem
                      idx={virtualItem.index}
                      frame={frame}
                      processor={processor}
                      isSelected={isSelected}
                      onClick={() => {
                        setSelectedFramePath(frame);
                        setSelectedFrame(frame);
                        setSelectedProcessor(processor.id);
                      }}
                      onKeyDown={(e) => {
                        if (
                          e.key === "ArrowDown" &&
                          virtualItem.index < frameTimeline.length - 1
                        ) {
                          const next = frameTimeline[virtualItem.index + 1];
                          setSelectedFramePath(next.frame);
                          setSelectedFrame(next.frame);
                          setSelectedProcessor(next.processor.id);
                        }
                        if (e.key === "ArrowUp" && virtualItem.index > 0) {
                          const prev = frameTimeline[virtualItem.index - 1];
                          setSelectedFramePath(prev.frame);
                          setSelectedFrame(prev.frame);
                          setSelectedProcessor(prev.processor.id);
                        }
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
  );
}
