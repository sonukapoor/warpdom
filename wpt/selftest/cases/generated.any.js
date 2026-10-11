// META: title=Generated page for .any.js
// META: script=support/helper.js
test(() => {
  assert_true(GLOBAL.isWindow(), "GLOBAL.isWindow()");
  assert_equals(self.helperLoaded, true, "META script loaded first");
  assert_equals(document.title, "Generated page for .any.js");
}, "META script and title");
