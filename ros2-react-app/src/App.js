import React, { useState, useEffect } from 'react';
// ROS connection is managed via a reusable module with auto-reconnect.
import { useRosConnection } from './ros/rosConnection';
import './App.css';
import remoteControlImg from './remote-control.png';
import settingsImg from './settings.png';
import mapNavImg from './mapnav.png';
import mapImg from './map.png';
import MapOverlay from './components/MapOverlay';
import { isFeatureEnabled, setFeatureFlag } from './featureFlags';

function App() {
  // Connection status is derived from the reusable connection hook
  const { status: rosStatus } = useRosConnection('ws://localhost:9090');
  const connected = rosStatus === 'connected';
  // Note: Keep UI state separate from ROS connection logic.
  const [busyCommand, setBusyCommand] = useState(null);
  const [lastMessage, setLastMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [mapOverlayEnabled, setMapOverlayEnabled] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    // Register unload handler for backend stop command
    window.addEventListener('beforeunload', stopSlamNav);
    return () => {
      window.removeEventListener('beforeunload', stopSlamNav);
    };
  }, []);

  useEffect(() => {
    // Initialize feature flag state from storage
    const enabled = isFeatureEnabled("mapOverlay");
    setMapOverlayEnabled(enabled);
    setOverlayOpen(enabled ? true : false);
  }, []);

  const runCommand = (command) => {
    setBusyCommand(command);
    setLastMessage("");
    setErrorMessage("");
    fetch(`http://localhost:3001/${command}`, {
      method: "POST",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        console.log(data.message);
        setLastMessage(data.message || "Command executed successfully");
      })
      .catch((error) => {
        console.error("Error:", error);
        setErrorMessage(`Failed to run: ${command}`);
      })
      .finally(() => setBusyCommand(null));
  };

  const stopSlamNav = () => {
    fetch("http://localhost:3001/stop-slam-nav", {
      method: "POST",
    })
      .then((response) => response.json())
      .then((data) => console.log(data.message))
      .catch((error) => console.error("Error stopping node:", error));
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>KICK ROBOTICS</h1>
        <p className="sub-title">UI App for AirqBot</p>
        <p className="connection-status">Connection status: {connected ? "Connected" : "Disconnected"}</p>
        {(lastMessage || errorMessage) && (
          <div className={`status-message ${errorMessage ? "error" : "success"}`}>
            {errorMessage || lastMessage}
          </div>
        )}
      </header>
      <div className="button-grid">
        <div className="button-wrapper">
          <img src={remoteControlImg} alt="Remote Control" className="button-icon" />
          <button
            className="robot-button"
            disabled={!!busyCommand}
            onClick={() => runCommand("run-remote-mode")}
          >
            {busyCommand ? "Running..." : "Remote Mode"}
          </button>
        </div>
        <div className="button-wrapper">
          <img src={settingsImg} alt="Create Map" className="button-icon" />
          <button
            className="robot-button"
            disabled={!!busyCommand}
            onClick={() => runCommand("run-create-map")}
          >
            {busyCommand ? "Running..." : "Create Map"}
          </button>
        </div>
        <div className="button-wrapper">
          <img src={mapNavImg} alt="SLAM + NAV" className="button-icon" />
          <button
            className="robot-button"
            disabled={!!busyCommand}
            onClick={() => runCommand("run-slam-nav")}
          >
            {busyCommand ? "Running..." : "SLAM + NAV"}
          </button>
        </div>
        <div className="button-wrapper">
          <img src={mapImg} alt="MAP + NAV" className="button-icon" />
          <button
            className="robot-button"
            disabled={!!busyCommand}
            onClick={() => runCommand("run-map-nav")}
          >
            {busyCommand ? "Running..." : "MAP + NAV"}
          </button>
        </div>
      </div>
      {mapOverlayEnabled && (
        <MapOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} />
      )}
      <div className="feature-flag-toggle" aria-live="polite">
        <span>Map Overlay: {mapOverlayEnabled ? "ON" : "OFF"}</span>
        <button
          className="secondary"
          onClick={() => {
            const next = !mapOverlayEnabled;
            setFeatureFlag("mapOverlay", next);
            setMapOverlayEnabled(next);
            setOverlayOpen(next);
          }}
        >
          {mapOverlayEnabled ? "Disable" : "Enable"}
        </button>
        {mapOverlayEnabled && !overlayOpen && (
          <button onClick={() => setOverlayOpen(true)}>Open</button>
        )}
      </div>
    </div>
  );
}

export default App;
