// Reusable ROS connection manager with bounded exponential backoff.
// - Reuses a shared ROSLIB.Ros instance when available
// - Emits basic console logs for connection lifecycle
// - Auto-reconnects on unexpected close with capped backoff

import { useEffect, useMemo, useState } from "react";
import ROSLIB from "roslib";

const DEFAULT_URL = "ws://localhost:9090";
const MAX_BACKOFF_MS = 8000; // cap backoff
const INITIAL_BACKOFF_MS = 500;

// Module-scoped singleton and state
let sharedRos = null; // ROSLIB.Ros | null
let reconnectTimer = null; // number | null
let backoffMs = INITIAL_BACKOFF_MS;
let explicitClose = false;
let currentUrl = DEFAULT_URL;

// Attach lifecycle logs and auto-reconnect once per instance
function attachLifecycleHandlers(ros) {
  if (ros.__handlersAttached) return; // guard
  ros.__handlersAttached = true;

  ros.on("connection", () => {
    console.log("[ros] Connected to websocket server.");
    // reset backoff after a successful connection
    backoffMs = INITIAL_BACKOFF_MS;
  });

  ros.on("error", (error) => {
    console.log("[ros] Error connecting to websocket server:", error);
  });

  ros.on("close", () => {
    console.log("[ros] Connection to websocket server closed.");
    if (explicitClose) {
      // Do not attempt reconnect if closed explicitly
      return;
    }
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return; // already scheduled
  const delay = Math.min(backoffMs, MAX_BACKOFF_MS);
  console.log(`[ros] Scheduling reconnect in ${delay}ms...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    tryReconnect();
  }, delay);
  // exponential backoff increase for next attempt
  backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
}

function tryReconnect() {
  if (!sharedRos) return;
  if (explicitClose) return;
  try {
    console.log(`[ros] Reconnecting to ${currentUrl}...`);
    // roslib supports connect(url) to (re)open the ws
    sharedRos.connect(currentUrl);
  } catch (e) {
    console.log("[ros] Reconnect attempt failed to start:", e);
    scheduleReconnect();
  }
}

export function getSharedRos(options = {}) {
  const { url = DEFAULT_URL, reuseExisting = true } = options;
  currentUrl = url || DEFAULT_URL;

  // Reuse global if present
  if (reuseExisting) {
    const globalAny = typeof window !== "undefined" ? window : {};
    if (globalAny.__sharedRos instanceof ROSLIB.Ros) {
      sharedRos = globalAny.__sharedRos;
    }
  }

  if (!sharedRos) {
    explicitClose = false;
    sharedRos = new ROSLIB.Ros({ url: currentUrl });
    attachLifecycleHandlers(sharedRos);
    // Expose globally for optional reuse
    if (typeof window !== "undefined") {
      window.__sharedRos = sharedRos;
    }
  } else {
    // Ensure handlers are attached even if instance existed
    attachLifecycleHandlers(sharedRos);
    // If not connected, attempt to connect (handles dev StrictMode remounts)
    try {
      if (!sharedRos.isConnected) {
        sharedRos.connect(currentUrl);
      }
    } catch (_e) {
      // ignore, will trigger reconnect logic on close
    }
  }

  return sharedRos;
}

export function closeSharedRos() {
  if (!sharedRos) return;
  explicitClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try {
    sharedRos.close();
  } catch (_e) {
    // ignore
  }
}

export function useRosConnection(url = DEFAULT_URL) {
  const [status, setStatus] = useState("connecting"); // connecting | connected | disconnected | error
  const [lastError, setLastError] = useState(null);

  // Stable ros instance
  const ros = useMemo(() => getSharedRos({ url, reuseExisting: true }), [url]);

  useEffect(() => {
    function onConnection() {
      setStatus("connected");
      setLastError(null);
    }
    function onError(err) {
      setStatus("error");
      setLastError(err || new Error("Unknown ROS connection error"));
    }
    function onClose() {
      setStatus("disconnected");
    }

    ros.on("connection", onConnection);
    ros.on("error", onError);
    ros.on("close", onClose);

    // If already connected, reflect it
    if (ros.isConnected) {
      setStatus("connected");
    }

    return () => {
      // Remove only our listeners; do not close here because other components may still use it.
      try { ros.off("connection", onConnection); } catch (_e) {}
      try { ros.off("error", onError); } catch (_e) {}
      try { ros.off("close", onClose); } catch (_e) {}
    };
  }, [ros]);

  return { ros, status, error: lastError };
}

