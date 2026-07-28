/* ===== Ticket en PDF (tamaño de tira, 80mm) =====
   Se genera dentro del celular, sin internet.
   Se comparte por WhatsApp con el botón de compartir del teléfono. */
window.Ticket = (function () {
  "use strict";

  function money(v) {
    var n = Number(v) || 0;
    return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function dosDig(n) { return ("0" + n).slice(-2); }
  function fechaLarga(ts) {
    var d = new Date(ts);
    return dosDig(d.getDate()) + "/" + dosDig(d.getMonth() + 1) + "/" + d.getFullYear() +
      "  " + dosDig(d.getHours()) + ":" + dosDig(d.getMinutes());
  }
  function fechaMas(ts, dias) {
    var d = new Date(ts + dias * 86400000);
    return dosDig(d.getDate()) + "/" + dosDig(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function getJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if (window.jsPDF) return window.jsPDF;
    return null;
  }

  // Construye el PDF y regresa {blob, nombre, doc}
  function construir(venta, conf) {
    var JsPDF = getJsPDF();
    if (!JsPDF) throw new Error("No se pudo cargar el generador de PDF");

    var W = 80;                 // ancho tipo ticket, en mm
    var M = 5;                  // margen
    var ancho = W - M * 2;
    var garantiaDias = parseInt(conf.garantiaDias, 10) || 0;

    // Dibuja el ticket y devuelve el alto realmente usado.
    // Lo hacemos dos veces: la primera para medir, la segunda con el papel a la medida.
    function dibujar(doc) {
    var y = 7;

    function texto(t, opts) {
      opts = opts || {};
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.setFontSize(opts.size || 8);
      var x = M;
      if (opts.align === "center") x = W / 2;
      if (opts.align === "right") x = W - M;
      doc.text(String(t), x, y, { align: opts.align || "left", maxWidth: opts.maxWidth || ancho });
      y += (opts.salto === undefined ? (opts.size || 8) * 0.42 + 1.2 : opts.salto);
    }
    function linea(punteada) {
      doc.setLineWidth(0.2);
      if (punteada) doc.setLineDashPattern([0.6, 0.6], 0);
      doc.line(M, y, W - M, y);
      doc.setLineDashPattern([], 0);
      y += 3;
    }
    function fila(izq, der, opts) {
      opts = opts || {};
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.setFontSize(opts.size || 8);
      doc.text(String(izq), M, y);
      doc.text(String(der), W - M, y, { align: "right" });
      y += (opts.size || 8) * 0.42 + 1.2;
    }

    // ---- encabezado ----
    var negocio = (conf.negocio || "").trim() || "NOTA DE VENTA";
    texto(negocio.toUpperCase(), { bold: true, size: 12, align: "center" });
    if (conf.telefono) texto("Tel. " + conf.telefono, { size: 8, align: "center" });
    y += 1.5;
    linea();

    fila("Folio:", venta.folio || "—", { bold: true });
    fila("Fecha:", fechaLarga(venta.t));
    y += 1;
    linea(true);

    // ---- productos ----
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
    doc.text("CANT  PRODUCTO", M, y);
    doc.text("IMPORTE", W - M, y, { align: "right" });
    y += 4;
    linea(true);

    venta.items.forEach(function (it) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      var nombre = it.n || it.c;
      var trozos = doc.splitTextToSize(it.q + " x " + nombre, ancho - 18);
      doc.text(trozos, M, y);
      doc.text(money((Number(it.p) || 0) * it.q), W - M, y, { align: "right" });
      y += trozos.length * 4.2;
      doc.setFontSize(6.8); doc.setTextColor(110);
      doc.text(money(it.p) + " c/u", M + 2, y);
      doc.setTextColor(0);
      y += 3.4;
    });

    y += 1;
    linea();

    // ---- totales ----
    var sub = (venta.sub !== undefined && venta.sub !== null) ? venta.sub : venta.total;
    if (venta.desc && venta.desc.monto > 0) {
      fila("Subtotal", money(sub), { size: 8.5 });
      var etq = "Descuento" + (venta.desc.tipo === "%" ? " (" + venta.desc.val + "%)" : "");
      fila(etq, "-" + money(venta.desc.monto), { size: 8.5 });
      y += 1;
    }
    fila("TOTAL", money(venta.total), { bold: true, size: 13 });
    y += 2;

    // ---- garantía ----
    if (garantiaDias > 0 || conf.garantiaTexto) {
      linea();
      texto("GARANTÍA", { bold: true, size: 9, align: "center" });
      y += 0.5;
      var txt = (conf.garantiaTexto || "").trim();
      if (!txt) {
        txt = "Este comprobante ampara la garantía del producto. Conserve esta nota; " +
              "es indispensable para hacerla válida.";
      }
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.2);
      var lg = doc.splitTextToSize(txt, ancho);
      doc.text(lg, M, y);
      y += lg.length * 3.2 + 1.5;
      if (garantiaDias > 0) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(8);
        doc.text("Válida hasta: " + fechaMas(venta.t, garantiaDias) +
                 "  (" + garantiaDias + " días)", M, y);
        y += 4.5;
      }
    }

    // ---- pie ----
    y += 1;
    linea(true);
    texto("¡Gracias por su compra!", { size: 8.5, align: "center", bold: true });

      return y;
    }

    // 1ª pasada: medir sobre un papel provisional
    var medidor = new JsPDF({ unit: "mm", format: [W, 400], orientation: "portrait" });
    var altoUsado = dibujar(medidor);

    // 2ª pasada: el papel del tamaño exacto
    var doc = new JsPDF({ unit: "mm", format: [W, Math.max(40, altoUsado + 4)], orientation: "portrait" });
    dibujar(doc);

    var nombreArchivo = "ticket-" + (venta.folio || venta.t) + ".pdf";
    return { doc: doc, blob: doc.output("blob"), nombre: nombreArchivo };
  }

  // Comparte (WhatsApp y demás) o descarga si el celular no soporta compartir archivos
  function compartir(venta, conf) {
    var r;
    try { r = construir(venta, conf); }
    catch (e) { return Promise.resolve({ ok: false, error: e.message }); }

    var archivo = null;
    try {
      archivo = new File([r.blob], r.nombre, { type: "application/pdf" });
    } catch (e) { archivo = null; }

    var texto = (conf.negocio ? conf.negocio + " — " : "") + "Nota " + (venta.folio || "") +
                " por " + money(venta.total);

    if (archivo && navigator.canShare && navigator.canShare({ files: [archivo] }) && navigator.share) {
      return navigator.share({ files: [archivo], title: "Ticket " + (venta.folio || ""), text: texto })
        .then(function () { return { ok: true, modo: "compartido" }; })
        .catch(function (e) {
          if (e && e.name === "AbortError") return { ok: true, modo: "cancelado" };
          return descargar(r);
        });
    }
    return Promise.resolve(descargar(r));
  }

  function descargar(r) {
    try {
      var url = URL.createObjectURL(r.blob);
      var a = document.createElement("a");
      a.href = url; a.download = r.nombre;
      document.body.appendChild(a); a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
      return { ok: true, modo: "descargado" };
    } catch (e) {
      return { ok: false, error: "No se pudo guardar el ticket" };
    }
  }

  return { construir: construir, compartir: compartir };
})();
