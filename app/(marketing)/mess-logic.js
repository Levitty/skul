// The mess, then the record. Plain JavaScript shared by the page and the
// static build. Fits the 1440 x 900 stage to the screen, settles the chaos
// in when the section arrives, and drives the change from chaos to order
// off the reader's own scrolling while the section is pinned.

export function mountMess(root) {
  if (!root || root.getAttribute("data-live")) return function () {};
  root.setAttribute("data-live", "1");
  var head = root.querySelector(".mhead");
  var fit = root.querySelector(".mess-fit");
  var stage = root.querySelector(".mess-stage");
  var chaos = root.querySelector(".m-chaos");
  var order = root.querySelector(".m-order");
  var lines = Array.prototype.slice.call(root.querySelectorAll(".o-log li"));
  var W = 1440, H = 900;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function narrow() { return window.matchMedia("(max-width: 700px)").matches; }
  function size() {
    if (narrow()) { fit.style.height = ""; stage.style.transform = ""; stage.style.left = ""; return; }
    var room = window.innerHeight - head.offsetHeight - 72;
    var s = Math.min(fit.clientWidth / W, room / H);
    fit.style.height = H * s + "px";
    stage.style.left = (fit.clientWidth - W * s) / 2 + "px";
    stage.style.transform = "scale(" + s + ")";
  }
  window.addEventListener("resize", size);
  if ("ResizeObserver" in window) new ResizeObserver(size).observe(fit);
  size();

  var clamp = function (v) { return Math.min(1, Math.max(0, v)); };
  var ramp = function (p, a, b) { return clamp((p - a) / (b - a)); };

  // Type the log lines to a progress value.
  function typeTo(p) {
    lines.forEach(function (li, i) {
      var t = li.getAttribute("data-t") || "";
      var k = ramp(p, 0.7 + i * 0.09, 0.78 + i * 0.09);
      li.firstElementChild.textContent = t.slice(0, Math.round(t.length * k));
      li.classList.toggle("on", k > 0);
      li.classList.toggle("done", k >= 1);
    });
  }

  function apply(p) {
    var fade = ramp(p, 0.3, 0.55);
    chaos.style.opacity = String(1 - fade);
    chaos.style.filter = fade > 0 ? "blur(" + (fade * 6).toFixed(1) + "px)" : "";
    chaos.style.transform = fade > 0 ? "scale(" + (1 - fade * 0.04).toFixed(3) + ")" : "";
    chaos.style.pointerEvents = fade >= 1 ? "none" : "";
    order.style.opacity = String(ramp(p, 0.38, 0.6));
    root.classList.toggle("filled", p > 0.6);
    root.classList.toggle("after", p > 0.5);
    typeTo(p);
  }

  // Finished state, for phones and for readers who prefer no motion.
  var finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    root.classList.add("in", "filled", "done");
    chaos.style.opacity = ""; chaos.style.filter = ""; chaos.style.transform = "";
    order.style.opacity = "";
    lines.forEach(function (li) { li.firstElementChild.textContent = li.getAttribute("data-t"); li.classList.add("on", "done"); });
  }

  var items = Array.prototype.slice.call(root.querySelectorAll(".q-it"));
  items.forEach(function (el, i) { el.style.transitionDelay = (i * 70) + "ms"; });

  var raf = 0;
  function onScroll() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      if (narrow() || still) { finish(); return; }
      finished = false;
      var r = root.getBoundingClientRect();
      var runway = root.offsetHeight - window.innerHeight;
      var p = runway > 0 ? clamp(-r.top / runway) : 0;
      if (r.top < window.innerHeight * 0.6) root.classList.add("in");
      apply(p);
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();
  return function () {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    window.removeEventListener("resize", size);
    cancelAnimationFrame(raf);
  };
}
