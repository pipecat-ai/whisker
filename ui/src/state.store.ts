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
  Runner,
  SnapshotMessage,
  Topology,
  Versions,
  WorkerAddedMessage,
  WorkerDescriptor,
} from "./types";

type Theme = "light" | "dark";

export type Worker = {
  worker_id: string;
  added_at: number;
  topology: Topology;
  processors: Record<string, Processor>;
  frames: Record<string, FrameMessage[]>;
  framePaths: Record<string, Processor[]>;
  // True when we have an observer for this worker (i.e. a ``worker_added``
  // brought us a topology descriptor). False for workers we only know
  // about through ``BusWorkerRegistryMessage`` — those are on a remote
  // runner and we can't expand their pipeline / frames / frame-path.
  observed: boolean;
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

const EMPTY_TOPOLOGY: Topology = Object.freeze({
  processors: [],
  connections: [],
}) as Topology;

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
    observed: true,
    parent: desc.parent ?? null,
  };
}

// Stub for a worker we only learned about through
// ``BusWorkerRegistryMessage`` — no observer, no topology, not
// expandable. Status / metadata may fill in as lifecycle bus messages
// flow in.
function placeholderWorker(
  worker_id: string,
  ts: number,
  parent: string | null,
  runner: string
): Worker {
  return {
    worker_id,
    added_at: ts,
    topology: EMPTY_TOPOLOGY,
    processors: {},
    frames: {},
    framePaths: {},
    observed: false,
    parent,
    runner,
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

  // Runners observed via the bus. Top-level grouping in the worker tree.
  runners: Record<string, Runner>;
  runnerOrder: string[];

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
  runners: {},
  runnerOrder: [],

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
      // Runners come from the bus; the snapshot only carries topology.
      runners: {},
      runnerOrder: [],
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
      const fresh = workerFromDescriptor({
        worker_id: m.worker_id,
        added_at: m.added_at,
        topology: m.topology,
        parent: m.parent,
      });
      const existing = s.workers[m.worker_id];
      if (existing) {
        // Already known — typical case: we'd seen the worker through a
        // ``BusWorkerRegistryMessage`` placeholder before its
        // ``worker_added`` arrived. Upgrade to a real observer entry,
        // preserving any status / runner / metadata already derived from
        // bus messages.
        return {
          workers: {
            ...s.workers,
            [m.worker_id]: {
              ...fresh,
              status: existing.status,
              runner: existing.runner,
              started_at: existing.started_at,
              bridged: existing.bridged,
              active: existing.active,
            },
          },
        };
      }
      return {
        workers: { ...s.workers, [m.worker_id]: fresh },
        workerOrder: [...s.workerOrder, m.worker_id],
        activeWorkerId: s.activeWorkerId ?? m.worker_id,
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

      // Derive worker state from lifecycle bus messages.
      //
      // ``BusWorkerRegistryMessage`` advertises a runner plus the list of
      // workers it manages — including remote workers we don't observe.
      // We register the runner, attach known worker ids, and stub
      // placeholder Worker entries for any we haven't seen yet so the
      // tree can show them.
      //
      // ``BusWorkerReadyMessage`` carries ``runner`` / ``started_at`` /
      // ``bridged`` / ``active`` inside ``data`` and also identifies the
      // owning runner for a worker — the second source of truth for
      // runner membership.
      //
      // The remaining lifecycle messages just update worker.status.
      let workers = s.workers;
      let workerOrder = s.workerOrder;
      let workersChanged = false;
      const ensureWorkersCopy = () => {
        if (!workersChanged) {
          workers = { ...workers };
          workerOrder = [...workerOrder];
          workersChanged = true;
        }
      };
      const updateWorker = (id: string, patch: Partial<Worker>) => {
        const existing = workers[id];
        if (!existing) return;
        ensureWorkersCopy();
        workers[id] = { ...existing, ...patch };
      };

      let runners = s.runners;
      let runnerOrder = s.runnerOrder;
      let runnersChanged = false;
      const ensureRunnersCopy = () => {
        if (!runnersChanged) {
          runners = { ...runners };
          runnerOrder = [...runnerOrder];
          runnersChanged = true;
        }
      };
      const ensureRunner = (name: string) => {
        if (runners[name]) return;
        ensureRunnersCopy();
        runners[name] = { name, worker_ids: [], local: false };
        runnerOrder.push(name);
      };
      const attachWorkerToRunner = (workerId: string, runnerName: string) => {
        ensureRunner(runnerName);
        const existing = runners[runnerName];
        if (existing.worker_ids.includes(workerId)) return;
        ensureRunnersCopy();
        runners[runnerName] = {
          ...existing,
          worker_ids: [...existing.worker_ids, workerId],
        };
      };
      const ensurePlaceholderWorker = (
        workerId: string,
        ts: number,
        parent: string | null,
        runnerName: string
      ) => {
        if (workers[workerId]) return;
        ensureWorkersCopy();
        workers[workerId] = placeholderWorker(workerId, ts, parent, runnerName);
        workerOrder.push(workerId);
      };

      for (const e of events) {
        const mt = e.message_type;
        const data = (e.data ?? {}) as Record<string, unknown>;
        const source = e.source_worker ?? null;
        const target = e.target_worker ?? null;

        if (mt === "BusWorkerRegistryMessage") {
          const runnerName = (data.runner as string | undefined) ?? null;
          if (!runnerName) continue;
          ensureRunner(runnerName);
          const entries = (data.workers as unknown[] | undefined) ?? [];
          for (const raw of entries) {
            const entry = raw as Record<string, unknown> | null | undefined;
            if (!entry) continue;
            const workerId =
              typeof entry.name === "string" ? entry.name : undefined;
            if (!workerId) continue;
            const parent =
              typeof entry.parent === "string" ? entry.parent : null;
            ensurePlaceholderWorker(workerId, e.timestamp, parent, runnerName);
            attachWorkerToRunner(workerId, runnerName);
            const w = workers[workerId];
            if (w && w.runner !== runnerName) {
              updateWorker(workerId, { runner: runnerName });
            }
          }
        } else if (mt === "BusWorkerReadyMessage" && source) {
          const patch: Partial<Worker> = { status: "ready" };
          let runnerName: string | undefined;
          if (typeof data.runner === "string") {
            runnerName = data.runner;
            patch.runner = data.runner;
          }
          if (typeof data.started_at === "number")
            patch.started_at = data.started_at;
          if (typeof data.bridged === "boolean") patch.bridged = data.bridged;
          if (typeof data.active === "boolean") patch.active = data.active;
          if (runnerName) {
            ensurePlaceholderWorker(source, e.timestamp, null, runnerName);
            attachWorkerToRunner(source, runnerName);
          }
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

      // A runner is "local" once we own an observer for any worker on
      // it. Recompute the flag whenever runners or workers changed in
      // this batch.
      if (workersChanged || runnersChanged) {
        const finalWorkers = workers;
        const finalRunners = runnersChanged ? runners : { ...runners };
        let anyLocalChanged = false;
        for (const name of runnerOrder) {
          const r = finalRunners[name];
          const local = r.worker_ids.some((id) => finalWorkers[id]?.observed);
          if (local !== r.local) {
            finalRunners[name] = { ...r, local };
            anyLocalChanged = true;
          }
        }
        if (anyLocalChanged) {
          runners = finalRunners;
          if (!runnersChanged) runnerOrder = [...runnerOrder];
          runnersChanged = true;
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
      if (workersChanged) {
        patch.workers = workers;
        patch.workerOrder = workerOrder;
      }
      if (runnersChanged) {
        patch.runners = runners;
        patch.runnerOrder = runnerOrder;
      }
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
      runners: {},
      runnerOrder: [],
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
