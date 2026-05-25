//
// Copyright (c) 2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useMemo } from "react";
import { useStore } from "../state.store";
import { ScrollArea } from "./ui/scroll-area";
import { WorkerNode, WorkersByParent } from "./WorkerNode";

export function WorkerTree() {
  const workerOrder = useStore((s) => s.workerOrder);
  const workers = useStore((s) => s.workers);
  const activeWorkerId = useStore((s) => s.activeWorkerId);
  const setActiveWorker = useStore((s) => s.setActiveWorker);
  const setKeyboardFocus = useStore((s) => s.setKeyboardFocus);

  // Build a parent → [child worker ids] map; preserves the order workers
  // were added under each parent.
  const workersByParent = useMemo<WorkersByParent>(() => {
    const m: WorkersByParent = new Map();
    for (const id of workerOrder) {
      const w = workers[id];
      if (!w) continue;
      const key = w.parent ?? null;
      const list = m.get(key) ?? [];
      list.push(id);
      m.set(key, list);
    }
    return m;
  }, [workerOrder, workers]);

  // DFS-flattened worker list (no jobs — those live in their own panel
  // now) for arrow-key navigation.
  const flatWorkers = useMemo<string[]>(() => {
    const ids: string[] = [];
    const visit = (id: string) => {
      ids.push(id);
      for (const child of workersByParent.get(id) ?? []) visit(child);
    };
    for (const id of workersByParent.get(null) ?? []) visit(id);
    return ids;
  }, [workersByParent]);

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

  const rootIds = workersByParent.get(null) ?? [];

  if (workerOrder.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">No workers yet.</div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div
        className="py-1"
        onKeyDown={handleKeyDown}
        onFocus={() => setKeyboardFocus("workers")}
      >
        {rootIds.map((id) => (
          <WorkerNode
            key={id}
            workerId={id}
            depth={0}
            workersByParent={workersByParent}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
