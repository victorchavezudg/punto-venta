/* ===== Mi Punto de Venta — capa de datos =====
   Idea clave: el inventario base (data.js) NUNCA se toca.
   Todo lo de Victor (cambios de precio, ventas, clientes, fiados, apartados,
   turnos y conteos) vive en una "capa" aparte, guardada en el celular y
   sincronizada a la nube. Por eso sus datos sobreviven a las actualizaciones.

   Regla importante para VARIOS CELULARES:
   nunca guardamos totales "ya calculados" (como la existencia final o el saldo
   de un cliente). Guardamos los HECHOS (una venta, un abono) y calculamos.
   Así dos celulares pueden trabajar a la vez sin pisarse.
*/
window.Store = (function () {
  "use strict";

  var LS_OVERLAY = "pv_overlay_v1";
  var LS_CONF = "pv_conf_v1";
  var GIST_FILE = "punto-venta-datos.json";
  var GIST_DESC = "Mi Punto de Venta — inventario y ventas (privado)";

  // ---------- utilidades ----------
  function now() { return Date.now(); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function numOr(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  function readLS(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : clone(fallback);
    } catch (e) { return clone(fallback); }
  }
  function writeLS(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  // ---------- estado ----------
  var EMPTY_OVERLAY = {
    v: 2, updated: 0,
    items: {},        // cambios a productos
    sales: [],        // ventas (hechos)
    clientes: {},     // clientes de fiado
    abonos: [],       // pagos de clientes (hechos)
    apartados: {},    // mercancía apartada
    turnos: [],       // turnos de caja
    conteos: []       // inventarios físicos hechos
  };

  function sanear(o) {
    o = o || {};
    if (!o.items) o.items = {};
    if (!o.sales) o.sales = [];
    if (!o.clientes) o.clientes = {};
    if (!o.abonos) o.abonos = [];
    if (!o.apartados) o.apartados = {};
    if (!o.turnos) o.turnos = [];
    if (!o.conteos) o.conteos = [];
    return o;
  }
  var overlay = sanear(readLS(LS_OVERLAY, EMPTY_OVERLAY));

  var conf = readLS(LS_CONF, {
    token: "", gistId: "", lastSync: 0, autoStock: true, deviceId: "",
    negocio: "", telefono: "", garantiaDias: 0, garantiaTexto: "",
    folioSeq: 0, usuario: ""
  });
  if (!conf.deviceId) {
    conf.deviceId = "d" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
    writeLS(LS_CONF, conf);
  }

  var base = (window.PRODUCTS || []).slice();
  var baseByCode = {};
  base.forEach(function (p) { if (p.c) baseByCode[p.c] = p; });

  var merged = [], mergedByCode = {}, listeners = [];

  function onChange(fn) { listeners.push(fn); }
  function emit(what) { listeners.forEach(function (f) { try { f(what); } catch (e) {} }); }

  function nuevoId(pref) {
    return (pref || "x") + "_" + conf.deviceId + "_" + now().toString(36) +
           Math.random().toString(36).slice(2, 6);
  }

  // =====================================================================
  //                        INVENTARIO (base + capa)
  // =====================================================================

  // Piezas comprometidas por producto: ventas + apartados abiertos.
  function movimientosPorCodigo() {
    var map = {};
    function add(code, t, q) {
      if (!map[code]) map[code] = [];
      map[code].push({ t: t, q: Number(q) || 0 });
    }
    (overlay.sales || []).forEach(function (s) {
      if (s.dec === false) return;
      (s.items || []).forEach(function (i) { add(i.c, s.t, i.q); });
    });
    // la mercancía apartada se reserva: ya no está disponible para vender
    Object.keys(overlay.apartados || {}).forEach(function (k) {
      var ap = overlay.apartados[k];
      if (!ap || ap.estado !== "abierto") return;
      (ap.items || []).forEach(function (i) { add(i.c, ap.t, i.q); });
    });
    return map;
  }

  function existenciaReal(code, baseE, ov, mpc) {
    var e0 = (ov && ov.e !== undefined) ? Number(ov.e) : Number(baseE);
    var t0 = (ov && ov._te) ? ov._te : 0;
    var salidas = 0;
    var lista = mpc[code] || [];
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].t > t0) salidas += lista[i].q;
    }
    return r2((isFinite(e0) ? e0 : 0) - salidas);
  }

  function rebuild() {
    merged = [];
    mergedByCode = {};
    var mpc = movimientosPorCodigo();
    var i, p, ov;

    for (i = 0; i < base.length; i++) {
      p = base[i];
      ov = overlay.items[p.c];
      if (ov && ov._del) continue;
      var out = {
        c: p.c,
        n: (ov && ov.n !== undefined) ? ov.n : p.n,
        co: (ov && ov.co !== undefined) ? ov.co : p.co,
        v: (ov && ov.v !== undefined) ? ov.v : p.v,
        m: (ov && ov.m !== undefined) ? ov.m : p.m,
        e: existenciaReal(p.c, p.e, ov, mpc),
        d: (ov && ov.d !== undefined) ? ov.d : p.d,
        _edit: !!ov, _new: false
      };
      merged.push(out);
      mergedByCode[out.c] = out;
    }

    for (var code in overlay.items) {
      ov = overlay.items[code];
      if (!ov || !ov._new || ov._del) continue;
      if (baseByCode[code]) continue;
      var np = {
        c: code,
        n: ov.n || "(sin nombre)",
        co: numOr(ov.co, 0), v: numOr(ov.v, 0), m: numOr(ov.m, 0),
        e: existenciaReal(code, 0, ov, mpc), d: ov.d || "Nuevos",
        _edit: true, _new: true
      };
      merged.push(np);
      mergedByCode[code] = np;
    }

    merged.sort(function (a, b) { return a.n.localeCompare(b.n, "es"); });
    return merged;
  }

  function persist(sync) {
    overlay.updated = now();
    writeLS(LS_OVERLAY, overlay);
    rebuild();
    emit("data");
    if (sync !== false) Sync.schedule();
  }

  function touch(code) {
    if (!overlay.items[code]) overlay.items[code] = {};
    overlay.items[code]._t = now();
    return overlay.items[code];
  }

  function all() { return merged; }
  function get(code) { return mergedByCode[code]; }
  function baseOf(code) { return baseByCode[code]; }
  function countEdits() { return Object.keys(overlay.items).length; }
  function isEdited(code) { return !!overlay.items[code]; }

  function cleanupIfEmpty(code) {
    var it = overlay.items[code];
    if (!it || it._new || it._del) return;
    var keys = Object.keys(it).filter(function (k) { return k !== "_t" && k !== "_te"; });
    if (keys.length === 0) delete overlay.items[code];
  }

  function updateProduct(code, fields) {
    var it = touch(code);
    var bp = baseByCode[code];
    ["n", "co", "v", "m", "e", "d"].forEach(function (k) {
      if (fields[k] === undefined) return;
      var val = (k === "n" || k === "d") ? String(fields[k]).trim() : numOr(fields[k], 0);
      if (k === "e") it._te = now();
      if (bp && !it._new && bp[k] === val && k !== "e") { delete it[k]; }
      else { it[k] = val; }
    });
    cleanupIfEmpty(code);
    persist();
    return get(code);
  }

  function addProduct(fields) {
    var code = String(fields.c || "").trim();
    if (!code) code = "N" + now().toString(36).toUpperCase();
    if (mergedByCode[code]) return { error: "Ese código ya existe: " + code };
    var it = touch(code);
    it._new = true;
    it.n = String(fields.n || "").trim() || "(sin nombre)";
    it.co = numOr(fields.co, 0);
    it.v = numOr(fields.v, 0);
    it.m = numOr(fields.m, 0);
    it.e = numOr(fields.e, 0);
    it._te = now();
    it.d = String(fields.d || "Nuevos").trim();
    persist();
    return { ok: true, code: code };
  }

  function deleteProduct(code) {
    var it = touch(code);
    if (it._new) { delete overlay.items[code]; }
    else { it._del = true; }
    persist();
  }

  function restoreProduct(code) {
    if (overlay.items[code] && !overlay.items[code]._new) {
      delete overlay.items[code];
      persist();
      return true;
    }
    return false;
  }

  // =====================================================================
  //                              VENTAS
  // =====================================================================

  function siguienteFolio() {
    conf.folioSeq = (conf.folioSeq || 0) + 1;
    writeLS(LS_CONF, conf);
    var pref = (conf.deviceId || "XX").slice(-2).toUpperCase();
    return pref + "-" + String(conf.folioSeq).padStart(4, "0");
  }

  function calcularDescuento(subtotal, tipo, valor) {
    var v = parseFloat(valor);
    if (!isFinite(v) || v <= 0) return { tipo: tipo, val: 0, monto: 0 };
    var monto = (tipo === "%") ? (subtotal * v / 100) : v;
    if (monto > subtotal) monto = subtotal;
    return { tipo: tipo, val: v, monto: r2(monto) };
  }

  // extra: {sub, desc, forma, cli}
  function registrarVenta(items, total, descontar, extra) {
    extra = extra || {};
    var t = now();
    var venta = {
      id: nuevoId("v"),
      dev: conf.deviceId,
      usr: conf.usuario || "",
      folio: siguienteFolio(),
      t: t,
      dec: descontar !== false,
      sub: extra.sub !== undefined ? extra.sub : total,
      desc: extra.desc || null,
      forma: extra.forma || "efectivo",   // efectivo | transferencia | tarjeta | credito
      cli: extra.cli || null,             // id del cliente (obligatorio si es crédito)
      total: r2(total),
      items: items.map(function (i) {
        var p = mergedByCode[i.c];
        return { c: i.c, n: i.n, q: i.q, p: i.p, co: p ? p.co : 0 };  // costo del momento
      })
    };
    overlay.sales.push(venta);
    if (overlay.sales.length > 2000) overlay.sales = overlay.sales.slice(-2000);
    persist();
    return venta;
  }

  function rangoDia(ts) {
    var d = new Date(ts === undefined ? now() : ts);
    d.setHours(0, 0, 0, 0);
    return { desde: d.getTime(), hasta: d.getTime() + 86400000 };
  }

  function ventasEntre(desde, hasta) {
    return (overlay.sales || []).filter(function (s) { return s.t >= desde && s.t < hasta; });
  }

  function ventasDeHoy() {
    var r = rangoDia();
    var list = ventasEntre(r.desde, r.hasta);
    var total = list.reduce(function (a, s) { return a + (s.total || 0); }, 0);
    var piezas = list.reduce(function (a, s) {
      return a + s.items.reduce(function (x, i) { return x + i.q; }, 0);
    }, 0);
    return { n: list.length, total: r2(total), piezas: piezas, list: list };
  }

  // =====================================================================
  //                        CLIENTES Y FIADOS
  // =====================================================================

  function saldoCliente(id) {
    var deuda = 0, pagado = 0;
    (overlay.sales || []).forEach(function (s) {
      if (s.cli === id && s.forma === "credito") deuda += (s.total || 0);
    });
    (overlay.abonos || []).forEach(function (a) {
      if (a.cli === id && !a.ap) pagado += (a.monto || 0);
    });
    return r2(deuda - pagado);
  }

  function listaClientes() {
    var out = [];
    Object.keys(overlay.clientes).forEach(function (id) {
      var c = overlay.clientes[id];
      if (!c || c._del) return;
      out.push({
        id: id, n: c.n || "(sin nombre)", tel: c.tel || "",
        lim: numOr(c.lim, 0), saldo: saldoCliente(id)
      });
    });
    out.sort(function (a, b) { return a.n.localeCompare(b.n, "es"); });
    return out;
  }
  function getCliente(id) {
    var c = overlay.clientes[id];
    if (!c || c._del) return null;
    return { id: id, n: c.n, tel: c.tel || "", lim: numOr(c.lim, 0), saldo: saldoCliente(id) };
  }
  function addCliente(f) {
    var nombre = String(f.n || "").trim();
    if (!nombre) return { error: "Ponle nombre al cliente" };
    var id = nuevoId("c");
    overlay.clientes[id] = {
      n: nombre, tel: String(f.tel || "").trim(), lim: numOr(f.lim, 0), _t: now()
    };
    persist();
    return { ok: true, id: id };
  }
  function updateCliente(id, f) {
    var c = overlay.clientes[id];
    if (!c) return { error: "No encontré ese cliente" };
    if (f.n !== undefined) c.n = String(f.n).trim();
    if (f.tel !== undefined) c.tel = String(f.tel).trim();
    if (f.lim !== undefined) c.lim = numOr(f.lim, 0);
    c._t = now();
    persist();
    return { ok: true };
  }
  function deleteCliente(id) {
    if (!overlay.clientes[id]) return { error: "No encontré ese cliente" };
    if (saldoCliente(id) > 0) return { error: "Ese cliente todavía te debe. Liquida primero." };
    overlay.clientes[id]._del = true;
    overlay.clientes[id]._t = now();
    persist();
    return { ok: true };
  }

  function movimientosCliente(id) {
    var mov = [];
    (overlay.sales || []).forEach(function (s) {
      if (s.cli === id && s.forma === "credito") {
        mov.push({ t: s.t, tipo: "cargo", concepto: "Venta " + (s.folio || ""), monto: s.total, ref: s.id });
      }
    });
    (overlay.abonos || []).forEach(function (a) {
      if (a.cli === id && !a.ap) {
        mov.push({ t: a.t, tipo: "abono", concepto: "Abono" + (a.nota ? " · " + a.nota : ""), monto: a.monto, ref: a.id });
      }
    });
    mov.sort(function (x, y) { return x.t - y.t; });
    var saldo = 0;
    mov.forEach(function (m) {
      saldo += (m.tipo === "cargo" ? m.monto : -m.monto);
      m.saldo = r2(saldo);
    });
    return mov;
  }

  // {cli, monto, forma, nota, ap}
  function registrarAbono(f) {
    var monto = numOr(f.monto, 0);
    if (monto <= 0) return { error: "El abono debe ser mayor a cero" };
    var ab = {
      id: nuevoId("a"), dev: conf.deviceId, usr: conf.usuario || "",
      t: now(), cli: f.cli || null, monto: r2(monto),
      forma: f.forma || "efectivo", nota: String(f.nota || "").trim(),
      ap: f.ap || null
    };
    overlay.abonos.push(ab);
    persist();
    return { ok: true, abono: ab };
  }

  function totalPorCobrar() {
    var t = 0;
    listaClientes().forEach(function (c) { if (c.saldo > 0) t += c.saldo; });
    return r2(t);
  }

  // =====================================================================
  //                            APARTADOS
  // =====================================================================

  function abonadoApartado(id) {
    var s = 0;
    (overlay.abonos || []).forEach(function (a) { if (a.ap === id) s += (a.monto || 0); });
    return r2(s);
  }
  function saldoApartado(id) {
    var ap = overlay.apartados[id];
    if (!ap) return 0;
    return r2((ap.total || 0) - abonadoApartado(id));
  }

  // {cli, nombre, tel, items:[{c,n,q,p}], total, anticipo, forma}
  function crearApartado(f) {
    if (!f.items || !f.items.length) return { error: "No hay productos para apartar" };
    var id = nuevoId("ap");
    var t = now();
    overlay.apartados[id] = {
      id: id, dev: conf.deviceId, usr: conf.usuario || "",
      t: t, _t: t,
      cli: f.cli || null,
      nombre: String(f.nombre || "").trim(),
      tel: String(f.tel || "").trim(),
      items: f.items.map(function (i) {
        var p = mergedByCode[i.c];
        return { c: i.c, n: i.n, q: i.q, p: i.p, co: p ? p.co : 0 };
      }),
      total: r2(f.total),
      estado: "abierto",
      folio: siguienteFolio()
    };
    var anticipo = numOr(f.anticipo, 0);
    if (anticipo > 0) {
      overlay.abonos.push({
        id: nuevoId("a"), dev: conf.deviceId, usr: conf.usuario || "",
        t: t, cli: f.cli || null, monto: r2(anticipo),
        forma: f.forma || "efectivo", nota: "Anticipo", ap: id
      });
    }
    persist();
    return { ok: true, id: id, apartado: overlay.apartados[id] };
  }

  function abonarApartado(id, monto, forma, nota) {
    var ap = overlay.apartados[id];
    if (!ap) return { error: "No encontré ese apartado" };
    if (ap.estado !== "abierto") return { error: "Ese apartado ya está " + ap.estado };
    var m = numOr(monto, 0);
    if (m <= 0) return { error: "El abono debe ser mayor a cero" };
    var falta = saldoApartado(id);
    if (m > falta) m = falta;
    overlay.abonos.push({
      id: nuevoId("a"), dev: conf.deviceId, usr: conf.usuario || "",
      t: now(), cli: ap.cli || null, monto: r2(m),
      forma: forma || "efectivo", nota: String(nota || "Abono a apartado"), ap: id
    });
    persist();
    return { ok: true, saldo: saldoApartado(id) };
  }

  // Entregar: se convierte en venta.
  // El apartado deja de estar "abierto", así que deja de reservar piezas;
  // la venta toma el relevo y descuenta. Así sale UNA sola vez del inventario.
  function entregarApartado(id, formaPagoFinal) {
    var ap = overlay.apartados[id];
    if (!ap) return { error: "No encontré ese apartado" };
    if (ap.estado !== "abierto") return { error: "Ese apartado ya está " + ap.estado };
    var falta = saldoApartado(id);
    if (falta > 0) {
      overlay.abonos.push({
        id: nuevoId("a"), dev: conf.deviceId, usr: conf.usuario || "",
        t: now(), cli: ap.cli || null, monto: falta,
        forma: formaPagoFinal || "efectivo", nota: "Liquidación de apartado", ap: id
      });
    }
    ap.estado = "entregado";
    ap.tEntrega = now();
    ap._t = now();
    var venta = {
      id: nuevoId("v"), dev: conf.deviceId, usr: conf.usuario || "",
      folio: ap.folio, t: now(),
      dec: true,        // el apartado dejó de reservar; ahora descuenta la venta
      sub: ap.total, desc: null,
      forma: "apartado", cli: ap.cli || null, apRef: id,
      total: ap.total,
      items: ap.items.slice()
    };
    overlay.sales.push(venta);
    persist();
    return { ok: true, venta: venta };
  }

  function cancelarApartado(id, devolverDinero) {
    var ap = overlay.apartados[id];
    if (!ap) return { error: "No encontré ese apartado" };
    if (ap.estado !== "abierto") return { error: "Ese apartado ya está " + ap.estado };
    ap.estado = "cancelado";
    ap.tCancela = now();
    ap._t = now();
    ap.devuelto = !!devolverDinero;
    persist();
    return { ok: true, abonado: abonadoApartado(id) };
  }

  function listaApartados(estado) {
    var out = [];
    Object.keys(overlay.apartados).forEach(function (id) {
      var ap = overlay.apartados[id];
      if (!ap) return;
      if (estado && ap.estado !== estado) return;
      var cli = ap.cli ? getCliente(ap.cli) : null;
      out.push({
        id: id, folio: ap.folio, t: ap.t, estado: ap.estado,
        nombre: cli ? cli.n : (ap.nombre || "(sin nombre)"),
        tel: cli ? cli.tel : (ap.tel || ""),
        items: ap.items, total: ap.total,
        abonado: abonadoApartado(id), saldo: saldoApartado(id),
        usr: ap.usr || ""
      });
    });
    out.sort(function (a, b) { return b.t - a.t; });
    return out;
  }

  // =====================================================================
  //                              TURNOS
  // =====================================================================

  function turnoActivo() {
    var abiertos = (overlay.turnos || []).filter(function (t) {
      return t.dev === conf.deviceId && !t.fin;
    });
    return abiertos.length ? abiertos[abiertos.length - 1] : null;
  }

  function abrirTurno(fondo, usuario) {
    if (turnoActivo()) return { error: "Ya hay un turno abierto en este celular" };
    if (usuario) setConf({ usuario: String(usuario).trim() });
    var t = {
      id: nuevoId("t"), dev: conf.deviceId, usr: conf.usuario || "",
      ini: now(), t: now(), fin: null, fondo: r2(numOr(fondo, 0)), _t: now()
    };
    overlay.turnos.push(t);
    persist();
    return { ok: true, turno: t };
  }

  function resumenTurno(turno) {
    if (!turno) return null;
    var hasta = turno.fin || now();
    var ventas = (overlay.sales || []).filter(function (s) {
      return s.dev === turno.dev && s.t >= turno.ini && s.t <= hasta;
    });
    var abonos = (overlay.abonos || []).filter(function (a) {
      return a.dev === turno.dev && a.t >= turno.ini && a.t <= hasta;
    });
    var porForma = {};
    function suma(forma, monto) { porForma[forma] = r2((porForma[forma] || 0) + monto); }
    ventas.forEach(function (s) { if (s.forma !== "apartado") suma(s.forma || "efectivo", s.total); });
    abonos.forEach(function (a) { suma(a.forma || "efectivo", a.monto); });
    var totalVentas = r2(ventas.reduce(function (a, s) { return a + (s.total || 0); }, 0));
    var efectivo = porForma["efectivo"] || 0;
    return {
      turno: turno,
      ventas: ventas.length,
      totalVentas: totalVentas,
      piezas: ventas.reduce(function (a, s) {
        return a + s.items.reduce(function (x, i) { return x + i.q; }, 0);
      }, 0),
      abonos: abonos.length,
      totalAbonos: r2(abonos.reduce(function (a, x) { return a + (x.monto || 0); }, 0)),
      porForma: porForma,
      fondo: turno.fondo || 0,
      efectivoEsperado: r2((turno.fondo || 0) + efectivo),
      lista: ventas
    };
  }

  function cerrarTurno(efectivoContado) {
    var t = turnoActivo();
    if (!t) return { error: "No hay ningún turno abierto" };
    var res = resumenTurno(t);
    t.fin = now();
    t._t = now();
    t.efectivoContado = (efectivoContado === undefined || efectivoContado === null || efectivoContado === "")
      ? null : r2(numOr(efectivoContado, 0));
    t.efectivoEsperado = res.efectivoEsperado;
    t.totalVentas = res.totalVentas;
    t.diferencia = (t.efectivoContado === null) ? null : r2(t.efectivoContado - res.efectivoEsperado);
    persist();
    res.turno = t;
    return { ok: true, resumen: res };
  }

  function listaTurnos(n) {
    var out = (overlay.turnos || []).slice().sort(function (a, b) { return b.ini - a.ini; });
    return n ? out.slice(0, n) : out;
  }

  // =====================================================================
  //                             REPORTES
  // =====================================================================

  var NOMBRE_FORMA = {
    efectivo: "Efectivo", transferencia: "Transferencia",
    tarjeta: "Tarjeta", credito: "Fiado (crédito)", apartado: "Apartado entregado"
  };

  function reporte(desde, hasta) {
    var ventas = ventasEntre(desde, hasta);
    var abonos = (overlay.abonos || []).filter(function (a) { return a.t >= desde && a.t < hasta; });

    var totalVenta = 0, costoTotal = 0, piezas = 0;
    var porForma = {}, porUsuario = {}, prod = {};

    ventas.forEach(function (s) {
      totalVenta += (s.total || 0);
      var f = s.forma || "efectivo";
      porForma[f] = r2((porForma[f] || 0) + (s.total || 0));
      var u = s.usr || "(sin nombre)";
      if (!porUsuario[u]) porUsuario[u] = { total: 0, ventas: 0 };
      porUsuario[u].total = r2(porUsuario[u].total + (s.total || 0));
      porUsuario[u].ventas++;
      (s.items || []).forEach(function (i) {
        piezas += i.q;
        costoTotal += (Number(i.co) || 0) * i.q;
        if (!prod[i.c]) prod[i.c] = { c: i.c, n: i.n, q: 0, imp: 0 };
        prod[i.c].q += i.q;
        prod[i.c].imp = r2(prod[i.c].imp + (Number(i.p) || 0) * i.q);
      });
    });

    var ganancia = r2(totalVenta - costoTotal);
    var top = Object.keys(prod).map(function (k) { return prod[k]; })
      .sort(function (a, b) { return b.q - a.q; });

    return {
      desde: desde, hasta: hasta,
      ventas: ventas.length, piezas: piezas,
      total: r2(totalVenta), costo: r2(costoTotal), ganancia: ganancia,
      margen: totalVenta > 0 ? Math.round(ganancia / totalVenta * 1000) / 10 : 0,
      porForma: porForma, porUsuario: porUsuario,
      top: top.slice(0, 20),
      abonosCobrados: r2(abonos.reduce(function (a, x) { return a + (x.monto || 0); }, 0)),
      lista: ventas
    };
  }

  function reportePeriodo(cual) {
    var ahora = new Date();
    var desde, hasta = now() + 1, r;
    if (cual === "ayer") { r = rangoDia(now() - 86400000); desde = r.desde; hasta = r.hasta; }
    else if (cual === "semana") {
      var d = new Date(); d.setHours(0, 0, 0, 0);
      var dow = (d.getDay() + 6) % 7;               // lunes = 0
      desde = d.getTime() - dow * 86400000;
    }
    else if (cual === "mes") {
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime();
    }
    else if (cual === "todo") { desde = 0; }
    else { r = rangoDia(); desde = r.desde; hasta = r.hasta; }
    return reporte(desde, hasta);
  }

  // =====================================================================
  //                    INVENTARIO FÍSICO Y FALTANTES
  // =====================================================================
  // El conteo en curso se guarda solo en este celular (no se sincroniza),
  // porque cada quien cuenta su parte. Al cerrarlo sí queda el resultado.
  var LS_CONTEO = "pv_conteo_v1";
  var conteo = readLS(LS_CONTEO, null);

  function conteoActivo() { return conteo; }

  function iniciarConteo(nota) {
    conteo = { t: now(), nota: String(nota || "").trim(), items: {} };
    writeLS(LS_CONTEO, conteo);
    emit("conteo");
    return conteo;
  }
  function contarProducto(code, cantidad, sumar) {
    if (!conteo) iniciarConteo("");
    var q = numOr(cantidad, 0);
    if (sumar) conteo.items[code] = numOr(conteo.items[code], 0) + q;
    else conteo.items[code] = q;
    if (conteo.items[code] < 0) conteo.items[code] = 0;
    writeLS(LS_CONTEO, conteo);
    emit("conteo");
    return conteo.items[code];
  }
  function quitarDelConteo(code) {
    if (!conteo) return;
    delete conteo.items[code];
    writeLS(LS_CONTEO, conteo);
    emit("conteo");
  }
  function cancelarConteo() {
    conteo = null;
    try { localStorage.removeItem(LS_CONTEO); } catch (e) {}
    emit("conteo");
  }

  // Compara lo contado contra lo que dice el sistema
  function diferenciasConteo() {
    if (!conteo) return null;
    var faltantes = [], sobrantes = [], iguales = 0;
    var valorFaltaCosto = 0, valorFaltaVenta = 0, valorSobraCosto = 0;
    Object.keys(conteo.items).forEach(function (code) {
      var p = mergedByCode[code];
      if (!p) return;
      var contado = numOr(conteo.items[code], 0);
      var sistema = numOr(p.e, 0);
      var dif = r2(contado - sistema);
      var fila = {
        c: code, n: p.n, d: p.d, sistema: sistema, contado: contado, dif: dif,
        costo: p.co, venta: p.v,
        valorCosto: r2(Math.abs(dif) * (p.co || 0)),
        valorVenta: r2(Math.abs(dif) * (p.v || 0))
      };
      if (dif < 0) { faltantes.push(fila); valorFaltaCosto += fila.valorCosto; valorFaltaVenta += fila.valorVenta; }
      else if (dif > 0) { sobrantes.push(fila); valorSobraCosto += fila.valorCosto; }
      else iguales++;
    });
    faltantes.sort(function (a, b) { return b.valorCosto - a.valorCosto; });
    sobrantes.sort(function (a, b) { return b.valorCosto - a.valorCosto; });
    return {
      t: conteo.t, nota: conteo.nota,
      contados: Object.keys(conteo.items).length,
      iguales: iguales,
      faltantes: faltantes, sobrantes: sobrantes,
      piezasFaltantes: r2(faltantes.reduce(function (a, f) { return a + Math.abs(f.dif); }, 0)),
      piezasSobrantes: r2(sobrantes.reduce(function (a, f) { return a + f.dif; }, 0)),
      valorFaltaCosto: r2(valorFaltaCosto),
      valorFaltaVenta: r2(valorFaltaVenta),
      valorSobraCosto: r2(valorSobraCosto)
    };
  }

  // Guarda el resultado y (si se pide) deja el inventario igual a lo contado
  function cerrarConteo(ajustar) {
    var dif = diferenciasConteo();
    if (!dif) return { error: "No hay ningún conteo en curso" };
    if (ajustar) {
      var t = now();
      Object.keys(conteo.items).forEach(function (code) {
        var p = mergedByCode[code];
        if (!p) return;
        var it = touch(code);
        it.e = numOr(conteo.items[code], 0);
        it._te = t;
      });
    }
    overlay.conteos.push({
      id: nuevoId("k"), dev: conf.deviceId, usr: conf.usuario || "",
      t: now(), nota: dif.nota, ajustado: !!ajustar,
      contados: dif.contados,
      faltantes: dif.faltantes.length, sobrantes: dif.sobrantes.length,
      piezasFaltantes: dif.piezasFaltantes,
      valorFaltaCosto: dif.valorFaltaCosto,
      detalle: dif.faltantes.slice(0, 200).map(function (f) {
        return { c: f.c, n: f.n, sistema: f.sistema, contado: f.contado, dif: f.dif, valorCosto: f.valorCosto };
      })
    });
    cancelarConteo();
    persist();
    return { ok: true, resultado: dif };
  }

  function listaConteos() {
    return (overlay.conteos || []).slice().sort(function (a, b) { return b.t - a.t; });
  }

  // Productos agotados o por debajo del mínimo
  function porResurtir() {
    var out = [];
    merged.forEach(function (p) {
      var bp = baseByCode[p.c];
      var min = bp ? numOr(bp.min, 0) : 0;
      if (p.e <= 0 || (min > 0 && p.e < min)) {
        out.push({ c: p.c, n: p.n, e: p.e, min: min, d: p.d, costo: p.co, venta: p.v });
      }
    });
    out.sort(function (a, b) { return a.e - b.e; });
    return out;
  }

  // =====================================================================
  //                         BORRAR / EXPORTAR
  // =====================================================================
  function borrarMisCambios() {
    overlay = clone(EMPTY_OVERLAY);
    persist();
  }
  function exportOverlay() { return clone(overlay); }

  // =====================================================================
  //                      FUSIÓN PARA SINCRONIZAR
  // =====================================================================
  function fusionarMapa(a, b) {
    var out = {}, codes = {};
    Object.keys(a || {}).forEach(function (k) { codes[k] = 1; });
    Object.keys(b || {}).forEach(function (k) { codes[k] = 1; });
    Object.keys(codes).forEach(function (k) {
      var ia = (a || {})[k], ib = (b || {})[k];
      if (!ia) { out[k] = ib; return; }
      if (!ib) { out[k] = ia; return; }
      out[k] = ((ia._t || 0) >= (ib._t || 0)) ? ia : ib;
    });
    return out;
  }
  function fusionarLista(a, b, limite) {
    var seen = {}, out = [];
    (a || []).concat(b || []).forEach(function (s) {
      var key = s.id || ((s.dev || "") + "|" + s.t + "|" + (s.total || s.monto || ""));
      if (seen[key]) return;
      seen[key] = 1;
      out.push(s);
    });
    out.sort(function (x, y) { return (x.t || x.ini || 0) - (y.t || y.ini || 0); });
    if (limite && out.length > limite) out = out.slice(-limite);
    return out;
  }

  function mergeOverlays(a, b) {
    a = sanear(clone(a || EMPTY_OVERLAY));
    b = sanear(clone(b || EMPTY_OVERLAY));
    return {
      v: 2,
      updated: Math.max(a.updated || 0, b.updated || 0),
      items: fusionarMapa(a.items, b.items),
      clientes: fusionarMapa(a.clientes, b.clientes),
      apartados: fusionarMapa(a.apartados, b.apartados),
      sales: fusionarLista(a.sales, b.sales, 2000),
      abonos: fusionarLista(a.abonos, b.abonos, 2000),
      turnos: fusionarLista(a.turnos, b.turnos, 500),
      conteos: fusionarLista(a.conteos, b.conteos, 200)
    };
  }

  function applyRemote(remoteOverlay) {
    overlay = sanear(mergeOverlays(overlay, remoteOverlay || EMPTY_OVERLAY));
    writeLS(LS_OVERLAY, overlay);
    rebuild();
    emit("data");
  }

  // ---------- configuración ----------
  function getConf() { return clone(conf); }
  function setConf(patch) {
    for (var k in patch) conf[k] = patch[k];
    writeLS(LS_CONF, conf);
    emit("conf");
  }

  // =====================================================================
  //                          SINCRONIZACIÓN
  // =====================================================================
  var Sync = (function () {
    var state = { status: "off", msg: "Sin sincronizar", busy: false, pending: false };
    var timer = null;

    function setState(status, msg) { state.status = status; state.msg = msg; emit("sync"); }
    function get() { return clone(state); }

    function api(path, opts) {
      opts = opts || {};
      var headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + conf.token,
        "X-GitHub-Api-Version": "2022-11-28"
      };
      if (opts.body) headers["Content-Type"] = "application/json";
      return fetch("https://api.github.com" + path, {
        method: opts.method || "GET", headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      }).then(function (r) {
        if (!r.ok) {
          return r.text().then(function (t) {
            var e = new Error("HTTP " + r.status);
            e.status = r.status; e.detail = t;
            throw e;
          });
        }
        return r.json();
      });
    }

    function ensureGist() {
      if (conf.gistId) return Promise.resolve(conf.gistId);
      return api("/gists?per_page=100").then(function (list) {
        var found = null;
        (list || []).forEach(function (g) { if (!found && g.files && g.files[GIST_FILE]) found = g.id; });
        if (found) { setConf({ gistId: found }); return found; }
        return api("/gists", {
          method: "POST",
          body: {
            description: GIST_DESC, public: false,
            files: (function () { var f = {}; f[GIST_FILE] = { content: JSON.stringify(exportOverlay()) }; return f; })()
          }
        }).then(function (g) { setConf({ gistId: g.id }); return g.id; });
      });
    }

    function pull() {
      if (!conf.token) return Promise.reject(new Error("sin token"));
      return ensureGist().then(function (id) { return api("/gists/" + id); })
        .then(function (g) {
          var f = g.files && g.files[GIST_FILE];
          if (!f) return null;
          if (f.truncated && f.raw_url) return fetch(f.raw_url).then(function (r) { return r.json(); });
          try { return JSON.parse(f.content); } catch (e) { return null; }
        })
        .then(function (remote) { if (remote) applyRemote(remote); return remote; });
    }

    function push() {
      if (!conf.token) return Promise.reject(new Error("sin token"));
      return ensureGist().then(function (id) {
        var files = {};
        files[GIST_FILE] = { content: JSON.stringify(exportOverlay()) };
        return api("/gists/" + id, { method: "PATCH", body: { files: files } });
      });
    }

    function run(manual) {
      if (!conf.token) { setState("off", "Toca ⚙️ para activar la nube"); return Promise.resolve(false); }
      if (!navigator.onLine) { setState("offline", "Sin señal · se guarda en el celular"); state.pending = true; return Promise.resolve(false); }
      if (state.busy) { state.pending = true; return Promise.resolve(false); }
      state.busy = true;
      setState("syncing", "Sincronizando…");
      return pull().then(function () { return push(); })
        .then(function () {
          state.busy = false; state.pending = false;
          setConf({ lastSync: now() });
          setState("ok", "Guardado en la nube ✓");
          return true;
        })
        .catch(function (err) {
          state.busy = false;
          var msg = "No se pudo sincronizar";
          if (err && err.status === 401) msg = "Token inválido — revísalo en ⚙️";
          else if (err && err.status === 403) msg = "GitHub rechazó el token (permiso gist)";
          else if (!navigator.onLine) msg = "Sin señal · guardado en el celular";
          setState("error", msg);
          if (manual) console.warn("sync error", err);
          return false;
        });
    }

    function schedule() {
      if (!conf.token) return;
      clearTimeout(timer);
      timer = setTimeout(function () { run(false); }, 2500);
    }

    window.addEventListener("online", function () { if (conf.token) run(false); });
    window.addEventListener("offline", function () { setState("offline", "Sin señal · se guarda en el celular"); });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && conf.token) run(false);
    });
    setInterval(function () {
      if (conf.token && !document.hidden && navigator.onLine) run(false);
    }, 60000);

    return { run: run, schedule: schedule, get: get, pull: pull, push: push, setState: setState };
  })();

  rebuild();

  return {
    // inventario
    all: all, get: get, baseOf: baseOf, isEdited: isEdited, countEdits: countEdits,
    updateProduct: updateProduct, addProduct: addProduct,
    deleteProduct: deleteProduct, restoreProduct: restoreProduct,
    porResurtir: porResurtir,
    // ventas
    registrarVenta: registrarVenta, ventasDeHoy: ventasDeHoy, ventasEntre: ventasEntre,
    calcularDescuento: calcularDescuento,
    // clientes / fiados
    listaClientes: listaClientes, getCliente: getCliente, addCliente: addCliente,
    updateCliente: updateCliente, deleteCliente: deleteCliente,
    saldoCliente: saldoCliente, movimientosCliente: movimientosCliente,
    registrarAbono: registrarAbono, totalPorCobrar: totalPorCobrar,
    // apartados
    crearApartado: crearApartado, listaApartados: listaApartados,
    abonarApartado: abonarApartado, entregarApartado: entregarApartado,
    cancelarApartado: cancelarApartado, saldoApartado: saldoApartado,
    abonadoApartado: abonadoApartado,
    // turnos
    abrirTurno: abrirTurno, cerrarTurno: cerrarTurno, turnoActivo: turnoActivo,
    resumenTurno: resumenTurno, listaTurnos: listaTurnos,
    // reportes
    reporte: reporte, reportePeriodo: reportePeriodo, NOMBRE_FORMA: NOMBRE_FORMA,
    // inventario físico
    conteoActivo: conteoActivo, iniciarConteo: iniciarConteo, contarProducto: contarProducto,
    quitarDelConteo: quitarDelConteo, cancelarConteo: cancelarConteo,
    diferenciasConteo: diferenciasConteo, cerrarConteo: cerrarConteo, listaConteos: listaConteos,
    // general
    borrarMisCambios: borrarMisCambios, exportOverlay: exportOverlay,
    applyRemote: applyRemote, mergeOverlays: mergeOverlays,
    getConf: getConf, setConf: setConf,
    onChange: onChange, sync: Sync,
    _debug: { overlay: function () { return overlay; } }
  };
})();
