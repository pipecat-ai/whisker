//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useRef } from "react";
import { useStore } from "./state.store";
import { useWhisker } from "./hooks.useWhisker";

export function usePipecatSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const setConnected = useStore((s) => s.setConnected);
  const { loadMessages } = useWhisker();
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
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      loadMessages(ev.data);
    };
  };

  return { connect, disconnect };
}
