(function(){
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window) || !("animate" in Element.prototype)) return;
  var budgets = {smis: 3.2, hr: 3.2, learning: 3.2, classroom: 7};
  document.querySelectorAll(".sketch").forEach(function(root){
    var seconds = Number(root.getAttribute("data-seconds")) || (root.closest(".vision-art") ? 7 : 3.2);
    var delay = Number(root.getAttribute("data-delay")) || 0;
    var paths = Array.from(root.querySelectorAll("path"));
    var strokes = [], washes = [];
    paths.forEach(function(el){
      var f = el.getAttribute("fill");
      if (f && f !== "none") { washes.push({el: el, o: Number(el.getAttribute("opacity") || 1)}); el.style.opacity = "0"; }
      else { var len = el.getTotalLength(); strokes.push({el: el, len: len}); el.style.strokeDasharray = String(len); el.style.strokeDashoffset = String(len); }
    });
    Array.prototype.forEach.call(root.querySelectorAll("text"), function(el){ washes.push({el: el, o: Number(el.getAttribute("opacity") || 1)}); el.style.opacity = "0"; });
    var done = false;
    var io = new IntersectionObserver(function(entries){
      if (done || !entries.some(function(e){ return e.isIntersecting; })) return;
      done = true; io.disconnect();
      window.setTimeout(function(){
      var total = strokes.reduce(function(a, s){ return a + s.len; }, 0);
      var speed = total / (seconds * 1000);
      var plan = strokes.map(function(s){ return {el: s.el, len: s.len, dur: Math.max(12, s.len / speed)}; });
      var raw = plan.reduce(function(a, s){ return a + s.dur * 0.92; }, 0);
      var k = (seconds * 1000) / raw, t = 0;
      plan.forEach(function(s){
        var dur = s.dur * k;
        s.el.animate([{strokeDashoffset: s.len}, {strokeDashoffset: 0}], {duration: dur, delay: t, fill: "forwards", easing: "linear"});
        t += dur * 0.92;
      });
      washes.forEach(function(w){ w.el.animate([{opacity: 0}, {opacity: w.o}], {duration: 900, delay: t + 100, fill: "forwards", easing: "ease-out"}); });
      }, delay);
    }, {threshold: 0.35});
    io.observe(root);
  });
})();

// The payment that knows where it belongs: play once when it scrolls into view.
(function(){
  var els = document.querySelectorAll(".match");
  if (!els.length) return;
  if (!("IntersectionObserver" in window)) { els.forEach(function(e){ e.classList.add("go"); }); return; }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){ if (en.isIntersecting) { en.target.classList.add("go"); io.unobserve(en.target); } });
  }, { threshold: 0.35 });
  els.forEach(function(e){ io.observe(e); });
})();

// The light row: slide, reveal, and jump to a card from a link.
(function(){
  var t = document.querySelector(".wtrack"); if (!t) return;
  var btns = document.querySelectorAll(".wnav button"), p = btns[0], n = btns[1];
  var cards = Array.prototype.slice.call(t.querySelectorAll(".wcard"));
  function step(){ var c = cards[0]; return c ? c.getBoundingClientRect().width + 24 : 400; }
  function upd(){ if (p) p.disabled = t.scrollLeft < 10; if (n) n.disabled = t.scrollLeft + t.clientWidth >= t.scrollWidth - 10; }
  if (p) p.addEventListener("click", function(){ t.scrollBy({ left: -step(), behavior: "smooth" }); });
  if (n) n.addEventListener("click", function(){ t.scrollBy({ left: step(), behavior: "smooth" }); });
  t.addEventListener("scroll", upd, { passive: true }); upd();
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: 0.2 });
    cards.forEach(function(c){ io.observe(c); });
  } else cards.forEach(function(c){ c.classList.add("in"); });
  function jump(){ var m = /^#work-(\d)$/.exec(location.hash); if (!m) return; var c = cards[Number(m[1]) - 1]; if (c) t.scrollTo({ left: c.offsetLeft - t.offsetLeft, behavior: "smooth" }); }
  window.addEventListener("hashchange", jump); jump();
})();

// The blind: the block before the light row holds still while the row covers it.
(function(){
  var pin = document.querySelector(".pin"); if (!pin) return;
  var inner = pin.firstElementChild, cover = pin.nextElementSibling;
  function size(){ pin.style.setProperty("--pin-h", pin.offsetHeight + "px"); }
  if ("ResizeObserver" in window) new ResizeObserver(size).observe(pin); size();
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches, raf = 0;
  function onScroll(){
    if (still || !inner || !cover) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function(){
      var r = cover.getBoundingClientRect();
      var p = Math.min(1, Math.max(0, (window.innerHeight - r.top) / window.innerHeight));
      inner.style.transform = p > 0 ? "translateY(" + (p * 48) + "px) scale(" + (1 - p * 0.03) + ")" : "";
      inner.style.opacity = p > 0 ? String(1 - p * 0.45) : "";
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
})();
