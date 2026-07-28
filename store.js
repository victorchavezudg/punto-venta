/* ===== Mi Punto de Venta — capa de datos =====
   Idea clave: el inventario base (data.js) NUNCA se toca.
   Los cambios de Victor viven en una "capa de cambios" aparte (overlay),
   guardada en el celular y sincronizada a la nube.
   Así, cuando se actualice el programa o el inventario base,
   sus cambios siguen ahí.
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
  var EMPTY_OVERLAY = { v: 1, updated: 0, items: {}, sales: [] };
  var overlay = readLS(LS_OVERLAY, EMPTY_OVERLAY);
  if (!overlay.items) overlay.items = {};
  if (!overlay.sales) overlay.sales = [];

  var conf = readLS(LS_CONF, {
    token: "", gistId: "", lastSync: 0, autoStock: true, deviceId: "",
    negocio: "", telefono: "", garantiaDias: 0, garantiaTexto: "", folioSeq: 0
  });
  if (!conf.deviceId) {
    conf.deviceId = "d" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
    writeLS(LS_CONF, conf);
  }

  var base = (window.PRODUCTS || []).slice();
  var baseByCode = {};
  base.forEach(function (p) { if (p.c) baseByCode[p.c] = p; });

  var merged = [];      // lista final visible
  var mergedByCode = {};
  var listeners = [];

  function onChange(fn) { listeners.push(fn); }
  function emit(what) { listeners.forEach(function (f) { try { f(what); } catch (e) {} }); }

  // ---------- merge base + overlay ----------
  // Cuántas piezas se han vendido de cada producto, y cuándo.
  // Así el descuento se calcula sumando las ventas de todos los celulares,
  // en vez de que cada uno guarde su propio número final (que se pisaría).
  function ventasPorCodigo() {
    var map = {};
    (overlay.sales || []).forEach(function (s) {
      if (s.dec === false) return;
      (s.items || []).forEach(function (i) {
        if (!map[i.c]) map[i.c] = [];
        map[i.c].push({ t: s.t, q: Number(i.q) || 0 });
      });
    });
    return map;
  }

  function existenciaReal(code, baseE, ov, vpc) {
    // punto de partida: el ajuste manual más reciente, o lo que traía eleventa
    var e0 = (ov && ov.e !== undefined) ? Number(ov.e) : Number(baseE);
    var t0 = (ov && ov._te) ? ov._te : 0;
    var vendidas = 0;
    var lista = vpc[code] || [];
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].t > t0) vendidas += lista[i].q;   // solo lo vendido DESPUÉS del ajuste
    }
    return (isFinite(e0) ? e0 : 0) - vendidas;
  }

  function rebuild() {
    merged = [];
    mergedByCode = {};
    var vpc = ventasPorCodigo();
    var i, p, ov;

    for (i = 0; i < base.length; i++) {
      p = base[i];
      ov = overlay.items[p.c];
      if (ov && ov._del) continue;               // borrado por el usuario
      var out = {
        c: p.c,
        n: (ov && ov.n !== undefined) ? ov.n : p.n,
        co: (ov && ov.co !== undefined) ? ov.co : p.co,
        v: (ov && ov.v !== undefined) ? ov.v : p.v,
        m: (ov && ov.m !== undefined) ? ov.m : p.m,
        e: existenciaReal(p.c, p.e, ov, vpc),
        d: (ov && ov.d !== undefined) ? ov.d : p.d,
        _edit: !!ov,
        _new: false
      };
      merged.push(out);
      mergedByCode[out.c] = out;
    }

    // productos nuevos (no existen en el inventario base)
    for (var code in overlay.items) {
      ov = overlay.items[code];
      if (!ov || !ov._new || ov._del) continue;
      if (baseByCode[code]) continue;
      var np = {
        c: code,
        n: ov.n || "(sin nombre)",
        co: numOr(ov.co, 0), v: numOr(ov.v, 0), m: numOr(ov.m, 0),
        e: existenciaReal(code, 0, ov, vpc), d: ov.d || "Nuevos",
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

  // ---------- API pública de datos ----------
  function all() { return merged; }
  function get(code) { return mergedByCode[code]; }
  function baseOf(code) { return baseByCode[code]; }
  function countEdits() { return Object.keys(overlay.items).length; }

  function updateProduct(code, fields) {
    var it = touch(code);
    var bp = baseByCode[code];
    ["n", "co", "v", "m", "e", "d"].forEach(function (k) {
      if (fields[k] === undefined) return;
      var val = (k === "n" || k === "d") ? String(fields[k]).trim() : numOr(fields[k], 0);
      // si vuelve a coincidir con el original, quitamos el override
      if (k === "e") it._te = now();   // nuevo punto de partida del conteo
      if (bp && !it._new && bp[k] === val && k !== "e") { delete it[k]; }
      else { it[k] = val; }
    });
    // si el override quedó vacío y no es nuevo ni borrado, lo eliminamos
    cleanupIfEmpty(code);
    persist();
    return get(code);
  }

  function cleanupIfEmpty(code) {
    var it = overlay.items[code];
    if (!it) return;
    if (it._new || it._del) return;
    var keys = Object.keys(it).filter(function (k) { return k !== "_t" && k !== "_te"; });
    if (keys.length === 0) delete overlay.items[code];
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
    if (it._new) { delete overlay.items[code]; }   // era nuevo: se borra del todo
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

  function isEdited(code) { return !!overlay.items[code]; }

  // ---------- ventas ----------
  function siguienteFolio() {
    conf.folioSeq = (conf.folioSeq || 0) + 1;
    writeLS(LS_CONF, conf);
    var pref = (conf.deviceId || "XX").slice(-2).toUpperCase();
    return pref + "-" + String(conf.folioSeq).padStart(4, "0");
  }

  function registrarVenta(items, total, descontar, extra) {
    // items: [{c, n, q, p}]
    // No guardamos la existencia final: guardamos LA VENTA.
    // La existencia se calcula sumando las ventas de todos los celulares,
    // así dos personas pueden vender a la vez sin perder descuentos.
    extra = extra || {};
    var t = now();
    var venta = {
      id: conf.deviceId + "-" + t + "-" + Math.random().toString(36).slice(2, 7),
      dev: conf.deviceId,
      folio: siguienteFolio(),
      t: t,
      dec: descontar !== false,
      sub: extra.sub !== undefined ? extra.sub : total,   // antes del descuento
      desc: extra.desc || null,                            // {tipo:"$"|"%", val, monto}
      total: total,
      items: items.map(function (i) { return { c: i.c, n: i.n, q: i.q, p: i.p }; })
    };
    overlay.sales.push(venta);
    // conservar solo las últimas 500 ventas
    if (overlay.sales.length > 500) overlay.sales = overlay.sales.slice(-500);
    persist();
    return venta;
  }

  // Calcula el descuento de una venta. tipo: "$" (pesos) o "%" (porcentaje)
  function calcularDescuento(subtotal, tipo, valor) {
    var v = parseFloat(valor);
    if (!isFinite(v) || v <= 0) return { tipo: tipo, val: 0, monto: 0 };
    var monto = (tipo === "%") ? (subtotal * v / 100) : v;
    if (monto > subtotal) monto = subtotal;      // nunca dejar el total en negativo
    monto = Math.round(monto * 100) / 100;
    return { tipo: tipo, val: v, monto: monto };
  }

  function ventasDeHoy() {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    var desde = d.getTime();
    var list = overlay.sales.filter(function (s) { return s.t >= desde; });
    var total = list.reduce(function (a, s) { return a + (s.total || 0); }, 0);
    var piezas = list.reduce(function (a, s) {
      return a + s.items.reduce(function (x, i) { return x + i.q; }, 0);
    }, 0);
    return { n: list.length, total: total, piezas: piezas, list: list };
  }

  function borrarMisCambios() {
    overlay = clone(EMPTY_OVERLAY);
    persist();
  }

  function exportOverlay() { return clone(overlay); }

  // ---------- fusión de dos overlays (para sincronizar) ----------
  function mergeOverlays(a, b) {
    // gana el cambio más reciente, producto por producto
    var out = { v: 1, updated: Math.max(a.updated || 0, b.updated || 0), items: {}, sales: [] };
    var codes = {};
    Object.keys(a.items || {}).forEach(function (k) { codes[k] = 1; });
    Object.keys(b.items || {}).forEach(function (k) { codes[k] = 1; });
    Object.keys(codes).forEach(function (k) {
      var ia = (a.items || {})[k], ib = (b.items || {})[k];
      if (!ia) { out.items[k] = ib; return; }
      if (!ib) { out.items[k] = ia; return; }
      out.items[k] = ((ia._t || 0) >= (ib._t || 0)) ? ia : ib;
    });
    // ventas: unir sin duplicar (por marca de tiempo + total)
    var seen = {};
    (a.sales || []).concat(b.sales || []).forEach(function (s) {
      var key = s.id || (s.dev || "") + "|" + s.t + "|" + s.total;
      if (seen[key]) return;
      seen[key] = 1;
      out.sales.push(s);
    });
    out.sales.sort(function (x, y) { return x.t - y.t; });
    if (out.sales.length > 500) out.sales = out.sales.slice(-500);
    return out;
  }

  function applyRemote(remoteOverlay) {
    overlay = mergeOverlays(overlay, remoteOverlay || EMPTY_OVERLAY);
    if (!overlay.items) overlay.items = {};
    if (!overlay.sales) overlay.sales = [];
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

  // =======================================================
  //                    SINCRONIZACIÓN
  // =======================================================
  var Sync = (function () {
    var state = { status: "off", msg: "Sin sincronizar", busy: false, pending: false };
    var timer = null;

    function setState(status, msg) {
      state.status = status; state.msg = msg;
      emit("sync");
    }
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
        method: opts.method || "GET",
        headers: headers,
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

    // Busca un gist existente con nuestro archivo; si no hay, lo crea.
    function ensureGist() {
      if (conf.gistId) return Promise.resolve(conf.gistId);
      return api("/gists?per_page=100").then(function (list) {
        var found = null;
        (list || []).forEach(function (g) {
          if (!found && g.files && g.files[GIST_FILE]) found = g.id;
        });
        if (found) { setConf({ gistId: found }); return found; }
        return api("/gists", {
          method: "POST",
          body: {
            description: GIST_DESC,
            public: false,
            files: (function () { var f = {}; f[GIST_FILE] = { content: JSON.stringify(exportOverlay()) }; return f; })()
          }
        }).then(function (g) { setConf({ gistId: g.id }); return g.id; });
      });
    }

    function pull() {
      if (!conf.token) return Promise.reject(new Error("sin token"));
      return ensureGist().then(function (id) {
        return api("/gists/" + id);
      }).then(function (g) {
        var f = g.files && g.files[GIST_FILE];
        if (!f) return null;
        if (f.truncated && f.raw_url) {
          return fetch(f.raw_url).then(function (r) { return r.json(); });
        }
        try { return JSON.parse(f.content); } catch (e) { return null; }
      }).then(function (remote) {
        if (remote) applyRemote(remote);
        return remote;
      });
    }

    function push() {
      if (!conf.token) return Promise.reject(new Error("sin token"));
      return ensureGist().then(function (id) {
        var files = {};
        files[GIST_FILE] = { content: JSON.stringify(exportOverlay()) };
        return api("/gists/" + id, { method: "PATCH", body: { files: files } });
      });
    }

    // Sincronizar = traer, fusionar, subir
    function run(manual) {
      if (!conf.token) { setState("off", "Toca ⚙️ para activar la nube"); return Promise.resolve(false); }
      if (!navigator.onLine) { setState("offline", "Sin señal · se guarda en el celular"); state.pending = true; return Promise.resolve(false); }
      if (state.busy) { state.pending = true; return Promise.resolve(false); }
      state.busy = true;
      setState("syncing", "Sincronizando…");
      return pull()
        .then(function () { return push(); })
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
    // con varios celulares conviene refrescar seguido:
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && conf.token) run(false);
    });
    setInterval(function () {
      if (conf.token && !document.hidden && navigator.onLine) run(false);
    }, 60000);
    window.addEventListener("offline", function () { setState("offline", "Sin señal · se guarda en el celular"); });

    return { run: run, schedule: schedule, get: get, pull: pull, push: push, setState: setState };
  })();

  // arranque
  rebuild();

  return {
    all: all, get: get, baseOf: baseOf, isEdited: isEdited, countEdits: countEdits,
    updateProduct: updateProduct, addProduct: addProduct,
    deleteProduct: deleteProduct, restoreProduct: restoreProduct,
    registrarVenta: registrarVenta, ventasDeHoy: ventasDeHoy,
    calcularDescuento: calcularDescuento,
    borrarMisCambios: borrarMisCambios, exportOverlay: exportOverlay,
    applyRemote: applyRemote, mergeOverlays: mergeOverlays,
    getConf: getConf, setConf: setConf,
    onChange: onChange, sync: Sync,
    _debug: { overlay: function () { return overlay; } }
  };
})();
