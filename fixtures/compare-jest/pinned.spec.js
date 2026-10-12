/**
 * @jest-environment jsdom
 */
test('runs on jsdom in both runs', () => {
  expect(document.title).toBe('');
});
