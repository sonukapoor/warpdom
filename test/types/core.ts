// warpdom's core, imported (ES module).
import { createWindow, setParserLoader, type CreateWindowOptions, type WarpdomWindow } from 'warpdom';

const options: CreateWindowOptions = {
  url: 'https://example.com/',
  jsdom: '30.1.2',
  cssstyle: '4.6.0',
  fastFrames: true,
  xhr: false,
};
const window: WarpdomWindow = createWindow(options);
createWindow();
createWindow({ jsdom: 26 });

// The window is typed as the DOM's.
const { document } = window;
document.body.innerHTML = '<p id="x">hello</p>';
const p: HTMLElement | null = document.getElementById('x');
const div: HTMLDivElement = document.createElement('div');
const event: MouseEvent = new window.MouseEvent('click', { bubbles: true });
div.dispatchEvent(event);
const isElement: boolean = p instanceof window.HTMLElement;
const href: string = window.location.href;
window.requestAnimationFrame((time: number) => time);
const style: CSSStyleDeclaration = window.getComputedStyle(div);
void [isElement, href, style];

setParserLoader(() => ({}));

// @ts-expect-error: url is a string
createWindow({ url: new URL('https://example.com/') });
// @ts-expect-error: unknown option
createWindow({ runScripts: 'dangerously' });
// @ts-expect-error: fastFrames is a boolean
createWindow({ fastFrames: 'yes' });
// @ts-expect-error: xhr is a boolean
createWindow({ xhr: 'off' });

// XMLHttpRequest is the DOM's.
const xhr: XMLHttpRequest = new window.XMLHttpRequest();
xhr.open('GET', '/');
void xhr.upload;
