//
// Copyright (c) 2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useState } from "react";
import { ChevronDown, ChevronRight, Globe, Workflow } from "lucide-react";
import { useStore } from "../state.store";
import { cn } from "@/lib/utils";

export type WorkersByParent = Map<string | null, string[]>;

type Props = {
  workerId: string;
  depth: number;
  workersByParent: WorkersByParent;
  /**
   * Whether the worker belongs to a remote runner. Drives the icon and
   * muted styling. Workers on a local runner — even ones without an
   * observer (e.g. the WhiskerSink itself, which is a BaseWorker, not a
   * PipelineWorker, so it never gets a ``worker_added``) — render as
   * a regular Workflow node.
   */
  remote: boolean;
};

export function WorkerNode({
  workerId,
  depth,
  workersByParent,
  remote,
}: Props) {
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
  const Icon = remote ? Globe : Workflow;

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
            // Remote workers (no local observer) read as muted; the
            // pipeline / frames / frame-path panes can't show anything
            // useful for them, but you can still select to see their
            // identity and runner in the Details pane.
            remote && "text-muted-foreground"
          )}
        >
          <Icon size={12} className="shrink-0 text-muted-foreground" />
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
            remote={remote}
          />
        ))}
    </div>
  );
}
