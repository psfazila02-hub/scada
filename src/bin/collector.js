#!/usr/bin/env node
import { createRegistry, runCollector } from '../application/runtime/index.js';

try { await runCollector({ registry: createRegistry() }); } catch (error) {
    process.stderr.write(`collector: ${error.name}\n`);
    process.exitCode = 1;
}
