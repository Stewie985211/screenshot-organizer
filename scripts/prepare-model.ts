import { LocalRuntime } from '../src/main/runtime.js';
import { resolveProjectRoot, ensureProjectDirectories } from '../src/main/paths.js';
const root = resolveProjectRoot(); ensureProjectDirectories(root);
const runtime = new LocalRuntime(root, progress => console.log(JSON.stringify(progress)));
runtime.prepare().then(status => console.log(JSON.stringify(status))).catch(error => { console.error(error);process.exitCode=1; }).finally(() => runtime.stop());
