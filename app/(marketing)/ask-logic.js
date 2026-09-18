// Ask the school. Plain JavaScript so the same code runs inside the React
// page and in the static build, where it is appended to home.js.
//
// The board carries a faint map of every record. A question is written in
// chalk at the top, the records it needs are drawn in the order the answer
// walks them (links in orange), then the answer is written under the drawing.
// It cycles by itself while on screen, and a reader can pick a question.

export function mountAsk(root) {
  if (!root || root.getAttribute("data-live")) return function () {};
  root.setAttribute("data-live", "1");
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("animate" in Element.prototype);
  var buttons = Array.prototype.slice.call(root.querySelectorAll(".ask-q button"));
  var layers = Array.prototype.slice.call(root.querySelectorAll(".ask-layer"));
  var ghost = root.querySelector(".ask-ghost");
  var qEl = root.querySelector(".ask-question");
  var aEl = root.querySelector(".ask-answer");
  var n = Math.min(buttons.length, layers.length);
  var gen = 0, timers = [], current = -1, visible = false, started = false, idle = true;

  function hide(el) {
    Array.prototype.forEach.call(el.querySelectorAll("text"), function (t) { t.style.opacity = "0"; });
    Array.prototype.forEach.call(el.querySelectorAll("path"), function (p) {
      var f = p.getAttribute("fill");
      if (f && f !== "none") { p.style.opacity = "0"; return; }
      var len = p.getTotalLength();
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
    });
  }
  // Draw stroke by stroke in the order the file holds them; returns the
  // moment (ms from now) at which the last mark is made.
  function draw(el, seconds) {
    var strokes = [], washes = [];
    Array.prototype.forEach.call(el.querySelectorAll("path"), function (p) {
      var f = p.getAttribute("fill");
      if (f && f !== "none") washes.push({ el: p, o: Number(p.getAttribute("opacity") || 1) });
      else strokes.push({ el: p, len: p.getTotalLength() });
    });
    Array.prototype.forEach.call(el.querySelectorAll("text"), function (t) { washes.push({ el: t, o: Number(t.getAttribute("opacity") || 1) }); });
    var total = strokes.reduce(function (a, s) { return a + s.len; }, 0);
    var speed = total / (seconds * 1000);
    var plan = strokes.map(function (s) { return { el: s.el, len: s.len, dur: Math.max(12, s.len / speed) }; });
    var raw = plan.reduce(function (a, s) { return a + s.dur * 0.92; }, 0);
    var k = (seconds * 1000) / raw, t = 0;
    plan.forEach(function (s) {
      var dur = s.dur * k;
      s.el.animate([{ strokeDashoffset: s.len }, { strokeDashoffset: 0 }], { duration: dur, delay: t, fill: "forwards", easing: "linear" });
      t += dur * 0.92;
    });
    // A label is written when the hand reaches it: fade each text in at the
    // moment the stroke before it in document order has finished.
    var textAt = {}, tt = 0, idx = 0;
    Array.prototype.forEach.call(el.querySelectorAll("path, text"), function (node) {
      if (node.tagName.toLowerCase() === "text") { textAt[idx++] = tt; return; }
      var f = node.getAttribute("fill");
      if (f && f !== "none") return;
      var s = plan.find(function (x) { return x.el === node; });
      if (s) tt += s.dur * k * 0.92;
    });
    var ti = 0;
    washes.forEach(function (w) {
      var at = w.el.tagName.toLowerCase() === "text" ? textAt[ti++] : t;
      w.el.animate([{ opacity: 0 }, { opacity: w.o }], { duration: 500, delay: at + 60, fill: "forwards", easing: "ease-out" });
    });
    return t + 500;
  }
  function wait(ms) { return new Promise(function (r) { timers.push(window.setTimeout(r, ms)); }); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  // Writes text a character at a time, like chalk.
  function write(el, text, per, g) {
    el.textContent = "";
    el.classList.add("writing");
    return new Promise(function (resolve) {
      var i = 0;
      function tick() {
        if (g !== gen) return;
        i++;
        el.textContent = text.slice(0, i);
        if (i < text.length) timers.push(window.setTimeout(tick, per + (text[i - 1] === " " ? per * 0.6 : 0)));
        else { el.classList.remove("writing"); resolve(); }
      }
      tick();
    });
  }
  function reset(layer) {
    layer.classList.remove("on", "wipe");
    hide(layer);
  }
  function show(i) {
    current = i;
    buttons.forEach(function (b, k) { b.setAttribute("aria-pressed", k === i ? "true" : "false"); b.classList.toggle("on", k === i); });
    var g = ++gen;
    clearTimers();
    idle = false;
    var q = buttons[i].getAttribute("data-q") || buttons[i].textContent;
    var a = layers[i].getAttribute("data-a") || "";
    if (still) {
      layers.forEach(function (l, k) { l.classList.toggle("on", k === i); });
      qEl.textContent = q; aEl.textContent = a;
      idle = true;
      return;
    }
    var prev = layers.filter(function (l) { return l.classList.contains("on"); });
    var p = Promise.resolve();
    if (prev.length || qEl.textContent) {
      // the duster
      prev.forEach(function (l) { l.classList.add("wipe"); });
      root.classList.add("wiping");
      p = wait(480).then(function () {
        if (g !== gen) return;
        prev.forEach(reset);
        root.classList.remove("wiping");
        qEl.textContent = ""; aEl.textContent = "";
      });
    }
    p.then(function () {
      if (g !== gen) return;
      return write(qEl, q, 28, g);
    }).then(function () {
      if (g !== gen) return;
      return wait(260);
    }).then(function () {
      if (g !== gen) return;
      var l = layers[i];
      hide(l);
      l.classList.add("on");
      var end = draw(l, 2.4);
      return wait(end + 120);
    }).then(function () {
      if (g !== gen) return;
      return write(aEl, a, 24, g);
    }).then(function () {
      if (g !== gen) return;
      idle = true;
      return wait(4600);
    }).then(function () {
      if (g !== gen) return;
      if (visible) show((i + 1) % n);
    });
  }
  buttons.forEach(function (b, i) {
    b.addEventListener("click", function () { if (i !== current || idle) show(i); });
  });
  function start() {
    if (started) return;
    started = true;
    if (ghost && !still) {
      hide(ghost);
      var end = draw(ghost, 1.8);
      wait(end + 300).then(function () { show(0); });
    } else show(0);
  }
  layers.forEach(function (l) { if (!still) hide(l); });
  if (ghost && !still) hide(ghost);
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      visible = es.some(function (e) { return e.isIntersecting; });
      if (visible && !started) start();
      else if (visible && started && idle && current >= 0) {
        // back on screen: carry on from the next question
        clearTimers();
        var g = ++gen; idle = true;
        wait(900).then(function () { if (g === gen && visible) show((current + 1) % n); });
      }
    }, { threshold: 0.4 });
    io.observe(root);
  } else { visible = true; start(); }
  return function () { ++gen; clearTimers(); if (io) io.disconnect(); };
}
