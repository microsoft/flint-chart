// Read ChartAssemblyInput from stdin, run assembleVegaLite, output spec to stdout.
import { assembleVegaLite } from '../packages/flint-js/src/index.ts';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const parsed = JSON.parse(input);
    const spec = assembleVegaLite(parsed);
    process.stdout.write(JSON.stringify(spec));
  } catch (e) {
    process.stderr.write(e.message);
    process.exit(1);
  }
});
