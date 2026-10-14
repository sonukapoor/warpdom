import { test } from 'vitest';
import fs from 'node:fs';

test('records its worker', () => {
  const side = navigator.userAgent.includes('warpdom/') ? 'warpdom' : 'jsdom';
  fs.appendFileSync(process.env.WARPDOM_COMPARE_GROUP_LOG, `${side} a ${process.pid}\n`);
});
