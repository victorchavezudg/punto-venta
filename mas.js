/* ===== Pantallas extra: Fiados, Apartados, Turno, Reportes, Inventario físico ===== */
window.Mas = (function () {
  "use strict";

  var S = window.Store, U = window.UI;
  var $ = function (id) { return document.getElementById(id); };
  var money = U.money, esc = U.escapeHtml, toast = U.toast;

  var pila = [];   // para el botón "‹" de regresar

  function fecha(ts) {
    var d = new Date(ts), z = function (n) { return ("0" + n).slice(-2); };
    return z(d.getDate()) + "/" + z(d.getMonth() + 1) + " " + z(d.getHours()) + ":" + z(d.getMinutes());
  }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

  // ---------- panel genérico ----------
  function panel(titulo, html, foot, volver) {
    $("panelTitle").textContent = titulo;
    $("panelBody").innerHTML = html;
    var f = $("panelFoot");
    if (foot) { f.innerHTML = foot; f.style.display = "block"; }
    else { f.innerHTML = ""; f.style.display = "none"; }
    $("panelBack").style.display = volver ? "" : "none";
    $("panelBack").onclick = volver || null;
    $("panelBody").scrollTop = 0;
    U.openSheet("panelSheet");
  }
  function on(sel, ev, fn) {
    var root = document.getElementById("panelSheet");
    root.querySelectorAll(sel).forEach(function (el) { el.addEventListener(ev, fn); });
  }
  function vacio(msg) { return '<div class="empty">' + msg + '</div>'; }

  function chipsFormas(id, actual) {
    var f = ["efectivo", "transferencia", "tarjeta"];
    return '<div class="chips" id="' + id + '">' + f.map(function (x) {
      return '<button class="chip' + (x === (actual || "efectivo") ? " activo" : "") +
        '" data-f="' + x + '">' + esc(S.NOMBRE_FORMA[x]) + '</button>';
    }).join("") + '</div>';
  }
  function leerChips(id) {
    var a = $(id) && $(id).querySelector(".chip.activo");
    return a ? a.getAttribute("data-f") : "efectivo";
  }
  function activarChips(id) {
    var box = $(id); if (!box) return;
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-f],[data-p]");
      if (!b) return;
      box.querySelectorAll(".chip").forEach(function (x) { x.classList.remove("activo"); });
      b.classList.add("activo");
      if (box.getAttribute("data-onchange") === "reporte") verReportes(b.getAttribute("data-p"));
    });
  }

  // =====================================================================
  //                            MENÚ
  // =====================================================================
  function abrirMenu() {
    var porCobrar = S.totalPorCobrar();
    var aps = S.listaApartados("abierto");
    var turno = S.turnoActivo();
    var conteo = S.conteoActivo();
    var hoy = S.reportePeriodo("hoy");

    var h = "";
    h += item("turno", turno ? "🟢" : "🧾", "Turno de caja",
      turno ? ("Abierto por " + (turno.usr || "sin nombre")) : "Cerrado · toca para abrir",
      turno ? "Abierto" : "", turno ? "" : "amar");
    h += item("fiados", "🤝", "Fiados (créditos)",
      porCobrar > 0 ? "Te deben en total" : "Sin deudas pendientes",
      porCobrar > 0 ? money(porCobrar) : "", "rojo");
    h += item("apartados", "🎁", "Apartados",
      aps.length ? aps.length + " apartado(s) pendiente(s)" : "Sin apartados pendientes",
      aps.length ? String(aps.length) : "", "amar");
    h += item("reportes", "📈", "Reportes y ganancias",
      "Hoy llevas " + money(hoy.total) + " · ganancia " + money(hoy.ganancia), "", "");
    h += item("inventario", "📋", "Inventario físico",
      conteo ? ("Conteo en curso: " + Object.keys(conteo.items).length + " productos")
             : "Contar mercancía y ver faltantes",
      conteo ? "En curso" : "", "amar");
    h += item("resurtir", "📦", "Por resurtir",
      "Lo que se agotó o está por acabarse", "", "");

    $("menuBody").innerHTML = h;
    $("menuBody").querySelectorAll("[data-go]").forEach(function (b) {
      b.addEventListener("click", function () {
        U.closeSheet("menuSheet");
        var d = b.getAttribute("data-go");
        if (d === "turno") verTurno();
        if (d === "fiados") verFiados();
        if (d === "apartados") verApartados();
        if (d === "reportes") verReportes("hoy");
        if (d === "inventario") verInventario();
        if (d === "resurtir") verResurtir();
      });
    });
    U.openSheet("menuSheet");
  }

  function item(go, ico, tit, sub, bad, cls) {
    return '<button class="menu-item" data-go="' + go + '">' +
      '<span class="mi-ico">' + ico + '</span>' +
      '<span class="mi-txt"><span class="mi-tit">' + esc(tit) + '</span>' +
      '<span class="mi-sub">' + esc(sub) + '</span></span>' +
      (bad ? '<span class="mi-bad ' + (cls || "") + '">' + esc(bad) + '</span>' : '') +
      '</button>';
  }

  // =====================================================================
  //                            FIADOS
  // =====================================================================
  function verFiados() {
    var cl = S.listaClientes();
    var deben = cl.filter(function (c) { return c.saldo > 0; });
    var total = S.totalPorCobrar();

    var h = '<div class="kpi">' +
      '<div><div class="k-lbl">Te deben</div><div class="k-val rojo">' + money(total) + '</div></div>' +
      '<div><div class="k-lbl">Clientes con deuda</div><div class="k-val">' + deben.length + '</div></div>' +
      '</div>';
    h += '<div class="btnrow" style="margin-bottom:14px"><button class="b-save" id="nuevoCli">＋ Nuevo cliente</button></div>';

    if (!cl.length) h += vacio("Todavía no tienes clientes.<br>Dálos de alta para poder fiarles.");
    else {
      h += '<div style="font-size:12.5px;color:#6b7a77;font-weight:700;margin-bottom:8px">CLIENTES</div>';
      cl.forEach(function (c) {
        h += '<div class="row-item" data-cli="' + esc(c.id) + '">' +
          '<div class="ri-t"><div class="ri-n">' + esc(c.n) + '</div>' +
          '<div class="ri-s">' + (c.tel ? esc(c.tel) + " · " : "") +
          (c.lim > 0 ? "límite " + money(c.lim) : "sin límite") + '</div></div>' +
          '<div class="ri-v ' + (c.saldo > 0 ? "rojo" : "verde") + '">' +
          (c.saldo > 0 ? money(c.saldo) : "al corriente") + '</div></div>';
      });
    }
    panel("🤝 Fiados", h);
    $("nuevoCli").addEventListener("click", function () { formCliente(null); });
    on("[data-cli]", "click", function (e) {
      verCliente(e.currentTarget.getAttribute("data-cli"));
    });
  }

  function formCliente(id) {
    var c = id ? S.getCliente(id) : { n: "", tel: "", lim: 0 };
    var h = '<div class="field"><label>Nombre del cliente</label><input id="c_n" type="text" value="' + esc(c.n || "") + '"></div>' +
      '<div class="field"><label>Teléfono (opcional)</label><input id="c_tel" type="tel" inputmode="tel" value="' + esc(c.tel || "") + '"></div>' +
      '<div class="field"><label>Límite de crédito (0 = sin límite)</label><input id="c_lim" type="number" inputmode="decimal" value="' + (c.lim || "") + '"></div>' +
      '<div class="hint">El límite solo te avisa cuando el cliente se pasa; tú decides si le fías de todos modos.</div>';
    var foot = '<div class="btnrow"><button class="b-save" id="cliGuardar">✓ Guardar</button>' +
      (id ? '<button class="b-del" id="cliBorrar">🗑 Borrar</button>' : '') + '</div>';
    panel(id ? "✏️ Editar cliente" : "＋ Nuevo cliente", h, foot, verFiados);

    $("cliGuardar").addEventListener("click", function () {
      var f = { n: $("c_n").value, tel: $("c_tel").value, lim: $("c_lim").value };
      var r = id ? S.updateCliente(id, f) : S.addCliente(f);
      if (r.error) { toast(r.error, "err"); return; }
      toast("Cliente guardado ✓", "ok");
      verFiados();
    });
    if (id) $("cliBorrar").addEventListener("click", function () {
      if (!confirm("¿Borrar a " + c.n + "?")) return;
      var r = S.deleteCliente(id);
      if (r.error) { toast(r.error, "err"); return; }
      toast("Cliente borrado", "ok"); verFiados();
    });
  }

  function verCliente(id) {
    var c = S.getCliente(id);
    if (!c) { toast("No encontré ese cliente", "err"); return; }
    var mov = S.movimientosCliente(id);

    var h = '<div class="kpi"><div><div class="k-lbl">Debe</div>' +
      '<div class="k-val ' + (c.saldo > 0 ? "rojo" : "") + '">' + money(c.saldo) + '</div></div>' +
      (c.lim > 0 ? '<div><div class="k-lbl">Límite</div><div class="k-val">' + money(c.lim) + '</div></div>' : '') +
      '</div>';
    if (c.tel) h += '<div class="hint" style="margin-top:-4px">📞 ' + esc(c.tel) + '</div>';
    h += '<div class="btnrow" style="margin:12px 0 16px">' +
      '<button class="b-rest" id="editCli">✏️ Editar</button>' +
      (c.saldo > 0 ? '<button class="b-save" id="abonarCli">💵 Abonar</button>' : '') + '</div>';

    if (!mov.length) h += vacio("Este cliente no tiene movimientos.");
    else {
      h += '<div style="font-size:12.5px;color:#6b7a77;font-weight:700;margin-bottom:8px">ESTADO DE CUENTA</div>';
      mov.slice().reverse().forEach(function (m) {
        h += '<div class="row-item"><div class="ri-t">' +
          '<div class="ri-n">' + (m.tipo === "cargo" ? "🛒 " : "💵 ") + esc(m.concepto) + '</div>' +
          '<div class="ri-s">' + fecha(m.t) + ' · saldo ' + money(m.saldo) + '</div></div>' +
          '<div class="ri-v ' + (m.tipo === "cargo" ? "rojo" : "verde") + '">' +
          (m.tipo === "cargo" ? "+" : "−") + money(m.monto) + '</div></div>';
      });
    }
    panel("👤 " + c.n, h, null, verFiados);
    $("editCli").addEventListener("click", function () { formCliente(id); });
    var ab = $("abonarCli");
    if (ab) ab.addEventListener("click", function () { formAbono(c); });
  }

  function formAbono(c) {
    var h = '<div class="okbox">' + esc(c.n) + ' debe <b>' + money(c.saldo) + '</b></div>' +
      '<div class="field"><label>¿Cuánto abona?</label>' +
      '<input id="ab_m" type="number" inputmode="decimal" placeholder="0.00"></div>' +
      '<div class="btnrow" style="margin-bottom:14px">' +
      '<button class="b-rest" id="abTodo">Liquidar todo (' + money(c.saldo) + ')</button></div>' +
      '<label style="font-size:12.5px;color:#6b7a77;font-weight:600">¿Cómo te paga?</label>' +
      chipsFormas("ab_forma") +
      '<div class="field"><label>Nota (opcional)</label><input id="ab_nota" type="text" placeholder="Ej. abono del sábado"></div>';
    var foot = '<div class="btnrow"><button class="b-save" id="abGuardar">✓ Registrar abono</button></div>';
    panel("💵 Abono de " + c.n, h, foot, function () { verCliente(c.id); });
    activarChips("ab_forma");
    $("abTodo").addEventListener("click", function () { $("ab_m").value = c.saldo; });
    $("abGuardar").addEventListener("click", function () {
      var r = S.registrarAbono({
        cli: c.id, monto: $("ab_m").value,
        forma: leerChips("ab_forma"), nota: $("ab_nota").value
      });
      if (r.error) { toast(r.error, "err"); return; }
      toast("Abono registrado ✓", "ok");
      verCliente(c.id);
    });
  }

  // Selector de cliente para la venta a crédito
  function elegirCliente(cb) {
    var cl = S.listaClientes();
    var h = '<div class="btnrow" style="margin-bottom:14px"><button class="b-save" id="cliRapido">＋ Cliente nuevo</button></div>';
    if (!cl.length) h += vacio("No tienes clientes todavía.<br>Da de alta uno para poder fiarle.");
    cl.forEach(function (c) {
      h += '<div class="row-item" data-pick="' + esc(c.id) + '">' +
        '<div class="ri-t"><div class="ri-n">' + esc(c.n) + '</div>' +
        '<div class="ri-s">' + (c.tel ? esc(c.tel) : "sin teléfono") + '</div></div>' +
        '<div class="ri-v ' + (c.saldo > 0 ? "rojo" : "verde") + '">' +
        (c.saldo > 0 ? "debe " + money(c.saldo) : "al corriente") + '</div></div>';
    });
    panel("👤 Elegir cliente", h);
    on("[data-pick]", "click", function (e) {
      var c = S.getCliente(e.currentTarget.getAttribute("data-pick"));
      U.closeSheet("panelSheet");
      if (cb) cb(c);
    });
    $("cliRapido").addEventListener("click", function () {
      var h2 = '<div class="field"><label>Nombre del cliente</label><input id="c_n" type="text"></div>' +
        '<div class="field"><label>Teléfono (opcional)</label><input id="c_tel" type="tel" inputmode="tel"></div>' +
        '<div class="field"><label>Límite de crédito (0 = sin límite)</label><input id="c_lim" type="number" inputmode="decimal"></div>';
      panel("＋ Cliente nuevo", h2,
        '<div class="btnrow"><button class="b-save" id="cliGuardar2">✓ Guardar y elegir</button></div>',
        function () { elegirCliente(cb); });
      $("cliGuardar2").addEventListener("click", function () {
        var r = S.addCliente({ n: $("c_n").value, tel: $("c_tel").value, lim: $("c_lim").value });
        if (r.error) { toast(r.error, "err"); return; }
        U.closeSheet("panelSheet");
        toast("Cliente guardado ✓", "ok");
        if (cb) cb(S.getCliente(r.id));
      });
    });
  }

  // =====================================================================
  //                           APARTADOS
  // =====================================================================
  function nuevoApartado(items, total, cliente, alTerminar) {
    var h = '<div class="okbox">' + items.length + ' producto(s) · total <b>' + money(total) + '</b></div>';
    items.forEach(function (i) {
      h += '<div class="row-item"><div class="ri-t"><div class="ri-n">' + esc(i.n) + '</div>' +
        '<div class="ri-s">' + i.q + ' x ' + money(i.p) + '</div></div>' +
        '<div class="ri-v">' + money(i.q * i.p) + '</div></div>';
    });
    h += '<div class="field" style="margin-top:14px"><label>¿A nombre de quién?</label>' +
      '<input id="ap_nom" type="text" value="' + esc(cliente ? cliente.n : "") + '" placeholder="Nombre del cliente"></div>' +
      '<div class="field"><label>Teléfono (para avisarle)</label>' +
      '<input id="ap_tel" type="tel" inputmode="tel" value="' + esc(cliente ? cliente.tel : "") + '"></div>' +
      '<div class="field"><label>Anticipo que deja ahora</label>' +
      '<input id="ap_ant" type="number" inputmode="decimal" placeholder="0.00"></div>' +
      chipsFormas("ap_forma") +
      '<div class="hint">La mercancía apartada se reserva: deja de contar como disponible hasta que la entregues o canceles.</div>';
    var foot = '<div class="btnrow"><button class="b-save" id="apGuardar">🎁 Apartar</button></div>';
    panel("🎁 Nuevo apartado", h, foot);
    activarChips("ap_forma");
    $("apGuardar").addEventListener("click", function () {
      var nom = $("ap_nom").value.trim();
      if (!nom) { toast("Ponle nombre al apartado", "err"); return; }
      var r = S.crearApartado({
        cli: cliente ? cliente.id : null, nombre: nom, tel: $("ap_tel").value,
        items: items, total: total, anticipo: $("ap_ant").value, forma: leerChips("ap_forma")
      });
      if (r.error) { toast(r.error, "err"); return; }
      U.closeSheet("panelSheet");
      toast("Apartado guardado ✓", "ok");
      if (alTerminar) alTerminar();
    });
  }

  function verApartados(filtro) {
    filtro = filtro || "abierto";
    var lista = S.listaApartados(filtro === "todos" ? null : filtro);
    var abiertos = S.listaApartados("abierto");
    var porCobrar = abiertos.reduce(function (a, x) { return a + x.saldo; }, 0);

    var h = '<div class="kpi">' +
      '<div><div class="k-lbl">Pendientes</div><div class="k-val">' + abiertos.length + '</div></div>' +
      '<div><div class="k-lbl">Por cobrar</div><div class="k-val azul">' + money(porCobrar) + '</div></div></div>';
    h += '<div class="chips" id="apFiltro">' +
      ['abierto', 'entregado', 'cancelado', 'todos'].map(function (f) {
        var nom = { abierto: "Pendientes", entregado: "Entregados", cancelado: "Cancelados", todos: "Todos" }[f];
        return '<button class="chip' + (f === filtro ? " activo" : "") + '" data-ap="' + f + '">' + nom + '</button>';
      }).join("") + '</div>';

    if (!lista.length) h += vacio("No hay apartados aquí.<br>Para crear uno: arma la venta y toca <b>🎁 Apartar</b>.");
    lista.forEach(function (ap) {
      h += '<div class="row-item" data-verap="' + esc(ap.id) + '">' +
        '<div class="ri-t"><div class="ri-n">' + esc(ap.nombre) +
        ' <span class="badge ' + ap.estado + '">' + ap.estado + '</span></div>' +
        '<div class="ri-s">' + fecha(ap.t) + ' · ' + ap.items.length + ' producto(s)' +
        (ap.tel ? " · " + esc(ap.tel) : "") + '</div></div>' +
        '<div class="ri-v">' + money(ap.total) +
        (ap.estado === "abierto" ? '<div class="ri-s" style="color:#c0392b">falta ' + money(ap.saldo) + '</div>' : '') +
        '</div></div>';
    });
    panel("🎁 Apartados", h);
    $("apFiltro").addEventListener("click", function (e) {
      var b = e.target.closest("[data-ap]");
      if (b) verApartados(b.getAttribute("data-ap"));
    });
    on("[data-verap]", "click", function (e) { verApartado(e.currentTarget.getAttribute("data-verap")); });
  }

  function verApartado(id) {
    var ap = S.listaApartados().filter(function (x) { return x.id === id; })[0];
    if (!ap) { toast("No encontré ese apartado", "err"); return; }

    var h = '<div class="kpi">' +
      '<div><div class="k-lbl">Total</div><div class="k-val">' + money(ap.total) + '</div></div>' +
      '<div><div class="k-lbl">Abonado</div><div class="k-val verde">' + money(ap.abonado) + '</div></div>' +
      '<div><div class="k-lbl">Falta</div><div class="k-val rojo">' + money(ap.saldo) + '</div></div></div>';
    h += '<div class="hint">Folio ' + esc(ap.folio || "—") + ' · ' + fecha(ap.t) +
      (ap.tel ? ' · 📞 ' + esc(ap.tel) : '') + ' · <b>' + ap.estado + '</b></div>';
    h += '<div style="font-size:12.5px;color:#6b7a77;font-weight:700;margin:14px 0 8px">MERCANCÍA</div>';
    ap.items.forEach(function (i) {
      h += '<div class="row-item"><div class="ri-t"><div class="ri-n">' + esc(i.n) + '</div>' +
        '<div class="ri-s">' + i.q + ' x ' + money(i.p) + '</div></div>' +
        '<div class="ri-v">' + money(i.q * i.p) + '</div></div>';
    });

    var foot = "";
    if (ap.estado === "abierto") {
      h += '<div class="field" style="margin-top:16px"><label>Registrar abono</label>' +
        '<input id="ap_ab" type="number" inputmode="decimal" placeholder="0.00"></div>' +
        chipsFormas("ap_abforma");
      foot = '<div class="btnrow">' +
        '<button class="b-rest" id="apAbonar">💵 Abonar</button>' +
        '<button class="b-save" id="apEntregar">✓ Entregar</button></div>' +
        '<div class="btnrow" style="margin-top:8px"><button class="b-del" id="apCancelar">✕ Cancelar apartado</button></div>';
    }
    panel("🎁 " + ap.nombre, h, foot, verApartados);

    if (ap.estado === "abierto") {
      activarChips("ap_abforma");
      $("apAbonar").addEventListener("click", function () {
        var r = S.abonarApartado(id, $("ap_ab").value, leerChips("ap_abforma"));
        if (r.error) { toast(r.error, "err"); return; }
        toast("Abono registrado ✓", "ok");
        verApartado(id);
      });
      $("apEntregar").addEventListener("click", function () {
        var falta = S.saldoApartado(id);
        if (falta > 0 && !confirm("Falta " + money(falta) + " por pagar.\n\n¿Los está liquidando ahora para llevárselo?")) return;
        var r = S.entregarApartado(id, leerChips("ap_abforma"));
        if (r.error) { toast(r.error, "err"); return; }
        toast("Entregado ✓ La venta quedó registrada", "ok");
        verApartados();
      });
      $("apCancelar").addEventListener("click", function () {
        var ab = S.abonadoApartado(id);
        var msg = "¿Cancelar este apartado?\n\nLa mercancía regresa al inventario.";
        if (ab > 0) msg += "\n\nEl cliente había abonado " + money(ab) + ".";
        if (!confirm(msg)) return;
        var dev = ab > 0 ? confirm("¿Le devolviste sus " + money(ab) + "?") : false;
        var r = S.cancelarApartado(id, dev);
        if (r.error) { toast(r.error, "err"); return; }
        toast("Apartado cancelado", "ok");
        verApartados();
      });
    }
  }

  // =====================================================================
  //                             TURNO
  // =====================================================================
  function verTurno() {
    var t = S.turnoActivo();
    var conf = S.getConf();
    if (!t) {
      var h = '<div class="hint">Abre turno al empezar el día. Así sabes cuánto dinero debe haber en la caja al cerrar, y quién hizo cada venta.</div>' +
        '<div class="field"><label>¿Quién va a vender en este celular?</label>' +
        '<input id="t_usr" type="text" value="' + esc(conf.usuario || "") + '" placeholder="Ej. Victor"></div>' +
        '<div class="field"><label>Fondo de caja (el cambio con el que empiezas)</label>' +
        '<input id="t_fondo" type="number" inputmode="decimal" placeholder="0.00"></div>';
      var ult = S.listaTurnos(5).filter(function (x) { return x.fin; });
      if (ult.length) {
        h += '<div style="font-size:12.5px;color:#6b7a77;font-weight:700;margin:16px 0 8px">TURNOS ANTERIORES</div>';
        ult.forEach(function (x) {
          h += '<div class="row-item"><div class="ri-t"><div class="ri-n">' + esc(x.usr || "sin nombre") + '</div>' +
            '<div class="ri-s">' + fecha(x.ini) + ' → ' + fecha(x.fin) + '</div></div>' +
            '<div class="ri-v">' + money(x.totalVentas || 0) +
            (x.diferencia !== null && x.diferencia !== undefined
              ? '<div class="ri-s" style="color:' + (Math.abs(x.diferencia) < 0.01 ? '#0d6e5a' : '#c0392b') + '">' +
                (x.diferencia === 0 ? "cuadró" : (x.diferencia > 0 ? "sobró " : "faltó ") + money(Math.abs(x.diferencia))) + '</div>'
              : '') +
            '</div></div>';
        });
      }
      panel("🧾 Turno de caja", h,
        '<div class="btnrow"><button class="b-save" id="tAbrir">▶ Abrir turno</button></div>');
      $("tAbrir").addEventListener("click", function () {
        var r = S.abrirTurno($("t_fondo").value, $("t_usr").value);
        if (r.error) { toast(r.error, "err"); return; }
        toast("Turno abierto ✓", "ok");
        verTurno();
      });
      return;
    }

    var res = S.resumenTurno(t);
    var h = '<div class="kpi">' +
      '<div><div class="k-lbl">Ventas</div><div class="k-val">' + res.ventas + '</div></div>' +
      '<div><div class="k-lbl">Cobrado</div><div class="k-val">' + money(res.totalVentas) + '</div></div></div>';
    h += '<div class="hint">Turno de <b>' + esc(t.usr || "sin nombre") + '</b> · abierto ' + fecha(t.ini) + '</div>';
    h += '<div style="font-size:12.5px;color:#6b7a77;font-weight:700;margin:16px 0 8px">DESGLOSE</div>';
    h += '<div class="statline"><span>Fondo de caja</span><b>' + money(res.fondo) + '</b></div>';
    Object.keys(res.porForma).forEach(function (f) {
      h += '<div class="statline"><span>' + esc(S.NOMBRE_FORMA[f] || f) + '</span><b>' + money(res.porForma[f]) + '</b></div>';
    });
    if (res.totalAbonos > 0) h += '<div class="statline"><span>Abonos cobrados</span><b>' + money(res.totalAbonos) + '</b></div>';
    h += '<div class="statline"><span><b>Efectivo que debe haber</b></span><b style="color:#0d6e5a;font-size:17px">' +
      money(res.efectivoEsperado) + '</b></div>';
    h += '<div class="field" style="margin-top:16px"><label>¿Cuánto efectivo contaste? (opcional)</label>' +
      '<input id="t_cont" type="number" inputmode="decimal" placeholder="0.00"></div>';

    panel("🧾 Turno abierto", h,
      '<div class="btnrow"><button class="b-del" id="tCerrar">⏹ Cerrar turno</button></div>');
    $("tCerrar").addEventListener("click", function () {
      var r = S.cerrarTurno($("t_cont").value);
      if (r.error) { toast(r.error, "err"); return; }
      var x = r.resumen.turno;
      var msg = "Turno cerrado.\n\nVentas: " + money(x.totalVentas) +
        "\nEfectivo esperado: " + money(x.efectivoEsperado);
      if (x.diferencia !== null) {
        msg += "\nContaste: " + money(x.efectivoContado) +
          (Math.abs(x.diferencia) < 0.01 ? "\n\n✓ Cuadró perfecto"
            : (x.diferencia > 0 ? "\n\nSobraron " : "\n\nFaltaron ") + money(Math.abs(x.diferencia)));
      }
      alert(msg);
      toast("Turno cerrado ✓", "ok");
      verTurno();
    });
  }

  // =====================================================================
  //                            REPORTES
  // =====================================================================
  function verReportes(periodo) {
    periodo = periodo || "hoy";
    var r = S.reportePeriodo(periodo);
    var nombres = { hoy: "Hoy", ayer: "Ayer", semana: "Esta semana", mes: "Este mes", todo: "Todo" };

    var h = '<div class="chips" id="repPer" data-onchange="reporte">' +
      ["hoy", "ayer", "semana", "mes", "todo"].map(function (p) {
        return '<button class="chip' + (p === periodo ? " activo" : "") + '" data-p="' + p + '">' + nombres[p] + '</button>';
      }).join("") + '</div>';

    h += '<div class="kpi">' +
      '<div><div class="k-lbl">Vendido</div><div class="k-val">' + money(r.total) + '</div></div>' +
      '<div><div class="k-lbl">Ganancia</div><div class="k-val azul">' + money(r.ganancia) + '</div></div></div>';
    h += '<div class="kpi">' +
      '<div><div class="k-lbl">Ventas</div><div class="k-val" style="font-size:17px">' + r.ventas + '</div></div>' +
      '<div><div class="k-lbl">Piezas</div><div class="k-val" style="font-size:17px">' + r.piezas + '</div></div>' +
      '<div><div class="k-lbl">Margen</div><div class="k-val" style="font-size:17px">' + r.margen + '%</div></div></div>';

    h += '<div class="hint">La ganancia se calcula con el costo que tenía cada producto al momento de venderlo.</div>';

    if (Object.keys(r.porForma).length) {
      h += '<div style="font-size:12.5px;color:#6b7a77;font-weight:700;margin:16px 0 8px">CÓMO TE PAGARON</div>';
      Object.keys(r.porForma).forEach(function (f) {
        h += '<div class="statline"><span>' + esc(S.NOMBRE_FORMA[f] || f) + '</span><b>' + money(r.porForma[f]) + '</b></div>';
      });
      if (r.abonosCobrados > 0)
        h += '<div class="statline"><span>Abonos de fiados cobrados</span><b>' + money(r.abonosCobrados) + '</b></div>';
    }

    var us = Object.keys(r.porUsuario);
    if (us.length) {
      h += '<div style="font-size:12.5px;color:#6b7a77;font-weight:700;margin:16px 0 8px">QUIÉN VENDIÓ</div>';
      us.sort(function (a, b) { return r.porUsuario[b].total - r.porUsuario[a].total; }).forEach(function (u) {
        h += '<div class="statline"><span>' + esc(u) + ' · ' + r.porUsuario[u].ventas + ' venta(s)</span><b>' +
          money(r.porUsuario[u].total) + '</b></div>';
      });
    }

    if (r.top.length) {
      h += '<div style="font-size:12.5px;color:#6b7a77;font-weight:700;margin:16px 0 8px">LO MÁS VENDIDO</div>';
      r.top.forEach(function (p, i) {
        h += '<div class="row-item"><div class="ri-t"><div class="ri-n">' + (i + 1) + '. ' + esc(p.n) + '</div>' +
          '<div class="ri-s">' + p.q + ' pieza(s)</div></div>' +
          '<div class="ri-v">' + money(p.imp) + '</div></div>';
      });
    } else h += vacio("No hay ventas en este periodo.");

    panel("📈 Reportes", h);
    activarChips("repPer");
  }

  // =====================================================================
  //                       INVENTARIO FÍSICO
  // =====================================================================
  function verInventario() {
    var conteo = S.conteoActivo();
    if (!conteo) {
      var prev = S.listaConteos().slice(0, 5);
      var h = '<div class="hint">Sirve para saber si te falta mercancía. Cuentas físicamente lo que traes, y la app te dice en qué productos no cuadra contra el inventario.</div>' +
        '<div class="field" style="margin-top:14px"><label>Nota del conteo (opcional)</label>' +
        '<input id="k_nota" type="text" placeholder="Ej. conteo del domingo"></div>';
      if (prev.length) {
        h += '<div style="font-size:12.5px;color:#6b7a77;font-weight:700;margin:16px 0 8px">CONTEOS ANTERIORES</div>';
        prev.forEach(function (k) {
          h += '<div class="row-item" data-verk="' + esc(k.id) + '"><div class="ri-t">' +
            '<div class="ri-n">' + fecha(k.t) + (k.nota ? " · " + esc(k.nota) : "") + '</div>' +
            '<div class="ri-s">' + k.contados + ' contados · ' + k.faltantes + ' con faltante' +
            (k.ajustado ? " · ajustado" : "") + '</div></div>' +
            '<div class="ri-v rojo">−' + money(k.valorFaltaCosto) + '</div></div>';
        });
      }
      panel("📋 Inventario físico", h,
        '<div class="btnrow"><button class="b-save" id="kIniciar">▶ Empezar conteo</button></div>');
      $("kIniciar").addEventListener("click", function () {
        S.iniciarConteo($("k_nota").value);
        toast("Conteo iniciado", "ok");
        verInventario();
      });
      on("[data-verk]", "click", function (e) { verConteoViejo(e.currentTarget.getAttribute("data-verk")); });
      return;
    }
    pantallaConteo("");
  }

  function pantallaConteo(filtro) {
    var conteo = S.conteoActivo();
    var codes = Object.keys(conteo.items);
    var h = '<div class="okbox">Conteo en curso · <b>' + codes.length + '</b> producto(s) contados.<br>' +
      'Busca o escanea, escribe cuántas piezas tienes y ve avanzando.</div>';
    h += '<div class="searchbar-wrap" style="margin-bottom:12px">' +
      '<input id="k_buscar" type="search" placeholder="Buscar producto para contar…" value="' + esc(filtro || "") + '" ' +
      'style="flex:1;font-size:16px;padding:12px;border:2px solid #e3e8e7;border-radius:12px">' +
      '<button class="scanbtn" id="k_scan" style="min-width:58px"><span>📷</span></button></div>';

    if (filtro && filtro.trim()) {
      var term = filtro.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      var res = S.all().filter(function (p) {
        var hay = (p.n + " " + p.c).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return term.split(/\s+/).every(function (w) { return hay.indexOf(w) > -1; });
      }).slice(0, 25);
      if (!res.length) h += vacio("No encontré ese producto.");
      res.forEach(function (p) {
        var cont = conteo.items[p.c];
        h += '<div class="row-item"><div class="ri-t"><div class="ri-n">' + esc(p.n) + '</div>' +
          '<div class="ri-s">sistema: ' + U.existTxt(p.e) + (cont !== undefined ? ' · contado: <b>' + cont + '</b>' : '') + '</div></div>' +
          '<input class="k_in" data-code="' + esc(p.c) + '" type="number" inputmode="decimal" ' +
          'placeholder="0" value="' + (cont !== undefined ? cont : "") + '" ' +
          'style="width:74px;font-size:16px;padding:9px;border:2px solid #e3e8e7;border-radius:10px;text-align:right"></div>';
      });
    }

    if (codes.length) {
      var dif = S.diferenciasConteo();
      h += '<div class="kpi" style="margin-top:14px">' +
        '<div><div class="k-lbl">Cuadran</div><div class="k-val" style="font-size:17px">' + dif.iguales + '</div></div>' +
        '<div><div class="k-lbl">Faltantes</div><div class="k-val rojo" style="font-size:17px">' + dif.faltantes.length + '</div></div>' +
        '<div><div class="k-lbl">Sobrantes</div><div class="k-val azul" style="font-size:17px">' + dif.sobrantes.length + '</div></div></div>';
      h += '<div style="font-size:12.5px;color:#6b7a77;font-weight:700;margin:14px 0 8px">YA CONTADOS</div>';
      codes.forEach(function (c) {
        var p = S.get(c); if (!p) return;
        var d = conteo.items[c] - p.e;
        h += '<div class="row-item"><div class="ri-t"><div class="ri-n">' + esc(p.n) + '</div>' +
          '<div class="ri-s">sistema ' + U.existTxt(p.e) + ' · contado ' + conteo.items[c] + '</div></div>' +
          '<div class="ri-v ' + (d < 0 ? "rojo" : (d > 0 ? "azul" : "verde")) + '">' +
          (d === 0 ? "✓" : (d > 0 ? "+" : "") + d) + '</div>' +
          '<button class="closex" data-quitar="' + esc(c) + '" style="width:30px;height:30px;font-size:15px">✕</button></div>';
      });
    }

    panel("📋 Contando", h,
      '<div class="btnrow"><button class="b-rest" id="kCancelar">Cancelar</button>' +
      '<button class="b-save" id="kCerrar">✓ Ver resultado</button></div>');

    var inp = $("k_buscar");
    inp.addEventListener("input", function () {
      clearTimeout(pantallaConteo._t);
      var v = this.value;
      pantallaConteo._t = setTimeout(function () {
        pantallaConteo(v);
        var i2 = $("k_buscar");
        if (i2) { i2.focus(); i2.setSelectionRange(v.length, v.length); }
      }, 450);
    });
    on(".k_in", "change", function (e) {
      S.contarProducto(e.target.getAttribute("data-code"), e.target.value, false);
      toast("Contado ✓", "ok");
      pantallaConteo($("k_buscar").value);
    });
    on("[data-quitar]", "click", function (e) {
      S.quitarDelConteo(e.currentTarget.getAttribute("data-quitar"));
      pantallaConteo($("k_buscar").value);
    });
    $("k_scan").addEventListener("click", function () {
      toast("Escanea desde la pantalla principal y luego búscalo aquí", "ok");
    });
    $("kCancelar").addEventListener("click", function () {
      if (!confirm("¿Cancelar el conteo? Se pierde lo que llevas contado.")) return;
      S.cancelarConteo(); toast("Conteo cancelado", "ok"); verInventario();
    });
    $("kCerrar").addEventListener("click", resultadoConteo);
  }

  function resultadoConteo() {
    var dif = S.diferenciasConteo();
    if (!dif) { verInventario(); return; }
    var h = '<div class="kpi">' +
      '<div><div class="k-lbl">Contados</div><div class="k-val" style="font-size:18px">' + dif.contados + '</div></div>' +
      '<div><div class="k-lbl">Piezas faltantes</div><div class="k-val rojo" style="font-size:18px">' + dif.piezasFaltantes + '</div></div></div>';
    h += '<div class="kpi">' +
      '<div><div class="k-lbl">Pérdida a costo</div><div class="k-val rojo">' + money(dif.valorFaltaCosto) + '</div></div>' +
      '<div><div class="k-lbl">Dejaste de vender</div><div class="k-val" style="color:#6b7a77">' + money(dif.valorFaltaVenta) + '</div></div></div>';

    if (dif.faltantes.length) {
      h += '<div style="font-size:12.5px;color:#c0392b;font-weight:700;margin:16px 0 8px">MERCANCÍA FALTANTE</div>';
      dif.faltantes.forEach(function (f) {
        h += '<div class="row-item"><div class="ri-t"><div class="ri-n">' + esc(f.n) + '</div>' +
          '<div class="ri-s">debía haber ' + f.sistema + ' · contaste ' + f.contado + '</div></div>' +
          '<div class="ri-v rojo">' + f.dif + '<div class="ri-s">' + money(f.valorCosto) + '</div></div></div>';
      });
    } else h += '<div class="okbox" style="margin-top:14px">No falta nada. Todo cuadra ✓</div>';

    if (dif.sobrantes.length) {
      h += '<div style="font-size:12.5px;color:#1462b8;font-weight:700;margin:16px 0 8px">SOBRANTES (hay más de lo registrado)</div>';
      dif.sobrantes.forEach(function (f) {
        h += '<div class="row-item"><div class="ri-t"><div class="ri-n">' + esc(f.n) + '</div>' +
          '<div class="ri-s">debía haber ' + f.sistema + ' · contaste ' + f.contado + '</div></div>' +
          '<div class="ri-v azul">+' + f.dif + '</div></div>';
      });
    }

    h += '<div class="hint" style="margin-top:14px">Si guardas <b>ajustando</b>, el inventario queda igual a lo que contaste. Si guardas <b>sin ajustar</b>, solo se conserva el reporte.</div>';

    panel("📋 Resultado del conteo", h,
      '<div class="btnrow"><button class="b-rest" id="kSolo">Guardar reporte</button>' +
      '<button class="b-save" id="kAjustar">✓ Guardar y ajustar</button></div>',
      function () { pantallaConteo(""); });

    $("kSolo").addEventListener("click", function () { cerrar(false); });
    $("kAjustar").addEventListener("click", function () {
      if (!confirm("El inventario quedará exactamente como lo contaste. ¿Continuar?")) return;
      cerrar(true);
    });
    function cerrar(ajustar) {
      var r = S.cerrarConteo(ajustar);
      if (r.error) { toast(r.error, "err"); return; }
      toast(ajustar ? "Inventario ajustado ✓" : "Reporte guardado ✓", "ok");
      U.render();
      verInventario();
    }
  }

  function verConteoViejo(id) {
    var k = S.listaConteos().filter(function (x) { return x.id === id; })[0];
    if (!k) return;
    var h = '<div class="kpi">' +
      '<div><div class="k-lbl">Contados</div><div class="k-val" style="font-size:18px">' + k.contados + '</div></div>' +
      '<div><div class="k-lbl">Pérdida a costo</div><div class="k-val rojo">' + money(k.valorFaltaCosto) + '</div></div></div>';
    h += '<div class="hint">' + fecha(k.t) + (k.nota ? " · " + esc(k.nota) : "") +
      (k.ajustado ? " · inventario ajustado" : " · solo reporte") + ' · por ' + esc(k.usr || "sin nombre") + '</div>';
    if (k.detalle && k.detalle.length) {
      h += '<div style="font-size:12.5px;color:#c0392b;font-weight:700;margin:16px 0 8px">FALTANTES</div>';
      k.detalle.forEach(function (f) {
        h += '<div class="row-item"><div class="ri-t"><div class="ri-n">' + esc(f.n) + '</div>' +
          '<div class="ri-s">había ' + f.sistema + ' · contado ' + f.contado + '</div></div>' +
          '<div class="ri-v rojo">' + f.dif + '</div></div>';
      });
    } else h += vacio("Ese conteo no tuvo faltantes.");
    panel("📋 Conteo anterior", h, null, verInventario);
  }

  // =====================================================================
  //                          POR RESURTIR
  // =====================================================================
  function verResurtir() {
    var lista = S.porResurtir();
    var agotados = lista.filter(function (p) { return p.e <= 0; });
    var h = '<div class="kpi">' +
      '<div><div class="k-lbl">Agotados</div><div class="k-val rojo">' + agotados.length + '</div></div>' +
      '<div><div class="k-lbl">Por acabarse</div><div class="k-val amar" style="color:#b58900">' +
      (lista.length - agotados.length) + '</div></div></div>';
    if (!lista.length) h += vacio("Todo tiene existencia. ✓");
    lista.slice(0, 300).forEach(function (p) {
      h += '<div class="row-item"><div class="ri-t"><div class="ri-n">' + esc(p.n) + '</div>' +
        '<div class="ri-s">' + esc(p.d || "—") + (p.min > 0 ? " · mínimo " + p.min : "") + '</div></div>' +
        '<div class="ri-v ' + (p.e <= 0 ? "rojo" : "") + '">' + U.existTxt(p.e) + '</div></div>';
    });
    if (lista.length > 300) h += '<div class="hint">Mostrando los primeros 300 de ' + lista.length + '.</div>';
    panel("📦 Por resurtir", h);
  }

  // ---------- arranque ----------
  document.getElementById("masBtn").addEventListener("click", abrirMenu);

  return {
    abrirMenu: abrirMenu, elegirCliente: elegirCliente, nuevoApartado: nuevoApartado,
    verFiados: verFiados, verApartados: verApartados, verTurno: verTurno,
    verReportes: verReportes, verInventario: verInventario, verResurtir: verResurtir
  };
})();
