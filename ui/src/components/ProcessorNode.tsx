//
// Copyright (c) 2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useState } from "react";
import { ChevronDown, ChevronRight, Cpu } from "lucide-react";
import { useStore } from "../state.store";
import { Processor } from "../types";
import { cn } from "@/lib/utils";

export type ChildrenMap = Map<string | null, Processor[]>;

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
