//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import React from "react";
import { useEffect, useMemo, useRef } from "react";
import { useStore } from "../state.store";
import { FrameMessage, Processor } from "../types";
import { useWhisker } from "../hooks.useWhisker";
import cls from "classnames";

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
  }, [frames, framePaths, processors, selectedFrame, selectedFramePath, showPush, showProcess]);

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
    <div className="pane-container">
      <div className="pane">
        <div className="list">
          {frameTimeline.length === 0 && (
            <div className="footer-note">Select a frame.</div>
          )}
          {frameTimeline.map(({ processor, frame }, idx) => {
            const isSelected = selectedFrame.id === frame.id;
            return (
              <FramePathItem
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
                  if (e.key === "ArrowDown" && idx < frameTimeline.length - 1) {
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
      </div>
    </div>
  );
}

type FramePathItemProps = {
  idx: number;
  frame: FrameMessage;
  processor: Processor;
  isSelected: boolean;
  onClick: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
};

const FramePathItem = React.forwardRef<HTMLDivElement, FramePathItemProps>(
  ({ idx, frame, processor, isSelected, onClick, onKeyDown }, ref) => {
    useEffect(() => {
      if (
        isSelected &&
        ref &&
        typeof ref === "object" &&
        "current" in ref &&
        ref.current
      ) {
        ref.current.scrollIntoView({ block: "nearest" });
      }
    }, [isSelected, ref]);

    const { frameBackground } = useWhisker();

    return (
      <div
        ref={ref}
        key={`path-${frame.id}-${idx}`}
        data-key={`path-${frame.id}-${idx}`}
        className={cls("list-item", "frame-item", { selected: isSelected })}
        tabIndex={0} // makes it keyboard focusable
        style={{ background: frameBackground(frame) }}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <div className="frame-header">
          <span>{frame.direction === "upstream" ? "⬆️️" : "⬇️️"}</span>
          <span>
            <b>{frame.event === "process" ? "PROCESS ⚙️️" : "PUSH 🚀"}</b>
          </span>
          <b>#{processor.name}</b>
          <span className="footer-note">
            • {new Date(frame.timestamp).toISOString()}
          </span>
        </div>
      </div>
    );
  }
);
