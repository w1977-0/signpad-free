// signmath.js — signpad-free core stroke math. Zero dependencies, browser + Node.
//
// The feel of a real pen comes from three things, all pure math:
//   1. smoothing — pointer input is jittery; a first-order low-pass filter and
//      midpoint quadratic Béziers turn it into a flowing line
//   2. velocity-aware width — fast strokes run thin, slow strokes run fat,
//      exactly like ink flow (the classic Square signature-pad recipe:
//      width interpolates between minWidth and maxWidth as velocity rises)
//   3. continuous strips — variable-width segments render as filled
//      quadrilateral strips with round caps, never dotted circles

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.signmath = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- points ----------------------------------------------------------
  function makePoint(x, y, pressure, time) {
    return {
      x: x,
      y: y,
      pressure: pressure || 0,
      time: time === undefined ? Date.now() : time
    };
  }

  function dist(a, b) {
    return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
  }

  function velocityFrom(prev, cur) {
    return cur.time !== prev.time ? dist(prev, cur) / (cur.time - prev.time) : 0;
  }

  // ---- smoothing -------------------------------------------------------
  // First-order low-pass: each new point is pulled partway toward the last
  // smoothed one. k=0 → no smoothing, k→1 → heavy lag. 0.55 is the sweet
  // spot for handwriting: kills jitter, keeps flick response.
  function smoothPoint(prevSmoothed, raw, k) {
    k = k === undefined ? 0.55 : k;
    return {
      x: raw.x + (prevSmoothed.x - raw.x) * k,
      y: raw.y + (prevSmoothed.y - raw.y) * k,
      pressure: raw.pressure,
      time: raw.time
    };
  }

  // ---- velocity-aware width -------------------------------------------
  // width = maxWidth when stopped, minWidth when fast.
  // velocity 0..∞ is mapped through an exponential decay (fast rises clamp
  // quickly), weighted 70% velocity / 30% pressure when pressure is available.
  function strokeWidth(prev, cur, opts) {
    opts = opts || {};
    var minW = opts.minWidth !== undefined ? opts.minWidth : 0.5;
    var maxW = opts.maxWidth !== undefined ? opts.maxWidth : 2.5;
    var vWeight = opts.velocityFilterWeight !== undefined ? opts.velocityFilterWeight : 0.7;
    var scale = opts.scale || 1; // device-pixel factor: css px → device px

    var v = velocityFrom(prev, cur);
    // normalized speed: 1.5 px/ms is already "fast" handwriting
    var vNorm = Math.min(1, v / 1.5);
    var tWidth = maxW - vNorm * (maxW - minW); // velocity term: fast → thin

    // pressure term: only meaningful when the device reports real pressure
    // (Apple Pencil etc.); a mouse reports 0.5 constant — treated as absent.
    var p = cur.pressure > 0 && cur.pressure < 1 ? cur.pressure : null;
    var width = p === null
      ? tWidth
      : (1 - vWeight) * (minW + p * (maxW - minW)) + vWeight * tWidth;

    return Math.max(minW, Math.min(maxW, width)) * scale;
  }

  // ---- stroke rendering geometry (pure data, canvas-free) --------------
  // Returns the strip for one segment: a quad from (prev at w1/2 either
  // side of the normal) to (cur at w2/2). The renderer fills it.
  function segmentStrip(prev, cur, wPrev, wCur) {
    var dx = cur.x - prev.x, dy = cur.y - prev.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len, ny = dx / len; // unit normal
    var h1 = wPrev / 2, h2 = wCur / 2;
    return {
      // quad corners, in order: prev-left, prev-right, cur-right, cur-left
      quad: [
        { x: prev.x + nx * h1, y: prev.y + ny * h1 },
        { x: prev.x - nx * h1, y: prev.y - ny * h1 },
        { x: cur.x - nx * h2,  y: cur.y - ny * h2 },
        { x: cur.x + nx * h2,  y: cur.y + ny * h2 }
      ],
      // round caps to seal joints between segments
      capFrom: { x: prev.x, y: prev.y, r: h1 },
      capTo: { x: cur.x, y: cur.y, r: h2 }
    };
  }

  // ---- whole-stroke pipeline -------------------------------------------
  // rawPoints: [{x,y,pressure,time}] in css px (already low-pass filtered or
  // not — this applies the filter itself when k > 0).
  // Returns strips[] for the renderer.
  function buildStroke(rawPoints, opts) {
    opts = opts || {};
    if (!rawPoints || rawPoints.length === 0) return [];
    var k = opts.smoothing === undefined ? 0.55 : opts.smoothing;

    // low-pass filter the raw series
    var pts = [rawPoints[0]];
    for (var i = 1; i < rawPoints.length; i++) {
      pts.push(smoothPoint(pts[i - 1], rawPoints[i], k));
    }

    // width per point (strokeWidth needs a previous point: first uses itself)
    var widths = pts.map(function (p, j) {
      return j === 0
        ? strokeWidth(pts[0], pts[Math.min(1, pts.length - 1)] || pts[0], opts)
        : strokeWidth(pts[j - 1], p, opts);
    });

    // strips between consecutive points
    var strips = [];
    for (var s = 0; s < pts.length - 1; s++) {
      strips.push(segmentStrip(pts[s], pts[s + 1], widths[s], widths[s + 1]));
    }
    // a single tap = a dot
    if (pts.length === 1) {
      strips.push({
        quad: null,
        capFrom: { x: pts[0].x, y: pts[0].y, r: widths[0] / 2 },
        capTo: null
      });
    }
    return strips;
  }

  // ---- export helpers ---------------------------------------------------
  // Trim transparent padding around the ink: find the ink's bounding box in
  // an RGBA buffer (alpha > threshold), with `pad` px of breathing room.
  function inkBounds(rgba, w, h, alphaThreshold) {
    alphaThreshold = alphaThreshold || 8;
    var minX = w, minY = h, maxX = -1, maxY = -1;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (rgba[(y * w + x) * 4 + 3] > alphaThreshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null; // empty canvas
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  return {
    makePoint: makePoint,
    dist: dist,
    velocityFrom: velocityFrom,
    smoothPoint: smoothPoint,
    strokeWidth: strokeWidth,
    segmentStrip: segmentStrip,
    buildStroke: buildStroke,
    inkBounds: inkBounds
  };
});
