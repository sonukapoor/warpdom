import { JSDOM } from 'jsdom';

console.log(new JSDOM('<p>hi</p>').window.document.body.innerHTML);
