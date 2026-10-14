import fs from 'node:fs';
import { beforeAll, afterAll } from 'vitest';
const f = process.env.ORDER_LOG;
beforeAll((s) => { fs.appendFileSync(f, `${process.pid} start ${s?.filepath ?? s?.file?.filepath ?? '?'} ${Date.now()}\n`); });
afterAll((s) => { fs.appendFileSync(f, `${process.pid} end ${s?.filepath ?? '?'} ${Date.now()}\n`); });
