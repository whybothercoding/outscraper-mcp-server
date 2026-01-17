import { loadOpenApi, operationToTool } from './openapi.js';

const doc = await loadOpenApi('outscraper-api-docs.json');

let operations = 0;
const names = new Map<string, number>();

for (const [path, methods] of Object.entries(doc.paths ?? {})) {
  for (const [method, op] of Object.entries(methods ?? {})) {
    operations += 1;
    const tool = operationToTool(doc, { path, method: method.toUpperCase(), op });
    names.set(tool.name, (names.get(tool.name) ?? 0) + 1);
  }
}

const duplicates = [...names.entries()].filter(([, c]) => c > 1);

console.log(JSON.stringify({
  operations,
  uniqueToolNames: names.size,
  duplicateToolNames: duplicates.length,
  sampleTools: [...names.keys()].slice(0, 20),
}, null, 2));

if (operations !== names.size || duplicates.length) {
  throw new Error(`Tool generation mismatch: operations=${operations} unique=${names.size} duplicates=${duplicates.length}`);
}
