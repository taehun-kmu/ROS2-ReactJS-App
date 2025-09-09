const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');

const app = express();
const port = 3001;

app.use(cors());

// Guarded ROS environment sourcing (no-op if files are missing)
const rosEnv = `if [ -f /opt/ros/humble/setup.bash ]; then source /opt/ros/humble/setup.bash; fi; if [ -f "$HOME/ros2_ws/install/setup.bash" ]; then source "$HOME/ros2_ws/install/setup.bash"; fi;`;

const runCommand = (command, res) => {
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return res.status(500).json({ error: 'Failed to run command', detail: error.message, stderr });
    }
    if (stderr) {
      // Do not fail on stderr alone; keep logs for visibility
      console.warn(`stderr: ${stderr}`);
    }
    console.log(`stdout: ${stdout}`);
    res.json({ message: 'Command executed successfully', stdout, stderr });
  });
};

app.post('/run-remote-mode', (req, res) => {
  const command = `bash -lc '${rosEnv} echo "Running Remote Mode"'`;
  runCommand(command, res);
});

app.post('/run-create-map', (req, res) => {
  const command = `bash -lc '${rosEnv} echo "Creating Map"'`;
  runCommand(command, res);
});

app.post('/run-slam-nav', (req, res) => {
  const command = `bash -lc 'set -e; ${rosEnv} /opt/ros/humble/bin/ros2 run yolov5_ros2 yolov5_node'`;
  runCommand(command, res);
});

app.post('/run-map-nav', (req, res) => {
  const command = `bash -lc '${rosEnv} echo "Running Map Navigation"'`;
  runCommand(command, res);
});

app.post('/stop-slam-nav', (req, res) => {
  const command = `bash -lc '${rosEnv} echo "Stopping SLAM/NAV"'`;
  runCommand(command, res);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
