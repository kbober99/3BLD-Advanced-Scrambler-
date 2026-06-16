// BLD Scramble Generator — Web Worker
// Receives: { type: 'init', pyFiles, initCode, customStickers }
//           { type: 'generate', n, filtersJson, parityJson, advJson, timeoutMs }
// Posts:    { type: 'ready' }
//           { type: 'result', scrambles: [...], attempts: N }
//           { type: 'error', message }

importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');

let pyodide = null;

async function init(pyFiles, initCode, customStickers) {
  pyodide = await loadPyodide();
  for (const [name, src] of Object.entries(pyFiles)) {
    pyodide.FS.writeFile(name, src, { encoding: 'utf8' });
  }
  await pyodide.runPythonAsync(`import sys; sys.path.insert(0, '.')`);
  await pyodide.runPythonAsync(initCode);
  if (customStickers) {
    const schemeJson = JSON.stringify(customStickers).replace(/'/g, "\\'");
    await pyodide.runPythonAsync(`
import json as _json
_CUSTOM_STICKERS = _json.loads('${schemeJson}')
`);
  }
  self.postMessage({ type: 'ready' });
}

async function generate(n, filtersJson, parityJson, advJson, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const results = [];
  let attempts = 0;

  // Run in chunks to allow timeout checks
  const CHUNK = 200;
  while (results.length < n && Date.now() < deadline) {
    const remaining = n - results.length;
    const toFind = Math.min(remaining, CHUNK);
    try {
      const raw = await pyodide.runPythonAsync(
        `generate_chunk(${toFind}, '${filtersJson}', ${parityJson}, '${advJson}', ${CHUNK * 10})`
      );
      const data = JSON.parse(raw);
      results.push(...data.results);
      attempts += data.attempts;
    } catch(e) {
      self.postMessage({ type: 'error', message: e.message });
      return;
    }
  }

  self.postMessage({ type: 'result', scrambles: results, attempts });
}

self.onmessage = async (e) => {
  const { type } = e.data;
  if (type === 'init') {
    await init(e.data.pyFiles, e.data.initCode, e.data.customStickers);
  } else if (type === 'generate') {
    await generate(e.data.n, e.data.filtersJson, e.data.parityJson, e.data.advJson, e.data.timeoutMs);
  }
};
