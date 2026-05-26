//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
import { useEffect, useMemo, useRef } from "react";
import {
  EMPTY_CONNECTIONS,
  EMPTY_FRAMES,
  EMPTY_PROCESSORS,
  useStore,
} from "../state.store";

// Dagre layout options - extending BaseLayoutOptions with dagre-specific options
interface DagreLayoutOptions extends cytoscape.BaseLayoutOptions {
  name: "dagre";
  fit?: boolean;
  padding?: number;
  spacingFactor?: number;
  nodeDimensionsIncludeLabels?: boolean;
  rankDir?: "TB" | "BT" | "LR" | "RL";
  rankSep?: number;
  nodeSep?: number;
  edgeSep?: number;
  minlen?: number;
}

const layoutOptions: DagreLayoutOptions = {
  name: "dagre",
  nodeDimensionsIncludeLabels: true, // Ensures labels are considered in layout
  fit: false,
  padding: 30,
  spacingFactor: 1.0,
  minlen: 10,
  rankDir: "TB", // Top to Bottom
  rankSep: 50, // Separation between ranks
  nodeSep: 25, // Separation between nodes in the same rank
  edgeSep: 25, // Separation between edges
};

cytoscape.use(dagre);

type PipelineProps = {
  /** Worker whose pipeline to render. Falls back to the active worker. */
  workerId?: string;
};

export function Pipeline({ workerId }: PipelineProps = {}) {
  const theme = useStore((s) => s.theme);
  const activeWorkerId = useStore((s) => s.activeWorkerId);
  const targetId = workerId ?? activeWorkerId;

  const processors = useStore((s) =>
    targetId && s.workers[targetId]
      ? s.workers[targetId].processors
      : EMPTY_PROCESSORS
  );
  const connections = useStore((s) =>
    targetId && s.workers[targetId]
      ? s.workers[targetId].topology.connections
      : EMPTY_CONNECTIONS
  );
  const frames = useStore((s) =>
    targetId && s.workers[targetId]
      ? s.workers[targetId].frames
      : EMPTY_FRAMES
  );

  const selectedProcessor = useStore((s) => s.selectedProcessor);
  const setSelectedProcessor = useStore((s) => s.setSelectedProcessorById);
  const setSelectedFrame = useStore((s) => s.setSelectedFrame);
  const setSelectedFramePath = useStore((s) => s.setSelectedFramePath);

  const cyRef = useRef<cytoscape.Core | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const elements = useMemo(() => {
    const ps = Object.values(processors).map((p) => ({
      data: { id: p.id, label: p.name, parent: p.parent },
    }));
    const cs = connections.map((c) => ({
      data: { source: c.from, target: c.to, id: c.from + "->" + c.to },
    }));
    return [...ps, ...cs];
  }, [processors, connections]);

  // See if processor selectiono was done elsewhere.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.$("node").unselect(); // clear previous selection
    if (selectedProcessor) {
      const node = cy.$id(selectedProcessor.id);
      if (node) {
        node.select();
      }
    }
  }, [selectedProcessor]);

  // Re-layout when the target worker changes — cytoscape diffs node/edge
  // sets but won't run dagre again on its own, so the new topology would
  // render on top of the previous worker's positions.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    // Reset traffic-flash bookkeeping; the next worker's frame counts are
    // unrelated to the previous worker's.
    frameCountsRef.current = {};
    flashingRef.current.clear();
    const layout = cy.layout(layoutOptions);
    layout.run();
  }, [targetId]);

  // Watch the wrapping div for size changes (e.g. user dragging the
  // PipelineGraphDialog's resize handle) and tell cytoscape to recompute
  // its viewport. Two important details:
  //   1. We *don't* call ``cy.fit()`` here — re-fitting on every resize
  //      tick continuously shifts where each node lives relative to the
  //      cursor, which feels like the cursor is drifting away from
  //      whatever you're trying to click while you drag the handle.
  //   2. ``cy.resize()`` is deferred to the next animation frame so it
  //      reads the post-layout bounding rect rather than a half-applied
  //      one — without the rAF gate the renderer's cached container
  //      rect lags one frame behind the DOM during the resize, and
  //      pointer events hit the wrong screen→model position.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let pending = 0;
    const observer = new ResizeObserver(() => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        cyRef.current?.resize();
      });
    });
    observer.observe(el);
    return () => {
      if (pending) cancelAnimationFrame(pending);
      observer.disconnect();
    };
  }, []);

  // Flash processors that get traffic
  const FLASH_DURATION_MS = 150;
  const frameCountsRef = useRef<Record<string, number>>({});
  const flashingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    Object.entries(frames).forEach(([pid, list]) => {
      const prev = frameCountsRef.current[pid] || 0;
      const curr = list?.length || 0;
      frameCountsRef.current[pid] = curr;

      if (curr <= prev) return;
      if (flashingRef.current.has(pid)) return;

      const el = cy.$(`#${CSS.escape(pid)}`);
      el.addClass("flash");
      flashingRef.current.add(pid);
      setTimeout(() => {
        el.removeClass("flash");
        flashingRef.current.delete(pid);
      }, FLASH_DURATION_MS);
    });
  }, [frames]);

  const stylesheet: cytoscape.StylesheetJson = [
    {
      selector: "node",
      style: {
        shape: "roundrectangle",
        label: "data(label)",
        color: "white",
        "text-valign": "center",
        "text-halign": "center",
        "font-size": 12,
        "background-color": theme === "dark" ? "#3d4451" : "#718096",
        "border-color": theme === "dark" ? "#5a6270" : "#4A5568",
        width: 250,
        height: 75,
        "border-width": 1,
      },
    },
    {
      selector: "node.flash",
      style: {
        "background-color": theme === "dark" ? "#a8a3fc" : "#4f46e5", // indigo flash
      },
    },
    {
      selector: "node:selected",
      style: {
        "border-width": 2,
        "background-color": theme === "dark" ? "#a8a3fc" : "#4f46e5",
      },
    },
    {
      selector: "edge",
      style: {
        "curve-style": "bezier",
        width: 2,
        "target-arrow-shape": "triangle",
      },
    },
  ];

  return (
    <div ref={containerRef} className="w-full h-full">
      <CytoscapeComponent
        cy={(cy) => {
          cyRef.current = cy;
          cy.on("tap", "node", (evt) => {
            setSelectedProcessor(evt.target.id());
            setSelectedFrame(undefined);
            setSelectedFramePath(undefined);
          });
          cy.on("tap", (evt) => {
            if (evt.target === cy) {
              setSelectedProcessor(undefined);
              setSelectedFrame(undefined);
              setSelectedFramePath(undefined);
            }
          });
          const layout = cy.layout(layoutOptions);
          layout.run();
        }}
        elements={elements}
        style={{ width: "100%", height: "100%" }}
        stylesheet={stylesheet}
        autoungrabify
        userPanningEnabled
        minZoom={0.5}
        maxZoom={1.5}
      />
    </div>
  );
}
