// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = () => {};
