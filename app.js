/* ===== Mi Punto de Venta — interfaz ===== */
(function () {
  "use strict";

  var VERSION = "2.1";
  var S = window.Store;
  var $ = function (id) { return document.getElementById(id); };

  function norm(s) {
    return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function money(v) {
    var n = Number(v) || 0;
    return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function existTxt(e) {
    var n = Number(e) || 0;
    return (Math.abs(n % 1) < 0.001) ? String(Math.round(n)) : n.toFixed(1);
  }
  function escapeHtml(s) {
    return (s || "").toString().replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var cart = {};   // code -> qty
  var lastTerm = "";

  // ---------- índice de búsqueda ----------
  var index = [];
  function reindex() {
    index = S.all().map(function (p) {
      return { p: p, hay: norm(p.n) + " " + norm(p.c) };
    });
  }

  function search(term) {
    term = norm(term).trim();
    if (!term) return [];
    var words = term.split(/\s+/), res = [];
    for (var i = 0; i < index.length && res.length < 100; i++) {
      var it = index[i], ok = true;
      for (var w = 0; w < words.length; w++) {
        if (it.hay.indexOf(words[w]) === -1) { ok = false; break; }
      }
      if (ok) res.push(it.p);
    }
    return res;
  }

  // ---------- render lista ----------
  function render() {
    var term = lastTerm.trim();
    var list = $("list"), countEl = $("count");
    if (!term) {
      list.innerHTML = '<div class="empty"><b>Escribe el nombre o código</b><br>o toca <b>📷 Escanear</b>.</div>';
      countEl.textContent = "";
      return;
    }
    var items = search(term);
    if (!items.length) {
      list.innerHTML = '<div class="empty">No encontré <b>"' + escapeHtml(term) + '"</b>.<br>' +
        '<button class="minibtn" style="margin-top:14px" id="addFromSearch">＋ Darlo de alta</button></div>';
      countEl.textContent = "";
      var b = $("addFromSearch");
      if (b) b.addEventListener("click", function () { openEdit(null, { n: term }); });
      return;
    }
    countEl.textContent = items.length + (items.length === 100 ? "+ resultados" : (items.length > 1 ? " resultados" : " resultado"));
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
            (p._new ? '<span class="tag nuevo">nuevo</span>' : (p._edit ? '<span class="tag edit">editado</span>' : '')) +
            '<span class="exist' + (cero ? ' cero' : '') + '">Quedan: ' + existTxt(p.e) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="precios">' +
          '<div class="venta">' + (p.v > 0 ? money(p.v) : '<span style="color:#c0392b;font-size:14px;">sin precio</span>') + '</div>' +
          (p.m > 0 ? '<div class="mayoreo">May: ' + money(p.m) + '</div>' : '') +
          '<div class="costo">Costo: ' + money(p.co) + '</div>' +
        '</div>' +
        '<div class="cardbtns">' +
          '<button class="addbtn" data-add="' + escapeHtml(p.c) + '">+</button>' +
          '<button class="editbtn" data-edit="' + escapeHtml(p.c) + '">✏️</button>' +
        '</div>' +
      '</div>';
    }
    list.innerHTML = html;
  }

  var tmr;
  $("q").addEventListener("input", function () {
    clearTimeout(tmr);
    var v = this.value;
    tmr = setTimeout(function () { lastTerm = v; render(); }, 80);
  });

  $("list").addEventListener("click", function (e) {
    var ed = e.target.closest("[data-edit]");
    if (ed) { openEdit(ed.getAttribute("data-edit")); return; }
    var add = e.target.closest("[data-add]");
    if (add) { addToCart(add.getAttribute("data-add")); return; }
    var card = e.target.closest(".card");
    if (card) addToCart(card.getAttribute("data-c"));
  });

  // ---------- carrito ----------
  function addToCart(code, silent) {
    var p = S.get(code);
    if (!p) { toast("Producto no encontrado", "err"); return; }
    cart[code] = (cart[code] || 0) + 1;
    updateBar();
    if (!silent) toast("➕ " + p.n + (p.v > 0 ? "  " + money(p.v) : ""), "ok");
    if (navigator.vibrate) navigator.vibrate(30);
  }
  function cartTotals() {
    var total = 0, items = 0;
    for (var c in cart) {
      var p = S.get(c);
      if (!p) continue;
      total += (Number(p.v) || 0) * cart[c];
      items += cart[c];
    }
    return { total: total, items: items };
  }
  function updateBar() {
    var t = cartTotals(), bar = $("ventaBar");
    if (t.items > 0) {
      bar.classList.remove("hidden");
      $("vbCount").textContent = t.items + (t.items === 1 ? " producto" : " productos");
      $("vbTotal").textContent = money(t.total);
    } else {
      bar.classList.add("hidden");
      closeSheet("cartSheet");
    }
    $("cartTotal").textContent = money(t.total);
    calcCambio();
  }
  function renderCart() {
    var box = $("cartItems"), keys = Object.keys(cart), html = "";
    if (!keys.length) { box.innerHTML = '<div class="empty">Sin productos.<br>Busca o escanea para agregar.</div>'; return; }
    keys.forEach(function (k) {
      var p = S.get(k); if (!p) return;
      var sub = (Number(p.v) || 0) * cart[k];
      html += '<div class="ci">' +
        '<div class="ci-n">' + escapeHtml(p.n) + '<small>' + money(p.v) + ' c/u · quedan ' + existTxt(p.e) + '</small></div>' +
        '<div class="qtybox"><button data-minus="' + escapeHtml(k) + '">−</button><span>' + cart[k] +
        '</span><button data-plus="' + escapeHtml(k) + '">+</button></div>' +
        '<div class="ci-sub">' + money(sub) + '</div></div>';
    });
    box.innerHTML = html;
  }
  $("cartItems").addEventListener("click", function (e) {
    var m = e.target.closest("[data-minus]"), pl = e.target.closest("[data-plus]");
    if (m) { var k = m.getAttribute("data-minus"); cart[k]--; if (cart[k] <= 0) delete cart[k]; updateBar(); renderCart(); }
    if (pl) { var k2 = pl.getAttribute("data-plus"); cart[k2]++; updateBar(); renderCart(); }
  });
  function calcCambio() {
    var paga = parseFloat($("paga").value), t = cartTotals(), el = $("cambio");
    if (!isNaN(paga) && paga > 0) {
      var c = paga - t.total;
      el.innerHTML = (c >= 0) ? "Cambio: <b>" + money(c) + "</b>"
        : '<span style="color:#c0392b">Falta: <b style="color:#c0392b">' + money(-c) + "</b></span>";
    } else el.innerHTML = "";
  }
  $("paga").addEventListener("input", calcCambio);
  $("openCart").addEventListener("click", function () { renderCart(); openSheet("cartSheet"); });
  $("clearCart").addEventListener("click", function () {
    cart = {}; $("paga").value = ""; updateBar(); renderCart(); closeSheet("cartSheet");
    toast("Venta cancelada", "ok");
  });
  $("doneCart").addEventListener("click", function () {
    var t = cartTotals();
    if (t.items === 0) { closeSheet("cartSheet"); return; }
    var items = Object.keys(cart).map(function (k) {
      var p = S.get(k);
      return { c: k, n: p ? p.n : k, q: cart[k], p: p ? p.v : 0 };
    });
    var descontar = S.getConf().autoStock !== false;
    S.registrarVenta(items, t.total, descontar);
    cart = {}; $("paga").value = "";
    updateBar(); renderCart(); closeSheet("cartSheet");
    toast("✓ Cobrado " + money(t.total) + (descontar ? " · inventario actualizado" : ""), "ok");
  });

  // ---------- hojas ----------
  function openSheet(id) { $(id).classList.add("open"); }
  function closeSheet(id) { $(id).classList.remove("open"); }
  document.addEventListener("click", function (e) {
    var c = e.target.closest("[data-close]");
    if (c) closeSheet(c.getAttribute("data-close"));
  });
  ["cartSheet", "editSheet", "cajaSheet", "cfgSheet"].forEach(function (id) {
    $(id).addEventListener("click", function (e) { if (e.target === this) closeSheet(id); });
  });

  // ---------- editar / nuevo producto ----------
  var editingCode = null;

  function openEdit(code, prefill) {
    editingCode = code;
    var esNuevo = !code;
    $("editTitle").textContent = esNuevo ? "＋ Nuevo producto" : "✏️ Editar producto";
    $("wrap_c").style.display = esNuevo ? "block" : "none";
    $("restProd").style.display = esNuevo ? "none" : "";
    $("delProd").style.display = esNuevo ? "none" : "";

    var p = esNuevo ? { n: (prefill && prefill.n) || "", c: "", v: "", m: "", co: "", e: "", d: "Nuevos" } : S.get(code);
    if (!p) { toast("No encontré ese producto", "err"); return; }
    $("f_n").value = p.n || "";
    $("f_c").value = esNuevo ? "" : p.c;
    $("f_v").value = esNuevo ? "" : p.v;
    $("f_m").value = esNuevo ? "" : p.m;
    $("f_co").value = esNuevo ? "" : p.co;
    $("f_e").value = esNuevo ? "" : p.e;
    $("f_d").value = p.d || "";

    var note = $("editNote");
    if (esNuevo) {
      note.innerHTML = '<div class="okbox">Si el producto tiene código de barras, escanéalo o escríbelo para poder buscarlo con la cámara. Si no tiene, déjalo vacío y le pongo una clave.</div>';
    } else if (S.isEdited(code)) {
      note.innerHTML = '<div class="okbox">Este producto ya lo modificaste. Tus cambios se conservan aunque se actualice la app.</div>';
    } else note.innerHTML = "";
    openSheet("editSheet");
  }

  $("newProdBtn").addEventListener("click", function () { openEdit(null); });

  $("saveProd").addEventListener("click", function () {
    var f = {
      n: $("f_n").value, v: $("f_v").value, m: $("f_m").value,
      co: $("f_co").value, e: $("f_e").value, d: $("f_d").value
    };
    if (!String(f.n).trim()) { toast("Ponle nombre al producto", "err"); return; }
    if (editingCode) {
      S.updateProduct(editingCode, f);
      toast("✓ Guardado", "ok");
    } else {
      f.c = $("f_c").value;
      var r = S.addProduct(f);
      if (r.error) { toast(r.error, "err"); return; }
      toast("✓ Producto agregado", "ok");
      lastTerm = String(f.n).trim();
      $("q").value = lastTerm;
    }
    closeSheet("editSheet");
    render();
  });

  $("restProd").addEventListener("click", function () {
    if (!editingCode) return;
    if (S.restoreProduct(editingCode)) { toast("↩ Restaurado al original", "ok"); closeSheet("editSheet"); render(); }
    else toast("Este producto no tiene cambios", "err");
  });

  $("delProd").addEventListener("click", function () {
    if (!editingCode) return;
    var p = S.get(editingCode);
    if (!confirm('¿Quitar "' + (p ? p.n : editingCode) + '" de tu lista?\n\nPuedes recuperarlo después desde ⚙️ Ajustes.')) return;
    S.deleteProduct(editingCode);
    delete cart[editingCode];
    closeSheet("editSheet"); updateBar(); render();
    toast("Producto quitado", "ok");
  });

  // ---------- corte del día ----------
  $("cajaBtn").addEventListener("click", function () {
    var v = S.ventasDeHoy();
    var html = '<div class="statline"><span>Ventas hechas</span><b>' + v.n + '</b></div>' +
      '<div class="statline"><span>Piezas vendidas</span><b>' + v.piezas + '</b></div>' +
      '<div class="statline"><span>Total cobrado</span><b style="color:#0d6e5a;font-size:19px">' + money(v.total) + '</b></div>';
    if (v.list.length) {
      html += '<div style="margin-top:16px; font-size:13px; color:#6b7a77; font-weight:700">DETALLE</div>';
      v.list.slice().reverse().forEach(function (s) {
        var h = new Date(s.t);
        var hora = ("0" + h.getHours()).slice(-2) + ":" + ("0" + h.getMinutes()).slice(-2);
        html += '<div class="ci" style="margin-top:8px"><div class="ci-n">' + hora + ' — ' +
          s.items.length + (s.items.length === 1 ? " producto" : " productos") +
          '<small>' + escapeHtml(s.items.map(function (i) { return i.n + " x" + i.q; }).join(", ").slice(0, 90)) + '</small></div>' +
          '<div class="ci-sub">' + money(s.total) + '</div></div>';
      });
    } else {
      html += '<div class="empty">Todavía no hay ventas hoy.</div>';
    }
    $("cajaBody").innerHTML = html;
    openSheet("cajaSheet");
  });

  // ---------- ajustes / nube ----------
  function renderCfg() {
    var c = S.getConf();
    var st = S.sync.get();
    var edits = S.countEdits();
    var ult = c.lastSync ? new Date(c.lastSync).toLocaleString("es-MX") : "nunca";
    var html = "";

    html += '<div class="statline"><span>Versión de la app</span><b>' + VERSION + '</b></div>' +
            '<div class="statline"><span>Mis cambios guardados</span><b>' + edits + '</b></div>' +
            '<div class="statline"><span>Última sincronización</span><b style="font-size:12.5px">' + ult + '</b></div>' +
            '<div class="statline"><span>Estado</span><b style="font-size:12.5px">' + escapeHtml(st.msg) + '</b></div>';

    html += '<div style="margin-top:18px; font-weight:700; font-size:14px">☁️ Guardar en la nube</div>' +
      '<div class="hint" style="margin-top:6px">Tus cambios se guardan siempre en este celular. Con la nube además se copian a tu cuenta de GitHub, y así los ves en otro celular o en la compu.</div>';

    if (!c.token) {
      html += '<div class="warn"><b>Cómo activarla (una sola vez):</b><ol class="pasos" style="margin-top:8px">' +
        '<li>En la compu entra a <code>github.com/settings/tokens</code></li>' +
        '<li>Botón <b>Generate new token</b> → <b>classic</b></li>' +
        '<li>Nombre: <code>punto de venta</code>, expiración: <b>No expiration</b></li>' +
        '<li>Marca <b>solo</b> la casilla <code>gist</code></li>' +
        '<li><b>Generate token</b> y copia el texto que empieza con <code>ghp_</code></li>' +
        '<li>Pégalo aquí abajo</li></ol>' +
        'Marca únicamente <code>gist</code>: así ese permiso no puede tocar nada más de tu cuenta.</div>';
    }

    html += '<div class="field"><label>Token de GitHub (empieza con ghp_)</label>' +
      '<input id="f_token" type="password" placeholder="ghp_…" value="' + escapeHtml(c.token || "") + '"></div>' +
      '<div class="btnrow" style="margin-bottom:18px">' +
      '<button class="b-save" id="saveToken">Guardar y sincronizar</button>' +
      (c.token ? '<button class="b-rest" id="syncNow">🔄 Sincronizar ahora</button>' : '') +
      '</div>';

    html += '<div style="margin-top:6px; font-weight:700; font-size:14px">🧮 Al cobrar una venta</div>';
    html += '<div class="btnrow" style="margin-top:8px; margin-bottom:18px">' +
      '<button class="' + (c.autoStock !== false ? 'b-save' : 'b-rest') + '" id="toggleStock">' +
      (c.autoStock !== false ? '✓ Descontar del inventario' : '✗ No descontar') + '</button></div>';

    html += '<div style="margin-top:6px; font-weight:700; font-size:14px">🔄 Actualizar la app</div>' +
      '<div class="hint" style="margin-top:6px">Si Claude publicó mejoras y no las ves, toca aquí (necesitas señal). Tus cambios NO se borran.</div>' +
      '<div class="btnrow" style="margin-bottom:18px"><button class="b-save" id="forceUpdate">⬇️ Buscar actualización</button></div>';

    html += '<div style="margin-top:6px; font-weight:700; font-size:14px">🧹 Mantenimiento</div>' +
      '<div class="btnrow" style="margin-top:8px">' +
      '<button class="b-rest" id="verBorrados">Ver productos quitados</button>' +
      '<button class="b-del" id="wipe">Borrar todos mis cambios</button></div>' +
      '<div class="hint" style="margin-top:10px">"Borrar todos mis cambios" deja el inventario tal cual venía de eleventa. No se puede deshacer.</div>';

    $("cfgBody").innerHTML = html;

    $("saveToken").addEventListener("click", function () {
      var t = $("f_token").value.trim();
      S.setConf({ token: t });
      if (!t) { toast("Nube desactivada", "ok"); renderCfg(); return; }
      toast("Conectando…", "ok");
      S.sync.run(true).then(function (ok) {
        toast(ok ? "☁️ Conectado y guardado" : S.sync.get().msg, ok ? "ok" : "err");
        renderCfg();
      });
    });
    var sn = $("syncNow");
    if (sn) sn.addEventListener("click", function () {
      toast("Sincronizando…", "ok");
      S.sync.run(true).then(function (ok) { toast(ok ? "☁️ Al día" : S.sync.get().msg, ok ? "ok" : "err"); renderCfg(); });
    });
    $("forceUpdate").addEventListener("click", function () {
      toast("Buscando actualización…", "ok");
      var done = function () { location.reload(true); };
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (rs) {
          return Promise.all(rs.map(function (r) { return r.unregister(); }));
        }).then(function () {
          if (window.caches && caches.keys) {
            return caches.keys().then(function (ks) {
              return Promise.all(ks.map(function (k) { return caches.delete(k); }));
            });
          }
        }).then(done).catch(done);
      } else done();
    });
    $("toggleStock").addEventListener("click", function () {
      S.setConf({ autoStock: !(S.getConf().autoStock !== false) });
      renderCfg();
    });
    $("wipe").addEventListener("click", function () {
      if (!confirm("¿Borrar TODOS tus cambios (precios editados, productos nuevos, existencias y ventas)?\n\nEsto no se puede deshacer.")) return;
      S.borrarMisCambios(); reindex(); render(); renderCfg();
      toast("Cambios borrados", "ok");
    });
    $("verBorrados").addEventListener("click", function () {
      var ov = S.exportOverlay(), dels = [];
      for (var k in ov.items) if (ov.items[k]._del) dels.push(k);
      if (!dels.length) { toast("No has quitado ningún producto", "ok"); return; }
      var h = '<div style="font-weight:700;margin-bottom:10px">Productos quitados (' + dels.length + ')</div>';
      dels.forEach(function (k) {
        var bp = S.baseOf(k);
        h += '<div class="ci"><div class="ci-n">' + escapeHtml(bp ? bp.n : k) + '<small>' + escapeHtml(k) + '</small></div>' +
          '<button class="minibtn" data-restore="' + escapeHtml(k) + '">Recuperar</button></div>';
      });
      h += '<div class="btnrow" style="margin-top:14px"><button class="b-rest" id="volverCfg">← Volver</button></div>';
      $("cfgBody").innerHTML = h;
      $("volverCfg").addEventListener("click", renderCfg);
      $("cfgBody").querySelectorAll("[data-restore]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          S.restoreProduct(btn.getAttribute("data-restore"));
          toast("Producto recuperado", "ok");
          render(); renderCfg();
        });
      });
    });
  }
  $("cfgBtn").addEventListener("click", function () { renderCfg(); openSheet("cfgSheet"); });

  // ---------- costo ----------
  $("lockBtn").addEventListener("click", function () {
    var on = document.body.classList.toggle("show-costo");
    this.classList.toggle("on", on);
    this.textContent = on ? "🔓" : "🔒";
  });

  // ---------- escáner ----------
  var scanner = null, lastCode = "", lastTime = 0;
  var FORMATS = null;
  try {
    if (window.Html5QrcodeSupportedFormats) {
      var F = window.Html5QrcodeSupportedFormats;
      FORMATS = [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.CODABAR, F.QR_CODE];
    }
  } catch (e) {}

  $("openScan").addEventListener("click", function () {
    $("scanView").classList.add("open");
    $("scanMsg").textContent = "Iniciando cámara…";
    if (!window.Html5Qrcode) { $("scanMsg").textContent = "No se pudo cargar el lector."; return; }
    scanner = new Html5Qrcode("reader", { formatsToSupport: FORMATS || undefined, verbose: false });
    var config = {
      fps: 12,
      qrbox: function (w, h) { var m = Math.min(w, h); return { width: Math.round(Math.min(w * 0.9, 340)), height: Math.round(m * 0.45) }; },
      aspectRatio: 1.2
    };
    scanner.start({ facingMode: "environment" }, config, onScan, function () {})
      .then(function () { $("scanMsg").textContent = "Apunta al código de barras"; })
      .catch(function (err) {
        var s = "" + err, msg = "No pude abrir la cámara.";
        if (s.indexOf("NotAllowed") > -1 || s.toLowerCase().indexOf("permission") > -1)
          msg = "Necesito permiso para la cámara. Actívalo y vuelve a intentar.";
        else if (location.protocol === "file:")
          msg = "La cámara solo funciona desde el enlace de internet.";
        $("scanMsg").textContent = msg;
      });
  });

  function onScan(text) {
    var code = ("" + text).trim(), t = Date.now();
    if (code === lastCode && (t - lastTime) < 1500) return;
    lastCode = code; lastTime = t;
    var p = S.get(code), msg = $("scanMsg");
    msg.classList.remove("flash"); void msg.offsetWidth; msg.classList.add("flash");
    if (p) {
      addToCart(code, true);
      msg.innerHTML = "✓ " + escapeHtml(p.n) + " — <b>" + (p.v > 0 ? money(p.v) : "sin precio") + "</b>";
      if (navigator.vibrate) navigator.vibrate(60);
    } else {
      msg.innerHTML = '⚠ Código <b>' + escapeHtml(code) + '</b> no está en tu inventario. ' +
        '<button class="minibtn" id="altaScan" style="margin-left:6px">＋ Darlo de alta</button>';
      var b = $("altaScan");
      if (b) b.addEventListener("click", function () {
        closeScan();
        openEdit(null, {});
        $("f_c").value = code;
      });
      if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
    }
  }
  function closeScan() {
    if (scanner) { scanner.stop().then(function () { scanner.clear(); scanner = null; }).catch(function () { scanner = null; }); }
    $("scanView").classList.remove("open");
    lastCode = "";
  }
  $("closeScan").addEventListener("click", closeScan);

  // ---------- toast ----------
  var toastEl = $("toast"), toastT;
  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = "toast show " + (kind || "");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.className = "toast " + (kind || ""); }, 1700);
  }

  // ---------- encabezado ----------
  function updateHeader() {
    var n = S.all().length, st = S.sync.get(), c = S.getConf();
    var estado = c.token ? st.msg : "guardado en este celular";
    $("hsub").innerHTML = '<span class="sync-dot ' + (c.token ? st.status : "offline") + '"></span>' +
      n.toLocaleString("es-MX") + " productos · " + escapeHtml(estado);
  }

  // ---------- reaccionar a cambios ----------
  S.onChange(function (what) {
    if (what === "data") { reindex(); render(); }
    updateHeader();
    if ($("cfgSheet").classList.contains("open") && (what === "sync" || what === "conf")) {
      // refresco suave del estado sin perder lo escrito
      var st = S.sync.get();
      var stEl = $("cfgBody") && $("cfgBody").querySelectorAll(".statline b")[2];
      if (stEl) stEl.textContent = st.msg;
    }
  });

  // ---------- arranque ----------
  reindex();
  render();
  updateBar();
  updateHeader();

  if (S.getConf().token) { S.sync.run(false); }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }

  // expuesto para pruebas
  window.__pos = { addToCart: addToCart, cart: function () { return cart; }, render: render, openEdit: openEdit };
})();
