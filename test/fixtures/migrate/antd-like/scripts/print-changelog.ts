import jsdom from 'jsdom';

const { JSDOM } = jsdom;
const { window } = new JSDOM();
export default window;
