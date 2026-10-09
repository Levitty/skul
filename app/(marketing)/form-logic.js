// The enquiry form. Shared by the page and the static build. Sends the form
// to contact.php without leaving the page; if that fails, offers the same
// answers as a WhatsApp message. A page opened with ?sent=1 (the no-script
// path, after contact.php redirects back) shows the thank-you at once.

export function mountForm(form) {
  if (!form || form.getAttribute("data-live")) return function () {};
  form.setAttribute("data-live", "1");
  var err = form.querySelector(".enq-err");
  var waLink = form.querySelector(".enq-err a");
  var wa = form.getAttribute("data-wa") || "";

  function field(name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? String(el.value || "").trim() : "";
  }
  function message() {
    var lines = ["Hello Tutagora. Enquiry from the website."];
    var name = field("name"), role = field("role"), school = field("school"), learners = field("learners");
    var phone = field("phone"), email = field("email"), want = field("want"), msg = field("message");
    if (name) lines.push("Name: " + name + (role ? " (" + role + ")" : ""));
    if (school) lines.push("School: " + school + (learners ? ", about " + learners + " learners" : ""));
    if (phone) lines.push("Phone: " + phone);
    if (email) lines.push("Email: " + email);
    if (want) lines.push("Would like: " + want);
    if (msg) lines.push(msg);
    return lines.join("\n");
  }
  function refreshWa() {
    if (waLink && wa) waLink.href = "https://wa.me/" + wa + "?text=" + encodeURIComponent(message());
  }
  form.addEventListener("input", refreshWa);
  refreshWa();

  function valid() {
    var ok = true;
    Array.prototype.forEach.call(form.querySelectorAll("[required]"), function (el) {
      var bad = !String(el.value || "").trim();
      el.classList.toggle("bad", bad);
      if (bad) ok = false;
    });
    return ok;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!valid()) { form.querySelector(".bad").focus(); return; }
    if (field("website")) { form.classList.add("sent"); return; } // a bot filled the honeypot
    form.classList.add("busy");
    form.classList.remove("failed");
    var data = new FormData(form);
    var done = false;
    var timer = window.setTimeout(function () { if (!done) fail(); }, 12000);
    function fail() {
      done = true;
      window.clearTimeout(timer);
      form.classList.remove("busy");
      form.classList.add("failed");
      refreshWa();
    }
    if (!window.fetch) { fail(); return; }
    window.fetch(form.getAttribute("action") || "/contact.php", {
      method: "POST",
      body: data,
      headers: { Accept: "application/json" },
    }).then(function (r) {
      if (done) return;
      if (!r.ok) { fail(); return; }
      return r.json().then(function (j) {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        form.classList.remove("busy");
        if (j && j.ok) form.classList.add("sent"); else fail();
      });
    }).catch(function () { if (!done) fail(); });
  });

  if (/[?&]sent=1/.test(window.location.search)) form.classList.add("sent");
  if (/[?&]sent=0/.test(window.location.search)) form.classList.add("failed");
  return function () { form.removeEventListener("input", refreshWa); };
}
