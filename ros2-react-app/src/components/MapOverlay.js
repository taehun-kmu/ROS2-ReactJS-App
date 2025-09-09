import React, { useEffect, useRef, useState } from "react";
import "../App.css";
import ROSLIB from "roslib";
import { getSharedRos, useRosConnection } from "../ros/rosConnection";
import { detectOccupancyGridTopic } from "../ros/detectTopic";

export default function MapOverlay({ open, onClose }) {
  const canvasRef = useRef(null);
  const { status: rosStatus } = useRosConnection();
  const [topicInfo, setTopicInfo] = useState({ name: "", type: "" });
  const [fps, setFps] = useState(0);

  useEffect(() => {
    if (!open) return;

    const ros = getSharedRos({ reuseExisting: true });
    let topic = null;
    let rafId = 0;
    let pendingMsg = null; // keep only most recent frame
    let imageData = null; // reused ImageData buffer
    let lastW = 0;
    let lastH = 0;
    let sampleCount = 0;
    let sampleStart = performance.now();
    let lastStyleW = 0;
    let lastStyleH = 0;

    function mapValueToGray(v) {
      // nav_msgs/OccupancyGrid semantics:
      // -1 unknown, 0 free, 100 occupied, 1..99 probability
      if (v === -1) return 205; // unknown = light gray
      if (v <= 0) return 255; // free = white
      if (v >= 100) return 0; // occupied = black
      // grayscale mapping for 1..99 (invert so higher occupancy is darker)
      return 255 - Math.round((v / 100) * 255);
    }

    function ensureImageData(ctx, w, h) {
      if (!imageData || w !== lastW || h !== lastH) {
        imageData = ctx.createImageData(w, h);
        lastW = w;
        lastH = h;
        // Also size the canvas backing store to the grid dimensions
        const canvas = ctx.canvas;
        canvas.width = w;
        canvas.height = h;
      }
      return imageData;
    }

    function sizeCanvasDisplay() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const container = canvas.parentElement;
      if (!container || !lastW || !lastH) return;
      // Use content box size (clientWidth/Height include padding; subtract it)
      let cw = container.clientWidth || 0;
      let ch = container.clientHeight || 0;
      try {
        const cs = window.getComputedStyle(container);
        const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
        const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
        cw = Math.max(0, cw - padX);
        ch = Math.max(0, ch - padY);
      } catch (_e) {
        // ignore; fall back to raw client sizes
      }
      if (!cw || !ch) return;
      const scale = Math.min(cw / lastW, ch / lastH);
      const styleW = Math.max(1, Math.floor(lastW * scale));
      const styleH = Math.max(1, Math.floor(lastH * scale));
      if (styleW !== lastStyleW || styleH !== lastStyleH) {
        canvas.style.width = `${styleW}px`;
        canvas.style.height = `${styleH}px`;
        lastStyleW = styleW;
        lastStyleH = styleH;
      }
    }

    function drawLatest() {
      rafId = 0;
      const msg = pendingMsg;
      pendingMsg = null;
      if (!msg) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d", { willReadFrequently: false });
      if (!ctx) return;

      const width = msg.info?.width || 0;
      const height = msg.info?.height || 0;
      const data = msg.data || [];
      if (!width || !height || data.length !== width * height) return;

      const id = ensureImageData(ctx, width, height);
      const buf = id.data; // Uint8ClampedArray, length = w*h*4

      // Y-axis flip for display: ROS data is row-major from bottom to top.
      // We map (x,y) to (x, height-1-y) on the canvas.
      let dstIdx = 0;
      for (let y = 0; y < height; y++) {
        const flippedY = height - 1 - y;
        const rowSrc = y * width;
        const rowDst = flippedY * width * 4;
        for (let x = 0; x < width; x++) {
          const v = data[rowSrc + x];
          const gray = mapValueToGray(typeof v === "number" ? v : -1);
          dstIdx = rowDst + x * 4;
          buf[dstIdx] = gray; // R
          buf[dstIdx + 1] = gray; // G
          buf[dstIdx + 2] = gray; // B
          buf[dstIdx + 3] = 255; // A
        }
      }

      ctx.putImageData(id, 0, 0);
      // Ensure the displayed size fills the container while preserving aspect ratio
      sizeCanvasDisplay();

      // FPS sampling — count rendered frames over ~1 second window
      sampleCount += 1;
      const now = performance.now();
      const elapsed = now - sampleStart;
      if (elapsed >= 1000) {
        const nextFps = (sampleCount * 1000) / (elapsed || 1);
        setFps(Number.isFinite(nextFps) ? Math.round(nextFps * 10) / 10 : 0);
        sampleCount = 0;
        sampleStart = now;
      }
    }

    async function start() {
      try {
        setTopicInfo({ name: "(detecting)", type: "" });
        const detected = await detectOccupancyGridTopic(ros);
        if (!detected) {
          // No topic found within timeout; keep overlay open but no draw
          setTopicInfo({ name: "(not found)", type: "" });
          return;
        }
        setTopicInfo({ name: detected.name, type: detected.type });
        topic = new ROSLIB.Topic({
          ros,
          name: detected.name,
          messageType: detected.type,
        });
        topic.subscribe((msg) => {
          // Keep only the newest frame; render on next animation frame
          pendingMsg = msg;
          if (!rafId) {
            rafId = window.requestAnimationFrame(drawLatest);
          }
        });
      } catch (_e) {
        // Ignore detection errors for now (UI for errors is a later task)
      }
    }

    start();
    window.addEventListener("resize", sizeCanvasDisplay);
    // Note: We rely on window resize for now; container padding and max sizes keep aspect nicely.

    return () => {
      window.removeEventListener("resize", sizeCanvasDisplay);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (topic) {
        try { topic.unsubscribe(); } catch (_e) {}
        topic = null;
      }
      pendingMsg = null;
      imageData = null;
      setFps(0);
      setTopicInfo((prev) => prev.name || prev.type ? { name: prev.name, type: prev.type } : { name: "", type: "" });
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="map-overlay-root" role="dialog" aria-modal="true">
      <div className="map-overlay-header">
        <div className="map-overlay-title">Map Overlay</div>
        <div className="map-overlay-meta" aria-live="polite">
          <span className={`status-dot ${rosStatus === "connected" ? "ok" : "bad"}`} title={`ROS ${rosStatus}`}></span>
          <span className="meta-item" title="ROS connection status">{rosStatus}</span>
          <span className="meta-sep">|</span>
          <span className="meta-item" title="Detected topic">
            Topic: {topicInfo.name || "(n/a)"}
          </span>
          {topicInfo.type ? (
            <span className="meta-item" title="Message type">({topicInfo.type})</span>
          ) : null}
          <span className="meta-sep">|</span>
          <span className="meta-item" title="Approximate frames per second">FPS: {fps.toFixed(1)}</span>
        </div>
        <button className="map-overlay-close" onClick={onClose} aria-label="Close overlay">
          ✕
        </button>
      </div>
      <div className="map-overlay-body">
        <div className="map-canvas-container">
          <canvas ref={canvasRef} className="map-canvas" aria-label="OccupancyGrid canvas" />
        </div>
      </div>
    </div>
  );
}
