import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { requireValue } from './validation.mjs';
// Deployment to Studio only. This command cannot publish a subgraph on-chain.
const slug = process.env.GRAPH_STUDIO_SLUG || 'mythical-dao-pilot';
const label = process.env.GRAPH_VERSION || 'v0.1.0';
requireValue(/^[a-z0-9-]{3,60}$/.test(slug), 'INVALID_STUDIO_SLUG');
requireValue(/^[a-zA-Z0-9._-]{1,40}$/.test(label), 'INVALID_VERSION');
requireValue(process.env.GRAPH_STUDIO_CREATED === slug, 'Create the dedicated pilot in Studio, then set GRAPH_STUDIO_CREATED to its slug.');
const authFile = `${homedir()}/.graph-cli.json`;
requireValue(existsSync(authFile) && !!JSON.parse(readFileSync(authFile, 'utf8'))['https://api.studio.thegraph.com/deploy/'],
  'Authenticate the Graph CLI with the Studio deploy key first. Never put it in source control or command arguments.');
const result = spawnSync(process.execPath, ['node_modules/@graphprotocol/graph-cli/bin/run.js', 'deploy', slug,
  '--node', 'https://api.studio.thegraph.com/deploy/', '--version-label', label],
  { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit' });
process.exitCode = result.status ?? 1;
