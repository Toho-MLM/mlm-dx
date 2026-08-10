import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const workerRoot = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = `${workerRoot}/src`;
const violations = [];

async function typescriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? typescriptFiles(path) : entry.name.endsWith('.ts') ? [path] : [];
  }));
  return nested.flat();
}

for (const absolutePath of await typescriptFiles(sourceRoot)) {
  const path = absolutePath.slice(workerRoot.length + 1);
  const source = await readFile(absolutePath, 'utf8');
  const isDomainOrApplication = /\/features\/[^/]+\/(?:domain|application)\//.test(absolutePath);
  const isInfrastructure = /\/features\/[^/]+\/infrastructure\//.test(absolutePath);

  if (isDomainOrApplication && /from ['"](?:hono|@cloudflare\/workers-types)['"]/.test(source)) {
    violations.push(`${path}: domain/applicationからHonoまたはCloudflare型を参照できません`);
  }
  if (isDomainOrApplication && /from ['"][^'"]*(?:infrastructure|routes|utils)[^'"]*['"]/.test(source)) {
    violations.push(`${path}: domain/applicationからinfrastructure・routes・utilsを参照できません`);
  }
  if (!isInfrastructure && /\.prepare\s*\(|\.batch\s*\(/.test(source)) {
    violations.push(`${path}: SQL/D1 batchはfeatures/*/infrastructureへ移してください`);
  }
  if (/\/routes\//.test(absolutePath) && /from ['"]\.\/(?!\.\.\/)[^'"]+['"]/.test(source)) {
    violations.push(`${path}: route同士をimportせずapplication portを使ってください`);
  }
}

if (violations.length) {
  violations.forEach((violation) => console.error(violation));
  process.exitCode = 1;
} else {
  console.log('Worker clean architecture boundaries are valid.');
}
