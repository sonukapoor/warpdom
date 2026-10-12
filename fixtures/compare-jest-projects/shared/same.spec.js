test('creates an element', () => {
  const div = document.createElement('div');
  div.textContent = 'hi';
  document.body.append(div);
  expect(document.body.textContent).toBe('hi');
});
