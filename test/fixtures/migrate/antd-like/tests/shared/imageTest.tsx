import { JSDOM } from 'jsdom';

export function imageTest() {
  const dom = new JSDOM('<!DOCTYPE html><body></body></html>', { url: 'http://localhost/' });
  return dom.window.document;
}
