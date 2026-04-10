//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
import { useEffect, useMemo, useRef } from "react";
import { useStore } from "../state.store";

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

export function Pipeline() {
  const theme = useStore((s) => s.theme);
  const processors = useStore((s) => s.processors);
  const connections = useStore((s) => s.connections);
  const selectedProcessor = useStore((s) => s.selectedProcessor);
  const setSelectedProcessor = useStore((s) => s.setSelectedProcessorById);
  const setSelectedFrame = useStore((s) => s.setSelectedFrame);
  const setSelectedFramePath = useStore((s) => s.setSelectedFramePath);
  const frames = useStore((s) => s.frames);

  const cyRef = useRef<cytoscape.Core | null>(null);

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
  );
}
