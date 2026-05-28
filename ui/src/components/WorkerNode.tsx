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
  Cog,
  Workflow,
} from "lucide-react";
import { useStore } from "../state.store";
import { cn } from "@/lib/utils";

export type WorkersByParent = Map<string | null, string[]>;

const FLASH_MS = 300;

// Aggregate frame activity across all of a worker's processors. Lights
// the down / up arrow when *any* processor in the pipeline pushes a
// frame of that direction. Mirrors ``useProcessorActivity`` but folds
// every processor list together.
function useWorkerActivity(workerId: string) {
  const frames = useStore((s) => s.workers[workerId]?.frames);
  const [active, setActive] = useState({ down: false, up: false });
  const lastIdRef = useRef<number | null>(null);
  const timers = useRef<{
    down?: ReturnType<typeof setTimeout>;
    up?: ReturnType<typeof setTimeout>;
  }>({});

  useEffect(() => {
    if (!frames) return;
    const lists = Object.values(frames);

    // Newest id = max over each list's head (lists are newest-first), so
    // this stays O(processors) instead of O(all frames).
    let newestId = 0;
    for (const list of lists) {
      if (list.length > 0 && list[0].id > newestId) newestId = list[0].id;
    }
    if (newestId === 0) return;

    // First observation just anchors the cursor — don't flash history.
    if (lastIdRef.current === null) {
      lastIdRef.current = newestId;
      return;
    }
    if (newestId <= lastIdRef.current) return;

    let sawDown = false;
    let sawUp = false;
    for (const list of lists) {
      for (const f of list) {
        if (f.id <= lastIdRef.current) break;
        if (f.action === "push") {
          if (f.direction === "downstream") sawDown = true;
          else sawUp = true;
        }
        if (sawDown && sawUp) break;
      }
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
  depth: number;
  workersByParent: WorkersByParent;
};

export function WorkerNode({ workerId, depth, workersByParent }: Props) {
  const worker = useStore((s) => s.workers[workerId]);
  const activeWorkerId = useStore((s) => s.activeWorkerId);
  const setActiveWorker = useStore((s) => s.setActiveWorker);
  const keyboardFocus = useStore((s) => s.keyboardFocus);

  const [expanded, setExpanded] = useState(true);
  const activity = useWorkerActivity(workerId);

  if (!worker) return null;

  const childWorkerIds = workersByParent.get(workerId) ?? [];
  const hasChildWorkers = childWorkerIds.length > 0;
  const isActive = workerId === activeWorkerId;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  // Icon answers "does this worker have a pipeline?" Workflow = yes (we
  // have an observer + topology), Cog = no (a BaseWorker like the
  // WhiskerSink, or a remote worker we have no observer for). Local vs
  // remote is conveyed by the parent runner row's House / Globe icon.
  const pipelineKnown = worker.observed;
  const Icon = pipelineKnown ? Workflow : Cog;

  // Tightened from ``12 + depth * 16`` once the runner header took over
  // the top-level row — the previous spacing made first-level workers
  // feel orphaned from their runner.
  const headerPad = 8 + depth * 12;
  const childDepth = depth + 1;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center mx-1 rounded-lg hover:bg-accent/30 transition-colors",
          isActive && "bg-accent/40 ring-2 ring-inset",
          isActive &&
            (keyboardFocus === "workers"
              ? "ring-foreground"
              : "ring-foreground/30")
        )}
        style={{ paddingLeft: `${headerPad}px` }}
      >
        {hasChildWorkers ? (
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
          onClick={() => setActiveWorker(workerId)}
          className={cn(
            "flex-1 flex items-center gap-2 px-1.5 py-1.5 text-left min-w-0 focus:outline-none focus-visible:outline-none",
            // Workers without a known pipeline read as muted — the
            // Pipeline / Frames / Frame-path panes can't show anything
            // useful for them, but Details still surfaces id / runner /
            // status. Applies uniformly to local BaseWorkers (e.g. the
            // WhiskerSink) and to remote workers.
            !pipelineKnown && "text-muted-foreground"
          )}
        >
          <Icon size={12} className="shrink-0 text-muted-foreground" />
          {/* Name + status share the left side; the name truncates first
              and the status stays pinned right next to it. */}
          <span className="flex-1 min-w-0 flex items-center gap-2">
            <span
              className="font-mono text-xs truncate min-w-0"
              title={worker.worker_id}
            >
              {worker.worker_id}
            </span>
            {worker.status && (
              <span className="shrink-0 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {worker.status}
              </span>
            )}
          </span>
          {pipelineKnown && (
            // Aggregate pipeline activity — lights when any processor in
            // this worker pushes a frame, so you can see traffic in
            // workers other than the selected one.
            <span className="flex shrink-0 items-center gap-0.5">
              <ArrowDown
                size={13}
                strokeWidth={2.75}
                className={cn(
                  "transition-colors",
                  activity.down
                    ? "text-emerald-500"
                    : "text-muted-foreground/35"
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
          )}
        </button>
      </div>

      {expanded &&
        hasChildWorkers &&
        childWorkerIds.map((id) => (
          <WorkerNode
            key={id}
            workerId={id}
            depth={childDepth}
            workersByParent={workersByParent}
          />
        ))}
    </div>
  );
}
