//
// Copyright (c) 2025-2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { create } from "zustand";
import {
  BusMessage,
  Connection,
  FrameMessage,
  Job,
  JobStatus,
  Processor,
  SnapshotMessage,
  Topology,
  Versions,
  WorkerAddedMessage,
  WorkerDescriptor,
  WorkerRemovedMessage,
} from "./types";

type Theme = "light" | "dark";

export type Worker = {
  worker_id: string;
  added_at: number;
  topology: Topology;
  processors: Record<string, Processor>;
  frames: Record<string, FrameMessage[]>;
  framePaths: Record<string, Processor[]>;
  status?: string;
  parent?: string | null;
  runner?: string | null;
  started_at?: number | null;
  bridged?: boolean | null;
  active?: boolean | null;
};

const MAX_BUS_MESSAGES = 1000;

// Stable empty references so selectors don't trigger re-renders on every call.
export const EMPTY_PROCESSORS: Record<string, Processor> = Object.freeze(
  {}
) as Record<string, Processor>;
export const EMPTY_CONNECTIONS: Connection[] = Object.freeze(
  []
) as Connection[];
export const EMPTY_FRAMES: Record<string, FrameMessage[]> = Object.freeze(
  {}
) as Record<string, FrameMessage[]>;
const EMPTY_FRAME_PATHS: Record<string, Processor[]> = Object.freeze(
  {}
) as Record<string, Processor[]>;

function workerFromDescriptor(desc: WorkerDescriptor): Worker {
  const processors: Record<string, Processor> = {};
  for (const p of desc.topology.processors) processors[p.id] = p;
  return {
    worker_id: desc.worker_id,
    added_at: desc.added_at,
    topology: desc.topology,
    processors,
    frames: {},
    framePaths: {},
    parent: desc.parent ?? null,
  };
}

type State = {
  theme: Theme;
  setTheme: (t: Theme) => void;

  wsUrl: string;
  setWsUrl: (u: string) => void;

  connected: boolean;
  setConnected: (c: boolean) => void;

  // Multi-worker model.
  workers: Record<string, Worker>;
  workerOrder: string[];
  activeWorkerId?: string;

  versions?: Versions;
  protocol?: string;

  busMessages: BusMessage[];

  // Derived from BusJob* bus messages — request seeds the entry,
  // response/cancel updates status + completed_at.
  jobs: Record<string, Job>;

  // Selections track the active worker; cleared when the active worker changes.
  selectedProcessor?: Processor;
  selectedFrame?: FrameMessage;
  selectedFramePath?: FrameMessage;
  selectedJob?: Job;

  showPush: boolean;
  showProcess: boolean;
  setShowPush: (v: boolean) => void;
  setShowProcess: (v: boolean) => void;

  // Last panel the user focused. Drives selection styling so the user
  // can tell which selection arrow keys will move — the focused panel's
  // selection paints solid; the others fade to muted gray.
  keyboardFocus: "workers" | "pipeline" | "jobs" | "frames" | "path" | null;
  setKeyboardFocus: (
    v: "workers" | "pipeline" | "jobs" | "frames" | "path" | null
  ) => void;

  applySnapshot: (m: SnapshotMessage) => void;
  addWorker: (m: WorkerAddedMessage) => void;
  removeWorker: (m: WorkerRemovedMessage) => void;
  pushFrames: (frames: FrameMessage[]) => void;
  pushBusMessages: (events: BusMessage[]) => void;

  setActiveWorker: (id?: string) => void;
  resetSession: () => void;

  setSelectedProcessorById: (id?: string) => void;
  setSelectedFrame: (f?: FrameMessage) => void;
  setSelectedFramePath: (f?: FrameMessage) => void;
  setSelectedJob: (j?: Job) => void;
};

