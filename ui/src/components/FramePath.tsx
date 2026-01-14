//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useEffect, useMemo, useRef } from "react";
import { useStore } from "../state.store";
import { ScrollArea } from "./ui/scroll-area";
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

  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (selectedFramePath) {
      const idx = frameTimeline.findIndex(
        ({ processor, frame }) => frame.id === selectedFramePath.id
      );
      if (idx >= 0 && refs.current[idx]) {
        refs.current[idx]!.focus();
      }
    }
  }, [selectedFramePath, frameTimeline]);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="border border-dashed rounded-lg p-1 overflow-hidden flex flex-col flex-1 min-h-0 my-1">
        <ScrollArea className="flex-1 min-h-0">
          <div className="grid gap-1.5 font-mono text-xs content-start">
            {frameTimeline.length === 0 && (
              <div className="text-muted-foreground text-xs">
                Select a frame.
              </div>
            )}
            {frameTimeline.map(({ processor, frame }, idx) => {
              const isSelected = selectedFrame?.id === frame.id;
              return (
                <FramePathItem
                  key={`path-${frame.id}-${idx}`}
                  idx={idx}
                  ref={(el) => {
                    refs.current[idx] = el;
                  }}
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
                      idx < frameTimeline.length - 1
                    ) {
                      const next = frameTimeline[idx + 1];
                      setSelectedFramePath(next.frame);
                      setSelectedFrame(next.frame);
                      setSelectedProcessor(next.processor.id);
                    }
                    if (e.key === "ArrowUp" && idx > 0) {
                      const prev = frameTimeline[idx - 1];
                      setSelectedFramePath(prev.frame);
                      setSelectedFrame(prev.frame);
                      setSelectedProcessor(prev.processor.id);
                    }
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
