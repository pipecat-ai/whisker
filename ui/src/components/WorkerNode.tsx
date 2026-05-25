//
// Copyright (c) 2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useState } from "react";
import { ChevronDown, ChevronRight, Workflow } from "lucide-react";
import { useStore } from "../state.store";
import { cn } from "@/lib/utils";

export type WorkersByParent = Map<string | null, string[]>;

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

  if (!worker) return null;

  const childWorkerIds = workersByParent.get(workerId) ?? [];
  const hasChildWorkers = childWorkerIds.length > 0;
  const isActive = workerId === activeWorkerId;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  const headerPad = 12 + depth * 16;
  const childDepth = depth + 1;

  return (
    <div className={depth === 0 ? "border-b last:border-b-0" : ""}>
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
          className="flex-1 flex items-center gap-2 px-1.5 py-1.5 text-left min-w-0 focus:outline-none focus-visible:outline-none"
        >
          <Workflow size={12} className="shrink-0 text-muted-foreground" />
          <span className="font-mono text-xs truncate" title={worker.worker_id}>
            {worker.worker_id}
          </span>
          {worker.status && (
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              {worker.status}
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
