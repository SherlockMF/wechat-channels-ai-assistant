import fs from "node:fs/promises";
import path from "node:path";

const target = path.resolve(
  import.meta.dirname,
  "..",
  "apps",
  "web",
  "lib",
  "data",
  "local-repository.ts",
);

let source = await fs.readFile(target, "utf8");

const beforeDeclarations = `let mutationQueue = Promise.resolve();
let cachedState: PersistedLocalState | null = null;`;
const afterDeclarations = `let mutationQueue = Promise.resolve();
let cachedState: PersistedLocalState | null = null;
let cachedDatabaseStamp: string | null = null;

async function databaseStamp(): Promise<string | null> {
  try {
    const stat = await fs.stat(databasePath);
    return \`\${stat.mtimeMs}:\${stat.size}\`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}`;

const beforeRead = `async function readState(): Promise<PersistedLocalState> {
  if (cachedState) return cachedState;
  const source = await buildLocalSourceState();`;
const afterRead = `async function readState(): Promise<PersistedLocalState> {
  const currentDatabaseStamp = await databaseStamp();
  if (cachedState && currentDatabaseStamp === cachedDatabaseStamp) {
    return cachedState;
  }
  const source = await buildLocalSourceState();`;

const beforePersistedReturn = `    if (persisted.sourceFingerprint === source.fingerprint) {
      cachedState = persisted;
      return cachedState;
    }`;
const afterPersistedReturn = `    if (persisted.sourceFingerprint === source.fingerprint) {
      cachedState = persisted;
      cachedDatabaseStamp = currentDatabaseStamp;
      return cachedState;
    }`;

const beforeRebuildReturn = `    cachedState = {
      ...source.state,
      jobs: preservedJobs,
      results: persisted.results.filter((result) =>
        preservedJobIds.has(result.analysisJobId),
      ),
      sourceFingerprint: source.fingerprint,
    };
    return cachedState;`;
const afterRebuildReturn = `    cachedState = {
      ...source.state,
      jobs: preservedJobs,
      results: persisted.results.filter((result) =>
        preservedJobIds.has(result.analysisJobId),
      ),
      sourceFingerprint: source.fingerprint,
    };
    cachedDatabaseStamp = currentDatabaseStamp;
    return cachedState;`;

const beforeMissingReturn = `    cachedState = {
      ...source.state,
      sourceFingerprint: source.fingerprint,
    };
    return cachedState;`;
const afterMissingReturn = `    cachedState = {
      ...source.state,
      sourceFingerprint: source.fingerprint,
    };
    cachedDatabaseStamp = null;
    return cachedState;`;

const beforeMutationEnd = `    await fs.rename(temporaryPath, databasePath);
    cachedState = state;`;
const afterMutationEnd = `    await fs.rename(temporaryPath, databasePath);
    cachedState = state;
    cachedDatabaseStamp = await databaseStamp();`;

const replacements = [
  [beforeDeclarations, afterDeclarations],
  [beforeRead, afterRead],
  [beforePersistedReturn, afterPersistedReturn],
  [beforeRebuildReturn, afterRebuildReturn],
  [beforeMissingReturn, afterMissingReturn],
  [beforeMutationEnd, afterMutationEnd],
];

for (const [before, after] of replacements) {
  if (source.includes(after)) continue;
  if (!source.includes(before)) throw new Error("找不到本地状态缓存补丁目标。");
  source = source.replace(before, after);
}

await fs.writeFile(target, source, "utf8");
console.log("Local state cache invalidation updated.");
