import { runTest } from "./scripts/test-client.js";
import { exposePort, getOrCreateToken, getOrCreateDomain, createReservedDomain, createDomain } from "./src/tunnel/ngrok.js";
import { getEnv } from "./src/utils/env.js";

export { exposePort, getOrCreateToken, getOrCreateDomain, createReservedDomain, createDomain, getEnv };
export default exposePort;

if (process.argv[1]?.endsWith("test-client.js")) {
  runTest();
}
