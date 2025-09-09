import React, { useEffect, useRef } from "react";
import "../App.css";
import ROSLIB from "roslib";
import { getSharedRos } from "../ros/rosConnection";
import { detectOccupancyGridTopic } from "../ros/detectTopic";

export default function MapOverlay({ open, onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const ros = getSharedRos({ reuseExisting: true });
    let topic = null;
    let rafId = 0;
    let pendingMsg = null; // keep only most recent frame
    let imageData = null; // reused ImageData buffer
    let lastW = 0;
    let lastH = 0;

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
    }

    async function start() {
      try {
        const detected = await detectOccupancyGridTopic(ros);
        if (!detected) {
          // No topic found within timeout; keep overlay open but no draw
          return;
        }
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

    return () => {
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
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="map-overlay-root" role="dialog" aria-modal="true">
      <div className="map-overlay-header">
        <div className="map-overlay-title">Map Overlay</div>
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
