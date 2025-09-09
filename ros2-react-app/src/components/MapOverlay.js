import React from "react";
import "../App.css";

export default function MapOverlay({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="map-overlay-root" role="dialog" aria-modal="true">
      <div className="map-overlay-header">
        <div className="map-overlay-title">Map Overlay (placeholder)</div>
        <button className="map-overlay-close" onClick={onClose} aria-label="Close overlay">
          ✕
        </button>
      </div>
      <div className="map-overlay-body">
        <div className="map-overlay-placeholder">
          OccupancyGrid preview will render here.
        </div>
      </div>
    </div>
  );
}

