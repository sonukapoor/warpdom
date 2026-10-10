// Media elements (HTML standard, 4.8.11) without media: nothing loads or
// plays. play(), pause(), load() and addTextTrack() report that they are
// not implemented (as in jsdom, so tests that spy on or stub them see the
// same surface); the state members describe an element with no media yet,
// and the settable ones keep what is set.
import { S, state, domError } from './internal.js';

const windowOf = (el) => state(el).doc[S].window;
const report = (el, method) => windowOf(el)[S].notImplemented(`HTMLMediaElement's ${method}() method`);

function media(el) {
  const s = state(el);
  return s.media ?? (s.media = { currentTime: 0, volume: 1, muted: false, playbackRate: 1, defaultPlaybackRate: 1, textTracks: null });
}

function finite(name, v) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new TypeError(`Failed to set the '${name}' property on 'HTMLMediaElement': The provided double value is non-finite.`);
  return n;
}

// An empty TimeRanges: nothing buffered, played or seekable.
function emptyRanges(el) {
  const ranges = Object.create(windowOf(el)[S].protos.TimeRanges);
  ranges[S] = {};
  return ranges;
}

export const MEDIA_MEMBERS = {
  play() { report(this, 'play'); },
  pause() { report(this, 'pause'); },
  load() { report(this, 'load'); },
  addTextTrack() { report(this, 'addTextTrack'); },
  canPlayType() { state(this); return ''; },
  get paused() { state(this); return true; },
  get ended() { state(this); return false; },
  get seeking() { state(this); return false; },
  get duration() { state(this); return NaN; },
  get readyState() { state(this); return 0; },
  get networkState() { state(this); return 0; },
  get error() { state(this); return null; },
  get currentSrc() { state(this); return ''; },
  get buffered() { return emptyRanges(this); },
  get played() { return emptyRanges(this); },
  get seekable() { return emptyRanges(this); },
  get textTracks() { const m = media(this); return m.textTracks ?? (m.textTracks = []); },
  get currentTime() { return media(this).currentTime; },
  set currentTime(v) { media(this).currentTime = finite('currentTime', v); },
  get volume() { return media(this).volume; },
  set volume(v) {
    const n = finite('volume', v);
    if (n < 0 || n > 1) throw domError(`Failed to set the 'volume' property on 'HTMLMediaElement': The volume provided (${n}) is outside the range [0, 1].`, 'IndexSizeError');
    media(this).volume = n;
  },
  get muted() { return media(this).muted; },
  set muted(v) { media(this).muted = !!v; },
  get playbackRate() { return media(this).playbackRate; },
  set playbackRate(v) { media(this).playbackRate = finite('playbackRate', v); },
  get defaultPlaybackRate() { return media(this).defaultPlaybackRate; },
  set defaultPlaybackRate(v) { media(this).defaultPlaybackRate = finite('defaultPlaybackRate', v); },
};

export const MEDIA_STATICS = {
  NETWORK_EMPTY: 0, NETWORK_IDLE: 1, NETWORK_LOADING: 2, NETWORK_NO_SOURCE: 3,
  HAVE_NOTHING: 0, HAVE_METADATA: 1, HAVE_CURRENT_DATA: 2, HAVE_FUTURE_DATA: 3, HAVE_ENOUGH_DATA: 4,
};

// No video frames: intrinsic dimensions are 0.
export const VIDEO_MEMBERS = {
  get videoWidth() { state(this); return 0; },
  get videoHeight() { state(this); return 0; },
};

const outOfRange = (index) => domError(`Failed to execute on 'TimeRanges': The index provided (${index}) is greater than or equal to the maximum bound (0).`, 'IndexSizeError');

export const TIME_RANGES_INTERFACE = {
  name: 'TimeRanges',
  members: {
    get length() { state(this); return 0; },
    start(index) { state(this); throw outOfRange(index); },
    end(index) { state(this); throw outOfRange(index); },
  },
};
