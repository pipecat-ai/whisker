//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { create } from "zustand";
import {
  Connection,
  FrameMessage,
  PipelineMessage,
  Processor,
  Versions,
} from "./types";

type Theme = "light" | "dark";

type State = {
  theme: Theme;
  setTheme: (t: Theme) => void;

  wsUrl: string;
  setWsUrl: (u: string) => void;

  connected: boolean;
  setConnected: (c: boolean) => void;

  processors: Record<string, Processor>;
  connections: Connection[];
  versions?: Versions;

  frames: Record<string, FrameMessage[]>;
  framePaths: Record<number, Processor[]>;

  selectedProcessor?: Processor;
  selectedFrame?: FrameMessage;
  selectedFramePath?: FrameMessage;

  resetPipeline: () => void;
  setPipeline: (pipeline: PipelineMessage) => void;
  pushFrames: (frames: FrameMessage[]) => void;

  setSelectedProcessorById: (id?: string) => void;
  setSelectedFrame: (f?: FrameMessage) => void;
  setSelectedFramePath: (f?: FrameMessage) => void;
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

  processors: {},
  connections: [],
  versions: undefined,

  frames: {},
  framePaths: {},

  selectedProcessor: undefined,
  selectedFrame: undefined,
  selectedFramePath: undefined,

  resetPipeline: () => {
    set({
      frames: {},
      framePaths: {},
      selectedFrame: undefined,
      selectedFramePath: undefined,
      selectedProcessor: undefined,
      processors: {},
      connections: [],
      versions: undefined,
    });
  },

  setPipeline: (pipeline) => {
    set((s) => {
      const processors = {};
      for (const p of pipeline.processors) {
        processors[p.id] = p;
      }

      s.resetPipeline();

      return {
        processors: processors,
        connections: pipeline.connections,
        versions: pipeline.versions,
      };
    });
  },

  pushFrames: (messages) => {
    set((s) => {
      const frames = { ...s.frames };
      const framePaths = { ...s.framePaths };

      for (const f of messages) {
        // Frames
        const listFrames = frames[f.from] || [];
        frames[f.from] = [f, ...listFrames];

        // Frame paths
        const listProcessors = framePaths[f.name] || [];
        const proc = s.processors[f.from];
        if (proc && !listProcessors.some((p) => p.id === proc.id)) {
          framePaths[f.name] = [proc, ...listProcessors];
        } else {
          framePaths[f.name] = listProcessors;
        }
      }

      return { frames, framePaths };
    });
  },

  setSelectedProcessorById: (id) =>
    set((state) => ({
      selectedProcessor: id ? state.processors[id] : undefined,
    })),

  setSelectedFrame: (f) => set({ selectedFrame: f }),

  setSelectedFramePath: (f) => set({ selectedFramePath: f }),
}));
