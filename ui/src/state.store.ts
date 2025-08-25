//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { create } from "zustand";
import { Connection, FrameMessage, PipelineMessage, Processor } from "./types";

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

  frames: Record<string, FrameMessage[]>;
  framePaths: Record<number, Processor[]>;

  setPipeline: (pipeline: PipelineMessage) => void;
  pushFrames: (frames: FrameMessage[]) => void;

  selectedProcessor?: Processor;
  setSelectedProcessorById: (id?: string) => void;

  selectedFrame?: FrameMessage;
  setSelectedFrame: (f?: FrameMessage) => void;

  selectedFramePath?: FrameMessage;
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
  frames: {},
  framePaths: {},

  setPipeline: (pipeline) => {
    const processors = {};
    for (const p of pipeline.processors) {
      processors[p.id] = p;
    }

    set({
      frames: {},
      framePaths: {},
      selectedFrame: undefined,
      selectedFramePath: undefined,
      selectedProcessor: undefined,
      processors: processors,
      connections: pipeline.connections,
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

  selectedProcessor: undefined,
  setSelectedProcessorById: (id) =>
    set((state) => ({
      selectedProcessor: id ? state.processors[id] : undefined,
    })),

  selectedFrame: undefined,
  setSelectedFrame: (f) => set({ selectedFrame: f }),

  selectedFramePath: undefined,
  setSelectedFramePath: (f) => set({ selectedFramePath: f }),
}));
