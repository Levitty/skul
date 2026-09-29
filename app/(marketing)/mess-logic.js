// The mess. Plain JavaScript shared by the page and the static build.
// Scales the fixed 1200 x 780 composition to the width it is given, and
// lets the artefacts settle in one by one as the section scrolls into view.

export function mountMess(root) {
  if (!root || root.getAttribute("data-live")) return function () {};
  root.setAttribute("data-live", "1");
  var fit = root.querySelector(".mess-fit"), stage = root.querySelector(".mess-stage");
  var W = 1200, H = 780;
  function size() {
    var narrow = window.matchMedia("(max-width: 700px)").matches;
    if (narrow) { fit.style.height = ""; stage.style.transform = ""; return; }
    var s = fit.clientWidth / W;
    fit.style.height = H * s + "px";
    stage.style.transform = "scale(" + s + ")";
  }
  window.addEventListener("resize", size);
  if ("ResizeObserver" in window) new ResizeObserver(size).observe(fit);
  size();
  var items = Array.prototype.slice.call(root.querySelectorAll(".q-it"));
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still || !("IntersectionObserver" in window)) { root.classList.add("in"); return function () {}; }
  items.forEach(function (el, i) { el.style.transitionDelay = (i * 90) + "ms"; });
  var io = new IntersectionObserver(function (es) {
    if (!es.some(function (e) { return e.isIntersecting; })) return;
    root.classList.add("in");
    io.disconnect();
  }, { threshold: 0.25 });
  io.observe(fit);
  return function () { io.disconnect(); window.removeEventListener("resize", size); };
}
