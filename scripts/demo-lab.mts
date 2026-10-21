import { fixtureServer } from '../tests/fixture.js';

const fixture = await fixtureServer();
const target = `${fixture.base}/lab/`;

console.log('\nHunterKit deterministic local demonstration lab');
console.log('This loopback-only fixture simulates scanner signatures; it is not a real vulnerable product.');
console.log(`\nCreate a HunterKit project with this exact target:\n${target}\n`);
console.log('Then run Full Recon, refresh Parameters, and run each Attack module one at a time.');
console.log('Keep this window open during the demonstration. Press Ctrl+C to stop.\n');

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  await fixture.close();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
