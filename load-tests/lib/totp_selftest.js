import { generateTotp } from './totp.js';

const cases = [
  ['JBSWY3DPEHPK3PXP', 1790511499, '842632'],
  ['MFRGGZDFMZTWQ2LK', 1727000000, '279224'],
  ['AAAAAAAAAAAAAAAA', 1700000000, '501315'],
  ['ZZZZZZZZZZZZZZZZ', 1800000001, '769761'],
];

export default function () {
  for (const [secret, t, expected] of cases) {
    const code = generateTotp(secret, { forTimeMs: t * 1000 });
    console.log(`${secret} @ ${t}: got=${code} expected=${expected}`);
    if (code !== expected) {
      throw new Error(`MISMATCH for ${secret}@${t}: expected ${expected}, got ${code}`);
    }
  }
  console.log('TOTP self-test: ALL MATCH');
}
