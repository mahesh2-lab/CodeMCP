import net from "node:net";

/**
 * Checks if a TCP port is currently available.
 *
 * @param {number} port - Port to check
 * @returns {Promise<boolean>}
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port);
  });
}

/**
 * Finds the first available port starting from startPort.
 * If startPort is free, returns it immediately.
 * If occupied, scans candidate ports incrementally.
 *
 * @param {number|string} [startPort=4173] - Preferred port (default 4173)
 * @param {number} [maxAttempts=50] - Maximum number of ports to probe
 * @returns {Promise<number>}
 */
export async function findAvailablePort(startPort = 4173, maxAttempts = 50) {
  let port = parseInt(startPort, 10) || 4173;
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = port + i;
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }
  return port;
}

export default findAvailablePort;
