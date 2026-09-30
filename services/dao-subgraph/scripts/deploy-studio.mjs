import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { requireValue } from './validation.mjs';
const STUDIO = 'https://api.studio.thegraph.com/deploy/';
export function deploymentOptions(env, fallbackKey) {
  const slug = env.GRAPH_STUDIO_SLUG || 'mythical-dao-pilot';
  const label = env.GRAPH_VERSION || 'v0.1.0';
  requireValue(/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug), 'INVALID_STUDIO_SLUG');
  requireValue(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/.test(label), 'INVALID_VERSION');
  requireValue(env.GRAPH_STUDIO_CREATED === slug, 'DEDICATED_STUDIO_SUBGRAPH_REQUIRED');
  const key = env.GRAPH_DEPLOY_KEY || fallbackKey;
  requireValue(typeof key === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{19,127}$/.test(key), 'STUDIO_DEPLOY_KEY_REQUIRED');
  return { key, args: [slug, '--node', STUDIO, '--version-label', label] };
}
export async function main() {
  const authFile = `${homedir()}/.graph-cli.json`;
  const fallbackKey = !process.env.GRAPH_DEPLOY_KEY && existsSync(authFile)
    ? JSON.parse(readFileSync(authFile, 'utf8'))[STUDIO] : undefined;
  const { key, args } = deploymentOptions(process.env, fallbackKey);
  delete process.env.GRAPH_DEPLOY_KEY;
  process.chdir(fileURLToPath(new URL('..', import.meta.url)));
  // Invoke the pinned CLI in-process: no key in OS argv, no overwrite of global auth.
  // This endpoint only deploys a Studio version; it cannot publish on-chain.
  const { default: DeployCommand } = await import('../node_modules/@graphprotocol/graph-cli/dist/commands/deploy.js');
  for (const stream of [process.stdout, process.stderr]) {
    const original = stream.write.bind(stream);
    stream.write = (chunk, ...rest) => original((typeof chunk === 'string' ? chunk : chunk.toString()).replaceAll(key, '[redacted]'), ...rest);
  }
  try {
    await DeployCommand.run([...args, '--deploy-key', key], fileURLToPath(new URL('../node_modules/@graphprotocol/graph-cli', import.meta.url)));
  } catch (error) {
    console.error(String(error?.message || 'STUDIO_DEPLOY_FAILED').replaceAll(key, '[redacted]').slice(0,1000));
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
