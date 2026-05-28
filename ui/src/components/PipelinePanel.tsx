//
// Copyright (c) 2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useMemo } from "react";
import { useStore } from "../state.store";
import { Processor } from "../types";
import { ChildrenMap, ProcessorNode } from "./ProcessorNode";

export function PipelinePanel() {
  const activeWorkerId = useStore((s) => s.activeWorkerId);
  const worker = useStore((s) =>
    activeWorkerId ? s.workers[activeWorkerId] : undefined
  );
  const selectedProcessor = useStore((s) => s.selectedProcessor);
  const setSelectedProcessor = useStore((s) => s.setSelectedProcessorById);
  const setSelectedJob = useStore((s) => s.setSelectedJob);
  const setKeyboardFocus = useStore((s) => s.setKeyboardFocus);

  const processorChildrenMap = useMemo<ChildrenMap>(() => {
    const m: ChildrenMap = new Map();
    if (!worker) return m;
    for (const p of worker.topology.processors) {
      const list = m.get(p.parent) ?? [];
      list.push(p);
      m.set(p.parent, list);
    }
    return m;
  }, [worker]);

  // DFS-flattened processor list for arrow-key nav.
  const flatProcessors = useMemo<Processor[]>(() => {
    const list: Processor[] = [];
    if (!worker) return list;
    const visit = (pid: string) => {
      const p = worker.processors[pid];
      if (!p) return;
      list.push(p);
      for (const c of processorChildrenMap.get(pid) ?? []) visit(c.id);
    };
    for (const root of processorChildrenMap.get(null) ?? []) visit(root.id);
    return list;
  }, [worker, processorChildrenMap]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (!worker || flatProcessors.length === 0) return;

    const idx = selectedProcessor
      ? flatProcessors.findIndex((p) => p.id === selectedProcessor.id)
      : -1;

    if (idx < 0) {
      // No current selection — first arrow press picks an end.
      e.preventDefault();
      const first =
        e.key === "ArrowDown"
          ? flatProcessors[0]
          : flatProcessors[flatProcessors.length - 1];
      setSelectedProcessor(first.id);
      setSelectedJob(undefined);
      return;
    }

    let nextIdx = idx;
    if (e.key === "ArrowDown" && idx < flatProcessors.length - 1)
      nextIdx = idx + 1;
    if (e.key === "ArrowUp" && idx > 0) nextIdx = idx - 1;
    if (nextIdx === idx) return;

    e.preventDefault();
    setSelectedProcessor(flatProcessors[nextIdx].id);
    setSelectedJob(undefined);
  };

  if (!worker) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground px-3 text-center">
        Select a worker.
      </div>
    );
  }

  const procRoots = processorChildrenMap.get(null) ?? [];

  return (
    // Plain ``overflow-y-auto`` div instead of Radix ScrollArea —
    // Radix's Viewport uses ``display: table`` internally, which lets
    // rows grow past the viewport width and defeats the ``truncate`` on
    // the processor name (pushing the activity arrows out of view).
    <div
      className="h-full overflow-y-auto overflow-x-hidden py-1"
      onKeyDown={handleKeyDown}
      onFocus={() => setKeyboardFocus("pipeline")}
    >
      {procRoots.map((p) => (
        <ProcessorNode
          key={p.id}
          workerId={worker.worker_id}
          processor={p}
          depth={0}
          childrenMap={processorChildrenMap}
        />
      ))}
    </div>
  );
}
