//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useRef } from "react";
import { useStore } from "./state.store";
import { ServerMessage } from "./types";

export function usePipecatSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const setConnected = useStore((s) => s.setConnected);
  const setPipeline = useStore((s) => s.setPipeline);
  const pushFrames = useStore((s) => s.pushFrames);
  const url = useStore((s) => s.wsUrl);

  // Disconnect helper
  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  // Connect helper
  const connect = () => {
    disconnect();
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const frameMessages = [];
        const lines = (ev.data as string).split(/\r?\n/);
        for (const line of lines) {
          if (!line.trim()) continue; // skip empty
          const msg = JSON.parse(line) as ServerMessage;
          if (msg.type === "pipeline") {
            // We only need one message
            setPipeline(msg);
          } else if (msg.type === "frame") {
            frameMessages.push(msg);
          }
        }
        pushFrames(frameMessages);
      } catch (err) {
        console.error("Error parsing incoming messages:", err);
      }
    };
  };

  return { connect, disconnect };
}
