import fs from 'fs';
import path, { dirname } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

/** @typedef {{ type: string, name: string, ok: boolean, skipped?: boolean, referenceBackend?: string }} GalleryResult */

const here = dirname(fileURLToPath(import.meta.url));
const summaryPath = path.join(here, 'out', 'gallery', 'summary.json');
const outDir = path.join(here, 'out', 'audit-sheets');
const familyFilter = process.argv[2];

if (!familyFilter) fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const summary = /** @type {GalleryResult[]} */ (JSON.parse(fs.readFileSync(summaryPath, 'utf8')));
const allOkEntries = summary.filter(e => e.ok === true && !e.skipped);
const okEntries = familyFilter
  ? allOkEntries.filter(e => e.type === familyFilter)
  : allOkEntries;
if (familyFilter && okEntries.length === 0) {
  throw new Error(`No successful gallery entries for family "${familyFilter}".`);
}

console.log(`Total OK entries loaded from summary: ${okEntries.length}`);

// Group by family (type)
/** @type {Record<string, GalleryResult[]>} */
const groups = {};
for (const entry of okEntries) {
  if (!groups[entry.type]) {
    groups[entry.type] = [];
  }
  groups[entry.type].push(entry);
}

// Print and track verification
let totalPairsProcessed = 0;
const allSeenCases = new Set();
/** @type {Array<{ name: string, cases: string[] }>} */
const allSheets = [];

// Helper function to run magick with arguments array
/** @param {string[]} args */
function runMagick(args) {
  try {
    execFileSync('magick', args, { stdio: 'pipe' });
  } catch (error) {
    const err = /** @type {Error & { stderr?: Buffer }} */ (error);
    console.error(`Error running magick with args: ${args.join(' ')}`);
    console.error(err.stderr ? err.stderr.toString() : err.message);
    throw err;
  }
}

// Ensure temp directory exists
const tempDir = path.join(here, 'out', 'temp-sheets');
fs.rmSync(tempDir, { recursive: true, force: true });
fs.mkdirSync(tempDir, { recursive: true });

