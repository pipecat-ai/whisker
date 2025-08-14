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

const layoutOptions: cytoscape.LayoutOptions = {
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

export function Graph() {
  const processors = useStore((s) => s.processors);
  const connections = useStore((s) => s.connections);
  const selectedProcessor = useStore((s) => s.selectedProcessor);
  const setSelectedProcessor = useStore((s) => s.setSelectedProcessorById);
  const setSelectedFrame = useStore((s) => s.setSelectedFrame);
  const setSelectedFramePath = useStore((s) => s.setSelectedFramePath);
  const frames = useStore((s) => s.frames);

  const prevRef = useRef<Record<string, number>>({});

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
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const flash = (id: string) => {
      const el = cy.$(`#${CSS.escape(id)}`);
      el.removeClass("flash"); // reset if still there
      el.addClass("flash");
      setTimeout(() => el.removeClass("flash"), 100); // fade back
    };

    // Flash only if frames increased
    Object.entries(frames).forEach(([pid, list]) => {
      const prev = prevRef.current[pid] || 0;
      const curr = list?.length || 0;
      if (curr > prev) flash(pid);
      prevRef.current[pid] = curr;
    });
  }, [frames]);

  const stylesheet: cytoscape.Stylesheet[] = [
    {
      selector: "node",
      style: {
        shape: "roundrectangle",
        label: "data(label)",
        color: "white",
        "text-valign": "center",
        "text-halign": "center",
        "font-size": 12,
        "background-color": "#718096",
        width: 250,
        height: 75,
        "border-width": 1,
      },
    },
    {
      selector: "node.flash",
      style: {
        "transition-property": "background-color",
        "transition-duration": "0.12s",
        "background-color": "#38B2AC", // teal flash
      },
    },
    {
      selector: "node:selected",
      style: {
        "border-width": 2,
        "background-color": "#3182CE",
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
      elements={elements as any}
      style={{ width: "100%", height: "100%" }}
      stylesheet={stylesheet as any}
    />
  );
}
