//
// Copyright (c) 2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Cpu,
} from "lucide-react";
import { useStore } from "../state.store";
import { Processor } from "../types";
import { cn } from "@/lib/utils";

export type ChildrenMap = Map<string | null, Processor[]>;

const FLASH_MS = 300;

// Briefly light up a down / up arrow when a frame of that direction is
// *pushed* out of the processor. We key on push (not process) so each
// processor flashes once as it emits a frame onward, rather than twice
// per hop (process-on-arrival + push-on-departure). Only re-renders
// when *this* processor's frame list changes (``pushFrames`` keeps the
// array ref stable for processors that didn't receive frames), so idle
// rows stay quiet.
function useProcessorActivity(workerId: string, processorId: string) {
  const frames = useStore((s) => s.workers[workerId]?.frames[processorId]);
  const [active, setActive] = useState({ down: false, up: false });
  const lastIdRef = useRef<number | null>(null);
  const timers = useRef<{
    down?: ReturnType<typeof setTimeout>;
    up?: ReturnType<typeof setTimeout>;
  }>({});

  useEffect(() => {
    if (!frames || frames.length === 0) return;
    const newestId = frames[0].id;
    // First observation just anchors the cursor — don't flash history.
    if (lastIdRef.current === null) {
      lastIdRef.current = newestId;
      return;
    }
    if (newestId <= lastIdRef.current) return;

    let sawDown = false;
    let sawUp = false;
    for (const f of frames) {
      if (f.id <= lastIdRef.current) break;
      if (f.action !== "push") continue;
      if (f.direction === "downstream") sawDown = true;
      else sawUp = true;
      if (sawDown && sawUp) break;
    }
    lastIdRef.current = newestId;

    if (sawDown) {
      setActive((p) => (p.down ? p : { ...p, down: true }));
      clearTimeout(timers.current.down);
      timers.current.down = setTimeout(
        () => setActive((p) => ({ ...p, down: false })),
        FLASH_MS
      );
    }
    if (sawUp) {
      setActive((p) => (p.up ? p : { ...p, up: true }));
      clearTimeout(timers.current.up);
      timers.current.up = setTimeout(
        () => setActive((p) => ({ ...p, up: false })),
        FLASH_MS
      );
    }
  }, [frames]);

  useEffect(() => {
    const t = timers.current;
    return () => {
      clearTimeout(t.down);
      clearTimeout(t.up);
    };
  }, []);

  return active;
}

type Props = {
  workerId: string;
  processor: Processor;
  depth: number;
  childrenMap: ChildrenMap;
};

export function ProcessorNode({
  workerId,
  processor,
  depth,
  childrenMap,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const selectedProcessor = useStore((s) => s.selectedProcessor);
  const activeWorkerId = useStore((s) => s.activeWorkerId);
  const setActiveWorker = useStore((s) => s.setActiveWorker);
  const setSelectedProcessor = useStore((s) => s.setSelectedProcessorById);
  const setSelectedFrame = useStore((s) => s.setSelectedFrame);
  const setSelectedFramePath = useStore((s) => s.setSelectedFramePath);
  const setSelectedJob = useStore((s) => s.setSelectedJob);
  const keyboardFocus = useStore((s) => s.keyboardFocus);

  const activity = useProcessorActivity(workerId, processor.id);

  const children = childrenMap.get(processor.id) ?? [];
  const hasChildren = children.length > 0;
  const isSelected =
    activeWorkerId === workerId && selectedProcessor?.id === processor.id;

  const Chevron = expanded ? ChevronDown : ChevronRight;

  const onSelect = () => {
    if (activeWorkerId !== workerId) {
      setActiveWorker(workerId);
    }
    setSelectedProcessor(processor.id);
    // Selecting a processor (or switching workers) resets the frame path
    // and its current frame highlight — the previously-selected frame
    // belonged to a different navigation context.
    setSelectedFrame(undefined);
    setSelectedFramePath(undefined);
    // Clear selectedJob too so the Details pane switches from job view
    // to processor view.
    setSelectedJob(undefined);
  };

  return (
    <div>
      <div
        className={cn(
          "group flex items-center mx-1 rounded-lg hover:bg-accent/30 transition-colors",
          // ``ring-2 ring-inset`` paints a 2px box-shadow on the row's
          // inner edge — fills the row from end to end without shifting
          // layout, and survives parent overflow:hidden clips (unlike
          // ``outline``). Bright vs muted depending on which panel last
          // held keyboard focus, so the user sees at a glance which
          // selection arrow keys will move.
          isSelected && "bg-accent/40 ring-2 ring-inset",
          isSelected &&
            (keyboardFocus === "pipeline"
              ? "ring-foreground"
              : "ring-foreground/30")
        )}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 p-0.5 -ml-1 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:outline-none"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <Chevron size={12} />
          </button>
        ) : (
          <span className="shrink-0 w-3" />
        )}
        <button
          onClick={onSelect}
          className="flex-1 flex items-center gap-1.5 px-1 py-1 text-xs text-left min-w-0 focus:outline-none focus-visible:outline-none"
        >
          <Cpu size={11} className="shrink-0 text-muted-foreground" />
          <span className="font-mono truncate" title={processor.name}>
            {processor.name}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-0.5 pr-1.5">
            <ArrowDown
              size={13}
              strokeWidth={2.75}
              className={cn(
                "transition-colors",
                activity.down ? "text-emerald-500" : "text-muted-foreground/35"
              )}
            />
            <ArrowUp
              size={13}
              strokeWidth={2.75}
              className={cn(
                "transition-colors",
                activity.up ? "text-amber-500" : "text-muted-foreground/35"
              )}
            />
          </span>
        </button>
      </div>
      {expanded &&
        children.map((child) => (
          <ProcessorNode
            key={child.id}
            workerId={workerId}
            processor={child}
            depth={depth + 1}
            childrenMap={childrenMap}
          />
        ))}
    </div>
  );
}
