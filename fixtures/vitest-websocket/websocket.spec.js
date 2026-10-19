import { test, expect, vi, afterEach } from 'vitest';

// The global's WebSocket (Node's on warpdom, jsdom's own on jsdom), in
// every pool: the global's and the window's are one.
const GlobalWebSocket = globalThis.WebSocket;

afterEach(() => { vi.unstubAllGlobals(); });

test('WebSocket is the same object on the global and the window', () => {
  expect(typeof GlobalWebSocket).toBe('function');
  expect(window.WebSocket).toBe(GlobalWebSocket);
  expect(document.defaultView.WebSocket).toBe(GlobalWebSocket);
  expect(Object.keys(window)).not.toContain('WebSocket');
  expect([GlobalWebSocket.CONNECTING, GlobalWebSocket.OPEN, GlobalWebSocket.CLOSING, GlobalWebSocket.CLOSED]).toEqual([0, 1, 2, 3]);
});

test('vi.stubGlobal replaces it on the global and the window, and unstubAllGlobals puts it back', () => {
  const Mock = vi.fn();
  vi.stubGlobal('WebSocket', Mock);
  expect(globalThis.WebSocket).toBe(Mock);
  expect(window.WebSocket).toBe(Mock);
  new WebSocket('ws://localhost/');
  expect(Mock).toHaveBeenCalledWith('ws://localhost/');
  vi.unstubAllGlobals();
  expect(window.WebSocket).toBe(GlobalWebSocket);
});

test('assigning window.WebSocket replaces the global\'s', () => {
  const Mock = class MockWebSocket {};
  window.WebSocket = Mock;
  try {
    expect(globalThis.WebSocket).toBe(Mock);
    expect(document.defaultView.WebSocket).toBe(Mock);
  } finally {
    window.WebSocket = GlobalWebSocket;
  }
});
