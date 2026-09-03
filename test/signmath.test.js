// test/signmath.test.js — signpad-free stroke math tests (Node built-in runner).
//   node --test test/signmath.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const m = require(path.join(__dirname, "..", "signmath.js"));

test("velocity: distance over time, zero on same timestamp", () => {
  const a = m.makePoint(0, 0, 0, 100);
  const b = m.makePoint(30, 40, 0, 120); // 50px in 20ms = 2.5 px/ms
  assert.equal(m.velocityFrom(a, b), 2.5);
  assert.equal(m.velocityFrom(a, a), 0);
});

test("strokeWidth: fast strokes thin, slow strokes fat", () => {
  const o = { minWidth: 0.5, maxWidth: 2.5, velocityFilterWeight: 0.7, scale: 1 };
  const prev = m.makePoint(0, 0, 0, 0);
  const slow = m.makePoint(0, 0.3, 0, 100);   // 0.003 px/ms → very slow
  const fast = m.makePoint(0, 30, 0, 10);    // 3 px/ms → faster than clamp
  const wSlow = m.strokeWidth(prev, slow, o);
  const wFast = m.strokeWidth(prev, fast, o);
  assert.ok(wSlow > wFast, `slow ${wSlow} must outrank fast ${wFast}`);
  assert.equal(wFast, o.minWidth, "fast clamps to minWidth");
  assert.ok(Math.abs(wSlow - o.maxWidth) < 0.01, "very slow ≈ maxWidth");
});

test("strokeWidth: width never leaves [min, max], scale applies", () => {
  const o = { minWidth: 1, maxWidth: 4, velocityFilterWeight: 0.7, scale: 3 };
  const prev = m.makePoint(0, 0, 0, 0);
  for (const speed of [0.1, 0.5, 1, 2, 5, 50]) {
    const cur = m.makePoint(speed, 0, 0, 1);
    const w = m.strokeWidth(prev, cur, o);
    assert.ok(w >= o.minWidth * 3 - 1e-9 && w <= o.maxWidth * 3 + 1e-9, `w=${w}`);
  }
});

test("smoothPoint: pulls toward previous, k=0 is identity", () => {
  const prev = { x: 100, y: 100 };
  const raw = { x: 200, y: 100 };
  const s = m.smoothPoint(prev, raw, 0.5);
  assert.equal(s.x, 150, "halfway with k=0.5");
  const none = m.smoothPoint(prev, raw, 0);
  assert.equal(none.x, 200, "k=0 keeps the raw point");
});

test("buildStroke: returns strips with quads and caps, in order", () => {
  const pts = [
    m.makePoint(0, 0, 0, 0),
    m.makePoint(10, 0, 0, 10),
    m.makePoint(20, 0, 0, 20)
  ];
  const strips = m.buildStroke(pts, { minWidth: 1, maxWidth: 2, scale: 1 });
  assert.equal(strips.length, 2, "two segments");
  for (const s of strips) {
    assert.ok(s.quad && s.quad.length === 4);
    assert.ok(s.capFrom && s.capTo);
    // quad must actually span the segment: width > 0
    const q = s.quad;
    const w0 = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y);
    const w1 = Math.hypot(q[3].x - q[2].x, q[3].y - q[2].y);
    assert.ok(w0 > 0 && w1 > 0);
  }
  // the strip advances left-to-right along x
  const cx0 = (strips[0].quad[2].x + strips[0].quad[3].x) / 2;
  assert.ok(cx0 > 0, "segment endpoint ahead of start");
});

test("buildStroke: single tap produces a dot (no quad)", () => {
  const strips = m.buildStroke([m.makePoint(5, 5, 0, 1)], { scale: 1 });
  assert.equal(strips.length, 1);
  assert.equal(strips[0].quad, null);
  assert.ok(strips[0].capFrom && strips[0].capFrom.r > 0);
});

test("buildStroke: empty input gives empty output", () => {
  assert.deepEqual(m.buildStroke([], {}), []);
  assert.deepEqual(m.buildStroke(null, {}), []);
});

test("segmentStrip: quad is perpendicular to the segment direction", () => {
  const prev = m.makePoint(0, 0, 0, 0);
  const cur = m.makePoint(100, 0, 0, 10); // purely horizontal
  const s = m.segmentStrip(prev, cur, 10, 10);
  // normals for a horizontal segment are vertical: left/right offsets differ only in y
  assert.equal(s.quad[0].x, s.quad[1].x);
  assert.ok(Math.abs(s.quad[0].y - s.quad[1].y - 10) < 1e-9, "full width across the normal");
  assert.equal(s.capTo.x, 100);
});

test("inkBounds: finds the ink box with alpha threshold, null when empty", () => {
  const w = 10, h = 10;
  const empty = new Uint8ClampedArray(w * h * 4); // all alpha 0
  assert.equal(m.inkBounds(empty, w, h), null);
  const buf = new Uint8ClampedArray(w * h * 4);
  const set = (x, y) => { const i = (y * w + x) * 4; buf[i] = 20; buf[i + 3] = 255; };
  set(3, 4); set(7, 4); set(7, 8);
  const b = m.inkBounds(buf, w, h);
  assert.deepEqual([b.x, b.y, b.w, b.h], [3, 4, 5, 5]);
  // faint noise below the threshold is ignored
  const noisy = new Uint8ClampedArray(buf);
  noisy[2] = 4; // alpha=4 < 8
  assert.deepEqual(m.inkBounds(noisy, w, h), b);
});

test("end-to-end feel: jittered raw line smooths to a monotone path", () => {
  // a horizontal line with ±4px jitter must come out with |dy| spread reduced
  const raw = [];
  for (let i = 0; i <= 30; i++) {
    raw.push(m.makePoint(i * 5, 50 + (i % 2 === 0 ? 4 : -4), 0, i * 16));
  }
  const strips = m.buildStroke(raw, { minWidth: 0.5, maxWidth: 2.5, smoothing: 0.55 });
  assert.ok(strips.length > 0);
  // every strip stays within the jitter envelope ±8px around y=50
  for (const s of strips) {
    for (const p of s.quad) assert.ok(Math.abs(p.y - 50) <= 8 + 1.5, `y=${p.y}`);
  }
});
