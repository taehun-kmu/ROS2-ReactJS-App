// Topic detection utilities for ROSLIB.Ros
// - Uses ros.getTopicType to probe candidate topics
// - Returns the first topic (in order) matching the desired message type
// - Enforces an overall timeout to avoid hanging if rosapi is unavailable

/**
 * Get the ROS message type for a given topic name via ros.getTopicType.
 * Resolves with a string like "nav_msgs/OccupancyGrid" or rejects on error.
 * @param {import('roslib').Ros} ros
 * @param {string} topicName
 * @returns {Promise<string>}
 */
export function getTopicType(ros, topicName) {
  return new Promise((resolve, reject) => {
    try {
      ros.getTopicType(
        topicName,
        (type) => {
          if (typeof type === "string" && type.length > 0) {
            resolve(type);
          } else {
            reject(new Error("Empty type response"));
          }
        },
        (message) => {
          reject(new Error(typeof message === "string" ? message : "Unknown error"));
        }
      );
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Get all topic names that match a given message type.
 * Accepts ROS1 or ROS2 type string.
 * @param {import('roslib').Ros} ros
 * @param {string} typeName
 * @returns {Promise<string[]>}
 */
export function getTopicsForType(ros, typeName) {
  return new Promise((resolve, reject) => {
    try {
      ros.getTopicsForType(
        typeName,
        (topics) => {
          if (Array.isArray(topics)) resolve(topics);
          else resolve([]);
        },
        (message) => reject(new Error(typeof message === "string" ? message : "Unknown error"))
      );
    } catch (e) {
      reject(e);
    }
  });
}

function withTimeout(promise, ms, label = "operation") {
  if (!(ms > 0)) return promise; // no timeout
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/**
 * Detect the first candidate topic that matches the expected type.
 * The candidates are tried in order and the search stops on the first match.
 * Returns null within the timeout if none match.
 *
 * @param {import('roslib').Ros} ros
 * @param {Object} [options]
 * @param {string[]} [options.candidates]
 * @param {string} [options.typeName]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ name: string, type: string } | null>}
 */
export async function detectOccupancyGridTopic(
  ros,
  {
    candidates = ["/rtabmap/map", "/map", "/rtabmap/grid_map", "/rtabmap/proj_map"],
    typeName = "nav_msgs/OccupancyGrid",
    timeoutMs = 5000,
  } = {}
) {
  if (!ros) throw new Error("detectOccupancyGridTopic: ros instance is required");
  const deadline = Date.now() + (timeoutMs || 0);

  // Normalize ROS2 type strings like "nav_msgs/msg/OccupancyGrid" to ROS1-style for comparison
  const normalizeType = (s) => (typeof s === "string" ? s.replace("/msg/", "/") : s);

  for (const name of candidates) {
    const remaining = Math.max(0, deadline - Date.now());
    if (remaining === 0) return null;
    try {
      const type = await withTimeout(getTopicType(ros, name), remaining, `getTopicType(${name})`);
      if (type === typeName || normalizeType(type) === typeName) {
        return { name, type };
      }
      // Non-matching type, continue
    } catch (_e) {
      // Ignore errors for non-existent topics or rosapi unavailability; continue until timeout/deadline.
    }
  }

  // Fallback: query available topics by type (both ROS1 and ROS2-like type strings)
  const remaining = Math.max(0, deadline - Date.now());
  if (remaining === 0) return null;
  try {
    const [ros1Topics, ros2Topics] = await Promise.all([
      withTimeout(getTopicsForType(ros, typeName), remaining, `getTopicsForType(${typeName})`),
      withTimeout(getTopicsForType(ros, `nav_msgs/msg/OccupancyGrid`), remaining, `getTopicsForType(nav_msgs/msg/OccupancyGrid)`),
    ]);
    const all = Array.from(new Set([...(ros1Topics || []), ...(ros2Topics || [])]));
    if (all.length > 0) {
      const preferred = candidates.find((c) => all.includes(c));
      const name = preferred || all[0];
      return { name, type: `nav_msgs/msg/OccupancyGrid` };
    }
  } catch (_e) {
    // ignore and return null
  }

  return null;
}

/**
 * Convenience helper to detect a topic of a specific type.
 * @param {import('roslib').Ros} ros
 * @param {string[]} candidates
 * @param {string} typeName
 * @param {number} timeoutMs
 * @returns {Promise<{ name: string, type: string } | null>}
 */
export async function detectTopicByType(ros, candidates, typeName, timeoutMs = 3000) {
  return detectOccupancyGridTopic(ros, { candidates, typeName, timeoutMs });
}

// Example usage:
// import { getSharedRos } from "./rosConnection";
// import { detectOccupancyGridTopic } from "./detectTopic";
// const ros = getSharedRos();
// const result = await detectOccupancyGridTopic(ros);
// if (result) {
//   console.log("Detected:", result.name, result.type);
// } else {
//   console.log("No OccupancyGrid topic found");
// }
