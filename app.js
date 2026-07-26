/* ===== Mi Punto de Venta — lógica ===== */
(function () {
  "use strict";

  var PRODUCTS = window.PRODUCTS || [];
  var $ = function (id) { return document.getElementById(id); };

  // ---- Normalizar texto (sin acentos, minúsculas) ----
  function norm(s) {
    return (s || "").toString().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  // Índice de búsqueda
  PRODUCTS.forEach(function (p) {
    p._n = norm(p.n);
    p._c = norm(p.c);
  });

  function money(v) {
    var n = Number(v) || 0;
    return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function existTxt(e) {
    var n = Number(e) || 0;
    // eleventa guarda con decimales; mostrar entero si aplica
    return (Math.abs(n % 1) < 0.001) ? String(Math.round(n)) : n.toFixed(1);
  }

  // ---- Estado ----
  var cart = {}; // code -> {p, qty}
  var byCode = {};
  PRODUCTS.forEach(function (p) { if (p.c) byCode[p.c] = p; });

  $("hsub").textContent = PRODUCTS.length.toLocaleString("es-MX") + " productos · toca para vender";

  // ---------- BÚSQUEDA ----------
  var q = $("q"), list = $("list"), countEl = $("count");

  function search(term) {
    term = norm(term).trim();
    if (!term) return [];
    var words = term.split(/\s+/);
    var res = [];
    for (var i = 0; i < PRODUCTS.length && res.length < 100; i++) {
      var p = PRODUCTS[i];
      var hay = p._n + " " + p._c;
      var ok = true;
      for (var w = 0; w < words.length; w++) {
        if (hay.indexOf(words[w]) === -1) { ok = false; break; }
      }
      if (ok) res.push(p);
    }
    return res;
  }

  function render(items, term) {
    if (!term) {
      list.innerHTML = '<div class="empty"><b>Escribe el nombre o código</b><br>o toca <b>📷 Escanear</b> para leer el código de barras.</div>';
      countEl.textContent = "";
      return;
    }
    if (!items.length) {
      list.innerHTML = '<div class="empty">No encontré <b>"' + escapeHtml(term) + '"</b>.<br>Revisa que esté bien escrito.</div>';
      countEl.textContent = "";
      return;
    }
    countEl.textContent = items.length + (items.length === 100 ? "+ resultados" : " resultado" + (items.length > 1 ? "s" : ""));
    var html = "";
    for (var i = 0; i < items.length; i++) {
      var p = items[i];
      var cero = (Number(p.e) || 0) <= 0;
      html += '<div class="card" data-c="' + escapeHtml(p.c) + '">' +
        '<div class="info">' +
          '<div class="nombre">' + escapeHtml(p.n) + '</div>' +
          '<div class="meta">' +
            '<span class="tag">' + escapeHtml(p.d || "—") + '</span>' +
            '<span class="tag">' + escapeHtml(p.c) + '</span>' +
            '<span class="exist' + (cero ? ' cero' : '') + '">Quedan: ' + existTxt(p.e) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="precios">' +
          '<div class="venta">' + (p.v > 0 ? money(p.v) : '<span style="color:#c0392b;font-size:14px;">sin precio</span>') + '</div>' +
          (p.m > 0 ? '<div class="mayoreo">May: ' + money(p.m) + '</div>' : '') +
          '<div class="costo">Costo: ' + money(p.co) + '</div>' +
        '</div>' +
        '<button class="addbtn" data-add="' + escapeHtml(p.c) + '">+</button>' +
      '</div>';
    }
    list.innerHTML = html;
  }

  function escapeHtml(s) {
    return (s || "").toString().replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var t;
  q.addEventListener("input", function () {
    clearTimeout(t);
    t = setTimeout(function () {
      var term = q.value;
      render(search(term), term.trim());
    }, 80);
  });

  list.addEventListener("click", function (e) {
    var add = e.target.closest("[data-add]");
    if (add) { addToCart(add.getAttribute("data-add")); return; }
    var card = e.target.closest(".card");
    if (card) { addToCart(card.getAttribute("data-c")); }
  });

  // ---------- CARRITO / VENTA ----------
  function addToCart(code, silent) {
    var p = byCode[code];
    if (!p) { toast("Producto no encontrado", "err"); return; }
    if (!cart[code]) cart[code] = { p: p, qty: 0 };
    cart[code].qty += 1;
    updateBar();
    if (!silent) toast("➕ " + p.n + (p.v > 0 ? "  " + money(p.v) : ""), "ok");
    if (navigator.vibrate) navigator.vibrate(30);
  }
  function removeOne(code) {
    if (!cart[code]) return;
    cart[code].qty -= 1;
    if (cart[code].qty <= 0) delete cart[code];
    updateBar(); renderCart();
  }
  function addOne(code) { if (cart[code]) { cart[code].qty += 1; updateBar(); renderCart(); } }

  function cartTotals() {
    var total = 0, items = 0;
    for (var k in cart) { total += (Number(cart[k].p.v) || 0) * cart[k].qty; items += cart[k].qty; }
    return { total: total, items: items };
  }

  function updateBar() {
    var t = cartTotals();
    var bar = $("ventaBar");
    if (t.items > 0) {
      bar.classList.remove("hidden");
      $("vbCount").textContent = t.items + (t.items === 1 ? " producto" : " productos");
      $("vbTotal").textContent = money(t.total);
    } else {
      bar.classList.add("hidden");
      closeCart();
    }
    $("cartTotal").textContent = money(t.total);
    calcCambio();
  }

  function renderCart() {
    var box = $("cartItems"); var html = "";
    var keys = Object.keys(cart);
    if (!keys.length) { box.innerHTML = '<div class="empty">Sin productos todavía.<br>Busca o escanea para agregar.</div>'; return; }
    keys.forEach(function (k) {
      var it = cart[k]; var sub = (Number(it.p.v) || 0) * it.qty;
      html += '<div class="ci">' +
        '<div class="ci-n">' + escapeHtml(it.p.n) + '<small>' + money(it.p.v) + ' c/u</small></div>' +
        '<div class="qtybox">' +
          '<button data-minus="' + escapeHtml(k) + '">−</button>' +
          '<span>' + it.qty + '</span>' +
          '<button data-plus="' + escapeHtml(k) + '">+</button>' +
        '</div>' +
        '<div class="ci-sub">' + money(sub) + '</div>' +
      '</div>';
    });
    box.innerHTML = html;
  }

  $("cartItems").addEventListener("click", function (e) {
    var m = e.target.closest("[data-minus]"); var pl = e.target.closest("[data-plus]");
    if (m) removeOne(m.getAttribute("data-minus"));
    if (pl) addOne(pl.getAttribute("data-plus"));
  });

  function openCart() { renderCart(); $("cartSheet").classList.add("open"); }
  function closeCart() { $("cartSheet").classList.remove("open"); }
  $("openCart").addEventListener("click", openCart);
  $("closeCart").addEventListener("click", closeCart);
  $("cartSheet").addEventListener("click", function (e) { if (e.target === this) closeCart(); });

  function calcCambio() {
    var paga = parseFloat($("paga").value);
    var t = cartTotals();
    var el = $("cambio");
    if (!isNaN(paga) && paga > 0) {
      var c = paga - t.total;
      if (c >= 0) el.innerHTML = "Cambio: <b>" + money(c) + "</b>";
      else el.innerHTML = '<span style="color:#c0392b">Falta: <b style="color:#c0392b">' + money(-c) + "</b></span>";
    } else { el.innerHTML = ""; }
  }
  $("paga").addEventListener("input", calcCambio);

  $("clearCart").addEventListener("click", function () {
    cart = {}; $("paga").value = ""; updateBar(); renderCart(); closeCart();
    toast("Venta nueva ✓", "ok");
  });
  $("doneCart").addEventListener("click", function () {
    var t = cartTotals();
    if (t.items === 0) { closeCart(); return; }
    cart = {}; $("paga").value = ""; updateBar(); renderCart(); closeCart();
    toast("✓ Cobrado " + money(t.total), "ok");
  });

  // ---------- COSTO (candado) ----------
  $("lockBtn").addEventListener("click", function () {
    var on = document.body.classList.toggle("show-costo");
    this.classList.toggle("on", on);
    this.innerHTML = on ? "🔓 Costo" : "🔒 Costo";
  });

  // ---------- ESCÁNER ----------
  var scanner = null, lastCode = "", lastTime = 0;
  var scanView = $("scanView");

  var FORMATS = null;
  try {
    if (window.Html5QrcodeSupportedFormats) {
      var F = window.Html5QrcodeSupportedFormats;
      FORMATS = [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.CODABAR];
    }
  } catch (e) {}

  function openScan() {
    scanView.classList.add("open");
    $("scanMsg").textContent = "Iniciando cámara…";
    if (!window.Html5Qrcode) { $("scanMsg").textContent = "No se pudo cargar el lector."; return; }
    scanner = new Html5Qrcode("reader", { formatsToSupport: FORMATS || undefined, verbose: false });
    var config = { fps: 12, qrbox: function (w, h) { var m = Math.min(w, h); return { width: Math.round(Math.min(w * 0.9, 340)), height: Math.round(m * 0.45) }; }, aspectRatio: 1.2 };
    scanner.start({ facingMode: "environment" }, config, onScan, function () {})
      .then(function () { $("scanMsg").textContent = "Apunta al código de barras del producto"; })
      .catch(function (err) {
        var msg = "No pude abrir la cámara.";
        if (("" + err).indexOf("NotAllowed") > -1 || ("" + err).toLowerCase().indexOf("permission") > -1)
          msg = "Necesito permiso para usar la cámara. Actívalo y vuelve a intentar.";
        else if (("" + err).toLowerCase().indexOf("secure") > -1 || location.protocol === "file:")
          msg = "La cámara solo funciona si la app está abierta desde su enlace de internet (no como archivo).";
        $("scanMsg").textContent = msg;
      });
  }

  function onScan(text) {
    var now = Date.now();
    var code = ("" + text).trim();
    if (code === lastCode && (now - lastTime) < 1500) return;
    lastCode = code; lastTime = now;
    var p = byCode[code];
    var msg = $("scanMsg");
    msg.classList.remove("flash"); void msg.offsetWidth; msg.classList.add("flash");
    if (p) {
      addToCart(code, true);
      msg.innerHTML = "✓ " + escapeHtml(p.n) + " — <b>" + (p.v > 0 ? money(p.v) : "sin precio") + "</b>";
      if (navigator.vibrate) navigator.vibrate(60);
    } else {
      msg.innerHTML = '⚠ Código <b>' + escapeHtml(code) + '</b> no está en tu inventario.';
      if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
    }
  }

  function closeScan() {
    if (scanner) {
      scanner.stop().then(function () { scanner.clear(); scanner = null; }).catch(function () { scanner = null; });
    }
    scanView.classList.remove("open");
    lastCode = "";
  }
  $("openScan").addEventListener("click", openScan);
  $("closeScan").addEventListener("click", closeScan);

  // ---------- TOAST ----------
  var toastEl = $("toast"), toastT;
  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = "toast show " + (kind || "");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.className = "toast " + (kind || ""); }, 1600);
  }

  // Estado inicial
  render([], "");
  updateBar();

  // ---------- Service worker (offline) ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
