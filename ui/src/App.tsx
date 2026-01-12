//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { TopBar } from "./components/TopBar";
import { Pipeline } from "./components/Pipeline";
import { FrameInspector } from "./components/FrameInspector";
import { FramePath } from "./components/FramePath";
import { usePipecatSocket } from "./hooks.usePipecatSocket";
import { useStore } from "./state.store";

export default function App() {
  usePipecatSocket();
  const versions = useStore((s) => s.versions);
  const selectedProcessor = useStore((s) => s.selectedProcessor);
  const selectedFrame = useStore((s) => s.selectedFrame);

  return (
    <div className="app">
      <TopBar />
      <div className="layout">
        <div className="card">
          <h3>
            Pipeline{" "}
            {versions
              ? `(Whisker: ${versions.whisker}, Pipecat: ${versions.pipecat}, Python: ${versions.python}, Platform: ${versions.platform})`
              : ""}
          </h3>
          <div className="graph">
            <Pipeline />
          </div>
          <div className="footer-note mt-md">
            Tip: Click a processor node to inspect frames.
          </div>
        </div>
        <div className="card">
          <div className="card flex-2">
            <h3>
              Frames{" "}
              {selectedProcessor
                ? `(processor: ${selectedProcessor.name})`
                : ""}
            </h3>
            <FrameInspector />
          </div>
          <div className="card flex-1 mt-lg">
            <h3>
              Frame path {selectedFrame ? `(frame: ${selectedFrame.name})` : ""}
            </h3>
            <FramePath />
          </div>
          <div className="footer-note mt-md">
            Tip: Click a frame in the path and press{" "}
            <span className="kbd">Up</span> or <span className="kbd">Down</span>{" "}
            to move between processors.
          </div>
        </div>
      </div>
    </div>
  );
}
