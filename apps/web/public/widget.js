(function () {
  var s = document.currentScript, key = s.getAttribute("data-key");
  var base = s.src.replace(/\/widget\.js.*$/, "");
  var f = document.createElement("iframe");
  f.src = base + "/book/" + key + "?embed=1"; f.title = "Book a room"; f.style.cssText = "width:100%;border:0;min-height:640px";
  s.parentNode.insertBefore(f, s);
  window.addEventListener("message", function (e) { if (e.source === f.contentWindow && e.data && e.data.m89Height) f.style.height = e.data.m89Height + "px"; });
})();
