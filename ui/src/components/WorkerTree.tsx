//
// Copyright (c) 2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Globe, House } from "lucide-react";
import { useStore } from "../state.store";
import { WorkerNode, WorkersByParent } from "./WorkerNode";

const UNASSIGNED = "__unassigned__";

export function WorkerTree() {
  const workerOrder = useStore((s) => s.workerOrder);
  const workers = useStore((s) => s.workers);
  const runners = useStore((s) => s.runners);
  const runnerOrder = useStore((s) => s.runnerOrder);
  const activeWorkerId = useStore((s) => s.activeWorkerId);
  const setActiveWorker = useStore((s) => s.setActiveWorker);
  const setKeyboardFocus = useStore((s) => s.setKeyboardFocus);

  // Workers we haven't yet placed under a runner (no ``BusWorkerReadyMessage``
  // for them yet) live in the synthetic ``UNASSIGNED`` bucket until their
  // runner arrives.
  const grouped = useMemo(() => {
    const byRunner = new Map<string, string[]>();
    for (const name of runnerOrder) byRunner.set(name, []);
    for (const id of workerOrder) {
      const w = workers[id];
      if (!w) continue;
      const key = w.runner ?? UNASSIGNED;
      const list = byRunner.get(key) ?? [];
      list.push(id);
      byRunner.set(key, list);
    }
    return byRunner;
  }, [workerOrder, workers, runnerOrder]);

  // Per-runner parent→[children] indexes for the recursive WorkerNode
  // render. Each runner only sees workers that belong to it.
  const workersByParentByRunner = useMemo(() => {
    const all = new Map<string, WorkersByParent>();
    for (const [runnerName, ids] of grouped.entries()) {
      const m: WorkersByParent = new Map();
      const localSet = new Set(ids);
      for (const id of ids) {
        const w = workers[id];
        if (!w) continue;
        const rawParent = w.parent ?? null;
        // If a worker's parent lives on a different runner (or doesn't
        // exist locally), treat it as a root of this runner's subtree.
        const key = rawParent && localSet.has(rawParent) ? rawParent : null;
        const list = m.get(key) ?? [];
        list.push(id);
        m.set(key, list);
      }
      all.set(runnerName, m);
    }
    return all;
  }, [grouped, workers]);

  // Flatten the visible tree (runners → roots → children) for arrow-key
  // navigation across the whole panel.
  const flatWorkers = useMemo<string[]>(() => {
    const ids: string[] = [];
    const visit = (id: string, byParent: WorkersByParent) => {
      ids.push(id);
      for (const child of byParent.get(id) ?? []) visit(child, byParent);
    };
    const groups: [string, WorkersByParent][] = [];
    for (const name of runnerOrder) {
      const byParent = workersByParentByRunner.get(name);
      if (byParent) groups.push([name, byParent]);
    }
    const unassigned = workersByParentByRunner.get(UNASSIGNED);
    if (unassigned) groups.push([UNASSIGNED, unassigned]);
    for (const [, byParent] of groups) {
      for (const rootId of byParent.get(null) ?? []) visit(rootId, byParent);
    }
    return ids;
  }, [runnerOrder, workersByParentByRunner]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (flatWorkers.length === 0) return;
    const idx = activeWorkerId ? flatWorkers.indexOf(activeWorkerId) : -1;
    if (idx < 0) return;
    let nextIdx = idx;
    if (e.key === "ArrowDown" && idx < flatWorkers.length - 1)
      nextIdx = idx + 1;
    if (e.key === "ArrowUp" && idx > 0) nextIdx = idx - 1;
    if (nextIdx === idx) return;
    e.preventDefault();
    setActiveWorker(flatWorkers[nextIdx]);
  };

  if (workerOrder.length === 0 && runnerOrder.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">No workers yet.</div>
    );
  }

  return (
    // Plain ``overflow-y-auto`` div instead of Radix ScrollArea —
    // Radix's Viewport uses ``display: table`` internally, which lets
    // rows grow past the viewport width and defeats the ``truncate`` on
    // worker / runner names.
    <div
      className="h-full overflow-y-auto overflow-x-hidden py-1"
      onKeyDown={handleKeyDown}
      onFocus={() => setKeyboardFocus("workers")}
    >
      {runnerOrder.map((name) => {
        const runner = runners[name];
        if (!runner) return null;
        const byParent = workersByParentByRunner.get(name);
        const rootIds = byParent?.get(null) ?? [];
        return (
          <RunnerSection
            key={name}
            runnerName={name}
            local={runner.local}
            rootIds={rootIds}
            workersByParent={byParent}
          />
        );
      })}
      <UnassignedSection
        workersByParent={workersByParentByRunner.get(UNASSIGNED)}
      />
    </div>
  );
}

type RunnerSectionProps = {
  runnerName: string;
  local: boolean;
  rootIds: string[];
  workersByParent: WorkersByParent | undefined;
};

function RunnerSection({
  runnerName,
  local,
  rootIds,
  workersByParent,
}: RunnerSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const Icon = local ? House : Globe;

  return (
    <div className="border-b last:border-b-0">
      <div className="group flex items-center mx-1 rounded-lg">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 p-0.5 -ml-1 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:outline-none"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <Chevron size={12} />
        </button>
        <div className="flex-1 flex items-center gap-2 px-1.5 py-1.5 min-w-0">
          <Icon
            size={12}
            className={
              local
                ? "shrink-0 text-foreground"
                : "shrink-0 text-muted-foreground"
            }
          />
          <span className="font-mono text-xs truncate" title={runnerName}>
            {runnerName}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            {local ? "local" : "remote"}
          </span>
        </div>
      </div>
      {expanded && workersByParent && (
        <div className="pb-1">
          {rootIds.map((id) => (
            <WorkerNode
              key={id}
              workerId={id}
              depth={1}
              workersByParent={workersByParent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UnassignedSection({
  workersByParent,
}: {
  workersByParent: WorkersByParent | undefined;
}) {
  if (!workersByParent) return null;
  const rootIds = workersByParent.get(null) ?? [];
  if (rootIds.length === 0) return null;
  return (
    <div className="border-b last:border-b-0">
      <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        (no runner yet)
      </div>
      {rootIds.map((id) => (
        <Fragment key={id}>
          <WorkerNode
            workerId={id}
            depth={1}
            workersByParent={workersByParent}
          />
        </Fragment>
      ))}
    </div>
  );
}