export const useStore = create<State>((set, get) => ({
  theme:
    (document.documentElement.getAttribute("data-theme") as Theme) ?? "light",
  setTheme: (t) => {
    document.documentElement.setAttribute("data-theme", t);
    set({ theme: t });
  },

  wsUrl: localStorage.getItem("wsUrl") || "ws://localhost:9090",
  setWsUrl: (u) => {
    localStorage.setItem("wsUrl", u);
    set({ wsUrl: u });
  },

  connected: false,
  setConnected: (c) => set({ connected: c }),

  workers: {},
  workerOrder: [],
  activeWorkerId: undefined,

  versions: undefined,
  protocol: undefined,
  busMessages: [],
  jobs: {},

  selectedProcessor: undefined,
  selectedFrame: undefined,
  selectedFramePath: undefined,
  selectedJob: undefined,

  showPush: true,
  showProcess: true,
  setShowPush: (v) => set({ showPush: v }),
  setShowProcess: (v) => set({ showProcess: v }),

  keyboardFocus: null,
  setKeyboardFocus: (v) => set({ keyboardFocus: v }),

  applySnapshot: (m) => {
    const workers: Record<string, Worker> = {};
    const workerOrder: string[] = [];
    for (const desc of m.workers) {
      workers[desc.worker_id] = workerFromDescriptor(desc);
      workerOrder.push(desc.worker_id);
    }
    set({
      workers,
      workerOrder,
      activeWorkerId: workerOrder[0],
      versions: m.server,
      protocol: m.protocol,
      busMessages: [],
      jobs: {},
      selectedProcessor: undefined,
      selectedFrame: undefined,
      selectedFramePath: undefined,
    });
  },

  addWorker: (m) => {
    set((s) => {
      if (s.workers[m.worker_id]) return s;
      const w = workerFromDescriptor({
        worker_id: m.worker_id,
        added_at: m.added_at,
        topology: m.topology,
        parent: m.parent,
      });
      return {
        workers: { ...s.workers, [m.worker_id]: w },
        workerOrder: [...s.workerOrder, m.worker_id],
        activeWorkerId: s.activeWorkerId ?? m.worker_id,
      };
    });
  },

  removeWorker: (m) => {
    set((s) => {
      if (!s.workers[m.worker_id]) return s;
      const { [m.worker_id]: _, ...rest } = s.workers;
      const order = s.workerOrder.filter((id) => id !== m.worker_id);
      const becameActiveless = s.activeWorkerId === m.worker_id;
      return {
        workers: rest,
        workerOrder: order,
        activeWorkerId: becameActiveless ? order[0] : s.activeWorkerId,
        // If the active worker went away, drop selections that referenced it.
        selectedProcessor: becameActiveless ? undefined : s.selectedProcessor,
        selectedFrame: becameActiveless ? undefined : s.selectedFrame,
        selectedFramePath: becameActiveless ? undefined : s.selectedFramePath,
      };
    });
  },

  pushFrames: (messages) => {
    set((s) => {
      const workers = { ...s.workers };
      for (const f of messages) {
        const w = workers[f.worker_id];
        if (!w) continue;

        const frames = { ...w.frames };
        const framePaths = { ...w.framePaths };

        const listFrames = frames[f.from] || [];
        frames[f.from] = [f, ...listFrames];

        const listProcessors = framePaths[f.name] || [];
        const proc = w.processors[f.from];
        if (proc && !listProcessors.some((p) => p.id === proc.id)) {
          framePaths[f.name] = [proc, ...listProcessors];
        } else {
          framePaths[f.name] = listProcessors;
        }

        workers[f.worker_id] = { ...w, frames, framePaths };
      }
      return { workers };
    });
  },

  pushBusMessages: (events) => {
    set((s) => {
      const merged = s.busMessages.concat(events);
      const trimmed =
        merged.length > MAX_BUS_MESSAGES
          ? merged.slice(merged.length - MAX_BUS_MESSAGES)
          : merged;

      // Derive worker status from lifecycle bus messages. The server
      // doesn't push a separate ``worker_status`` event anymore — when
      // we can read the same information off the bus, we do.
      //
      // ``BusWorkerReadyMessage`` also rides along ``runner`` /
      // ``started_at`` / ``bridged`` / ``active`` in its ``data`` payload;
      // copy those over too so the Worker details pane has them.
      let workers = s.workers;
      let workersChanged = false;
      const updateWorker = (
        id: string,
        patch: Partial<Worker>
      ) => {
        const existing = workers[id];
        if (!existing) return;
        if (!workersChanged) {
          workers = { ...workers };
          workersChanged = true;
        }
        workers[id] = { ...existing, ...patch };
      };
      for (const e of events) {
        const mt = e.message_type;
        const data = (e.data ?? {}) as Record<string, unknown>;
        const source = e.source_worker ?? null;
        const target = e.target_worker ?? null;
        if (mt === "BusWorkerReadyMessage" && source) {
          const patch: Partial<Worker> = { status: "ready" };
          if (typeof data.runner === "string") patch.runner = data.runner;
          if (typeof data.started_at === "number")
            patch.started_at = data.started_at;
          if (typeof data.bridged === "boolean") patch.bridged = data.bridged;
          if (typeof data.active === "boolean") patch.active = data.active;
          updateWorker(source, patch);
        } else if (mt === "BusActivateWorkerMessage" && target) {
          updateWorker(target, { status: "active" });
        } else if (mt === "BusDeactivateWorkerMessage" && target) {
          updateWorker(target, { status: "inactive" });
        } else if (mt === "BusEndWorkerMessage" && target) {
          updateWorker(target, { status: "ended" });
        } else if (mt === "BusCancelWorkerMessage" && target) {
          updateWorker(target, { status: "cancelled" });
        } else if (
          (mt === "BusWorkerErrorMessage" ||
            mt === "BusWorkerLocalErrorMessage") &&
          source
        ) {
          updateWorker(source, { status: "errored" });
        }
      }

      // Replay BusJob* messages to keep the derived ``jobs`` map current.
      // Any BusJob* with a job_id seeds (or updates) the entry — the
      // server may have started before whisker connected, so we can't
      // rely on always seeing the original Request first.
      let jobs = s.jobs;
      let jobsChanged = false;
      const ensureChanged = () => {
        if (!jobsChanged) {
          jobs = { ...jobs };
          jobsChanged = true;
        }
      };
      for (const e of events) {
        const mt = e.message_type;
        if (!mt.startsWith("BusJob")) continue;
        const data = (e.data ?? {}) as Record<string, unknown>;
        const jobId = data.job_id as string | undefined;
        if (!jobId) continue;

        const existing = jobs[jobId];
        const target = e.target_worker ?? null;
        const source = e.source_worker ?? null;

        if (mt === "BusJobRequestMessage") {
          ensureChanged();
          if (existing) {
            if (target && !existing.targets.includes(target)) {
              jobs[jobId] = {
                ...existing,
                targets: [...existing.targets, target],
              };
            }
          } else {
            jobs[jobId] = {
              job_id: jobId,
              job_name: (data.job_name as string | undefined) ?? null,
              source: source ?? "?",
              targets: target ? [target] : [],
              status: "running",
              started_at: e.timestamp,
              completed_at: null,
            };
          }
        } else if (
          mt === "BusJobResponseMessage" ||
          mt === "BusJobResponseUrgentMessage"
        ) {
          ensureChanged();
          const raw = data.status as string | undefined;
          const status: JobStatus =
            raw === "completed" ||
            raw === "cancelled" ||
            raw === "failed" ||
            raw === "error"
              ? raw
              : "completed";
          if (existing) {
            jobs[jobId] = { ...existing, status, completed_at: e.timestamp };
          } else {
            // Late-seen response — synthesize a stub. ``source`` of a
            // response is the *doer*; the requester is the response's
            // ``target``.
            jobs[jobId] = {
              job_id: jobId,
              job_name: (data.job_name as string | undefined) ?? null,
              source: target ?? "?",
              targets: source ? [source] : [],
              status,
              started_at: e.timestamp,
              completed_at: e.timestamp,
            };
          }
        } else if (mt === "BusJobCancelMessage") {
          ensureChanged();
          if (existing) {
            jobs[jobId] = {
              ...existing,
              status: "cancelled",
              completed_at: e.timestamp,
            };
          } else {
            jobs[jobId] = {
              job_id: jobId,
              job_name: null,
              source: source ?? "?",
              targets: target ? [target] : [],
              status: "cancelled",
              started_at: e.timestamp,
              completed_at: e.timestamp,
            };
          }
        } else if (!existing) {
          // Any other BusJob* (update / stream / etc.) without a prior
          // entry — record a stub so the job at least appears.
          ensureChanged();
          jobs[jobId] = {
            job_id: jobId,
            job_name: (data.job_name as string | undefined) ?? null,
            source: source ?? "?",
            targets: target ? [target] : [],
            status: "running",
            started_at: e.timestamp,
            completed_at: null,
          };
        }
      }

      const patch: Partial<State> = { busMessages: trimmed };
      if (jobsChanged) patch.jobs = jobs;
      if (workersChanged) patch.workers = workers;
      return patch;
    });
  },

  setActiveWorker: (id) =>
    set({
      activeWorkerId: id,
      selectedProcessor: undefined,
      selectedFrame: undefined,
      selectedFramePath: undefined,
      selectedJob: undefined,
    }),

  resetSession: () => {
    set({
      workers: {},
      workerOrder: [],
      activeWorkerId: undefined,
      versions: undefined,
      protocol: undefined,
      busMessages: [],
      jobs: {},
      selectedProcessor: undefined,
      selectedFrame: undefined,
      selectedFramePath: undefined,
      selectedJob: undefined,
    });
  },

  setSelectedProcessorById: (id) => {
    const { activeWorkerId, workers } = get();
    const worker = activeWorkerId ? workers[activeWorkerId] : undefined;
    set({
      selectedProcessor: id && worker ? worker.processors[id] : undefined,
    });
  },

  setSelectedFrame: (f) => set({ selectedFrame: f }),
  setSelectedFramePath: (f) => set({ selectedFramePath: f }),
  setSelectedJob: (j) => set({ selectedJob: j }),
}));

// Selectors for the active worker's data. Components should use these instead
// of reaching into `state.workers` directly so that switching the active
// worker re-targets every panel in one step.

export const selectActiveWorker = (s: State): Worker | undefined =>
  s.activeWorkerId ? s.workers[s.activeWorkerId] : undefined;

export const selectProcessors = (s: State): Record<string, Processor> =>
  selectActiveWorker(s)?.processors ?? EMPTY_PROCESSORS;

export const selectConnections = (s: State): Connection[] =>
  selectActiveWorker(s)?.topology.connections ?? EMPTY_CONNECTIONS;

export const selectFrames = (s: State): Record<string, FrameMessage[]> =>
  selectActiveWorker(s)?.frames ?? EMPTY_FRAMES;

export const selectFramePaths = (s: State): Record<string, Processor[]> =>
  selectActiveWorker(s)?.framePaths ?? EMPTY_FRAME_PATHS;
