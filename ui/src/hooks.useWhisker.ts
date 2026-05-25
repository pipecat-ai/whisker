//
// Copyright (c) 2025-2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useStore } from "./state.store";
import { BusEventMessage, FrameMessage, ServerMessage } from "./types";
import { decodeMulti } from "@msgpack/msgpack";

export function useWhisker() {
  const applySnapshot = useStore((s) => s.applySnapshot);
  const addWorker = useStore((s) => s.addWorker);
  const removeWorker = useStore((s) => s.removeWorker);
  const setWorkerStatus = useStore((s) => s.setWorkerStatus);
  const pushFrames = useStore((s) => s.pushFrames);
  const pushBusEvents = useStore((s) => s.pushBusEvents);

  const frameBackground = (frame: { type: string; event: string }) => {
    if (frame.type === "frame:whisker") {
      return "rgba(255, 205, 50, 0.40)";
    } else if (frame.type === "frame:whisker-urgent") {
      return "rgba(249,115,22,0.40)";
    } else {
      return frame.event === "process"
        ? "rgba(16,185,129,0.15)"
        : "rgba(59,130,246,0.15)";
    }
  };

  const loadMessages = (data: ArrayBuffer | Uint8Array | null | undefined) => {
    if (!data) return;
    try {
      const frameBatch: FrameMessage[] = [];
      const busBatch: BusEventMessage[] = [];

      for (const decoded of decodeMulti(data)) {
        const msg = decoded as ServerMessage;
        switch (msg.type) {
          case "snapshot":
            applySnapshot(msg);
            break;
          case "worker_added":
            addWorker(msg);
            break;
          case "worker_removed":
            removeWorker(msg);
            break;
          case "worker_status":
            setWorkerStatus(msg);
            break;
          case "bus_event":
            busBatch.push(msg);
            break;
          case "frame":
          case "frame:whisker":
          case "frame:whisker-urgent":
            frameBatch.push(msg);
            break;
          default: {
            const unknown = msg as { type?: string };
            console.warn("Unknown Whisker message type:", unknown.type);
          }
        }
      }

      if (frameBatch.length > 0) pushFrames(frameBatch);
      if (busBatch.length > 0) pushBusEvents(busBatch);
    } catch (err) {
      console.error("Error decoding messages:", err);
    }
  };

  return { loadMessages, frameBackground };
}
