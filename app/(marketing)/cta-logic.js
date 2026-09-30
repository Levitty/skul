// The floating WhatsApp button shows once the reader has scrolled past the
// top of the page, and hides while the closing contact block is on screen,
// where it would only repeat itself. Shared by the page and the static build.

export function mountFloat(el) {
  if (!el || el.getAttribute("data-live")) return function () {};
  el.setAttribute("data-live", "1");
  var close = document.querySelector(".close, .cta-end");
  var raf = 0;
  function onScroll() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      var past = window.scrollY > window.innerHeight * 0.6;
      var over = false;
      if (close) {
        var r = close.getBoundingClientRect();
        over = r.top < window.innerHeight && r.bottom > 0;
      }
      el.classList.toggle("show", past && !over);
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();
  return function () {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    cancelAnimationFrame(raf);
  };
}
