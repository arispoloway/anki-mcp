import { setConfig } from "../src/config.js";
import { testConfig } from "./fixtures.js";

// Inject test config before any other module reads it
setConfig(testConfig);