// Process each family
for (const [family, cases] of Object.entries(groups)) {
  console.log(`\nFamily: ${family} (${cases.length} cases)`);
  
  // Sort cases to have standard ordering
  cases.sort((a, b) => a.name.localeCompare(b.name));
  
  // Chunk cases into groups of at most 4
  const chunkSize = 4;
  const chunks = [];
  for (let i = 0; i < cases.length; i += chunkSize) {
    chunks.push(cases.slice(i, i + chunkSize));
  }
  
  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx];
    const sheetNum = String(chunkIdx + 1).padStart(2, '0');
    const sheetName = `${family}-${sheetNum}.png`;
    const sheetPath = path.join(outDir, sheetName);
    allSheets.push({ name: sheetName, cases: chunk.map(c => c.name) });
    
    console.log(`  Generating sheet ${sheetName} with ${chunk.length} cases:`);
    const rowPaths = [];
    
    // Generate Column Headers
    const col0HeaderPath = path.join(tempDir, `header_col0.png`);
    const col1HeaderPath = path.join(tempDir, `header_col1.png`);
    const col2HeaderPath = path.join(tempDir, `header_col2.png`);
    const headerRowPath = path.join(tempDir, `header_row.png`);
    
    runMagick(['-size', '200x100', '-background', 'white', '-fill', 'black', '-font', 'Helvetica-Bold', '-pointsize', '24', '-gravity', 'center', 'label:Case', col0HeaderPath]);
    const referenceLabel = cases[0]?.referenceBackend === 'echarts' ? 'ECharts' : 'Vega-Lite';
    runMagick(['-size', '900x100', '-background', 'white', '-fill', 'black', '-font', 'Helvetica-Bold', '-pointsize', '28', '-gravity', 'center', `label:${referenceLabel}`, col1HeaderPath]);
    runMagick(['-size', '900x100', '-background', 'white', '-fill', 'black', '-font', 'Helvetica-Bold', '-pointsize', '28', '-gravity', 'center', 'label:Excel', col2HeaderPath]);
    
    runMagick([col0HeaderPath, col1HeaderPath, col2HeaderPath, '+append', headerRowPath]);
    rowPaths.push(headerRowPath);
    
    for (let i = 0; i < chunk.length; i++) {
      const entry = chunk[i];
      const caseName = entry.name;
      
      if (allSeenCases.has(`${family}/${caseName}`)) {
        console.error(`Duplicate case detected: ${family}/${caseName}`);
        process.exit(1);
      }
      allSeenCases.add(`${family}/${caseName}`);
      totalPairsProcessed++;
      
      console.log(`    - ${caseName}`);
      
      const vlSrc = path.join(here, 'out', 'gallery', family, `${caseName}.vl.png`);
      const excelSrc = path.join(here, 'out', 'gallery', family, `${caseName}.excel.png`);
      
      const labelDest = path.join(tempDir, `label_${i}.png`);
      const vlDest = path.join(tempDir, `vl_${i}.png`);
      const excelDest = path.join(tempDir, `excel_${i}.png`);
      const rowDest = path.join(tempDir, `row_${i}.png`);
      
      // 1. Create label
      runMagick(['-size', '200x600', '-background', 'white', '-fill', 'black', '-font', 'Helvetica-Bold', '-pointsize', '18', '-gravity', 'center', `label:${caseName}`, labelDest]);
      
      // 2. Normalize Vega-Lite
      runMagick([vlSrc, '-resize', '900x600', '-background', 'white', '-gravity', 'center', '-extent', '900x600', vlDest]);
      
      // 3. Normalize Excel
      runMagick([excelSrc, '-resize', '900x600', '-background', 'white', '-gravity', 'center', '-extent', '900x600', excelDest]);
      
      // 4. Combine into single row
      runMagick([labelDest, vlDest, excelDest, '+append', rowDest]);
      rowPaths.push(rowDest);
    }
    
    // Combine header and rows vertically
    runMagick([...rowPaths, '-append', sheetPath]);
  }
}

// Clean up temp dir
try {
  fs.rmSync(tempDir, { recursive: true, force: true });
} catch (e) {
  // Ignore cleanup errors
}

console.log('\n--- VERIFICATION REPORT ---');
console.log(`Total sheets generated: ${allSheets.length}`);
console.log(`Total cases processed and verified: ${totalPairsProcessed}`);
if (totalPairsProcessed === okEntries.length) {
  console.log(`SUCCESS: Exactly ${okEntries.length} supported case pairs were included!`);
} else {
  console.error(`ERROR: Found ${totalPairsProcessed} cases instead of ${okEntries.length}.`);
  process.exit(1);
}

// Double check to make sure no omissions or duplicates relative to summary ok:true cases
const okCaseKeys = new Set(okEntries.map(e => `${e.type}/${e.name}`));
let mismatchFound = false;

for (const key of okCaseKeys) {
  if (!allSeenCases.has(key)) {
    console.error(`MISSING: ${key} was not included in any sheet.`);
    mismatchFound = true;
  }
}

for (const key of allSeenCases) {
  if (!okCaseKeys.has(key)) {
    console.error(`EXTRA: ${key} was included but not marked as OK in summary.`);
    mismatchFound = true;
  }
}

if (!mismatchFound) {
  console.log('SUCCESS: Perfect 1-to-1 matching with ok=true entries in summary.json with zero duplicates/omissions!');
} else {
  console.error('ERROR: Mismatch found in included cases.');
  process.exit(1);
}

// Print full detailed list of sheets and cases for easy auditing
console.log('\n--- FULL SHEETS AND CASES LIST ---');
for (const s of allSheets) {
  console.log(`Sheet: ${s.name} (${s.cases.length} cases): [${s.cases.join(', ')}]`);
}
