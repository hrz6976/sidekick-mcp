import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const source = path.join(repoRoot, 'dist', 'sidekick.mjs');
const skillDir = process.env.SIDEKICK_ENSEMBLE_SKILL_DIR
  ?? path.join(os.homedir(), '.agents', 'skills', 'ensemble');
const targetDir = path.join(skillDir, 'bin');
const target = path.join(targetDir, 'sidekick.mjs');

statSync(source);
mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);
console.log(`Copied ${source} -> ${target}`);
