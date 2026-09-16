(function(){
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window) || !("animate" in Element.prototype)) return;
  var budgets = {smis: 3.2, hr: 3.2, learning: 3.2, classroom: 7};
  document.querySelectorAll(".sketch").forEach(function(root){
    var seconds = root.closest(".vision-art") ? 7 : 3.2;
    var paths = Array.from(root.querySelectorAll("path"));
    var strokes = [], washes = [];
    paths.forEach(function(el){
      var f = el.getAttribute("fill");
      if (f && f !== "none") { washes.push({el: el, o: Number(el.getAttribute("opacity") || 1)}); el.style.opacity = "0"; }
      else { var len = el.getTotalLength(); strokes.push({el: el, len: len}); el.style.strokeDasharray = String(len); el.style.strokeDashoffset = String(len); }
    });
    var done = false;
    var io = new IntersectionObserver(function(entries){
      if (done || !entries.some(function(e){ return e.isIntersecting; })) return;
      done = true; io.disconnect();
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
    }, {threshold: 0.35});
    io.observe(root);
  });
})();
