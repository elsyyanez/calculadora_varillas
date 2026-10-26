/* =========================================================
   Calculadora de Varillas — Compartir y exportar
   ---------------------------------------------------------
   El botón "Compartir" de la barra abre un menú para:
     • Compartir con el menú del sistema (WhatsApp, correo…)
     • Copiar el resultado
     • Descargar el resultado en Excel, Word, CSV, JSON o texto

   Los archivos se generan aquí mismo, sin librerías ni internet:
   .xlsx y .docx son ZIP con XML dentro (se arman sin comprimir).
   Se carga después de app.js y usa sus funciones y datos.
   ========================================================= */

(function () {
  'use strict';

  /* ---------------------------------------------------------
     ZIP mínimo (método "store", sin compresión)
     --------------------------------------------------------- */
  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /** archivos: { 'ruta/dentro.xml': string | Uint8Array }  →  lista de partes para un Blob */
  function crearZip(archivos, fecha = new Date()) {
    const enc = new TextEncoder();
    const hora = (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | (fecha.getSeconds() >> 1);
    const dia = ((Math.max(fecha.getFullYear(), 1980) - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate();
    const partes = [];
    const central = [];
    let offset = 0;

    for (const [nombre, contenido] of Object.entries(archivos)) {
      const nom = enc.encode(nombre);
      const datos = typeof contenido === 'string' ? enc.encode(contenido) : contenido;
      const crc = crc32(datos);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);   // nombres en UTF-8
      local.setUint16(8, 0, true);        // sin compresión
      local.setUint16(10, hora, true);
      local.setUint16(12, dia, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, datos.length, true);
      local.setUint32(22, datos.length, true);
      local.setUint16(26, nom.length, true);
      partes.push(new Uint8Array(local.buffer), nom, datos);

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(12, hora, true);
      cd.setUint16(14, dia, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, datos.length, true);
      cd.setUint32(24, datos.length, true);
      cd.setUint16(28, nom.length, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), nom);

      offset += 30 + nom.length + datos.length;
    }

    const total = Object.keys(archivos).length;
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, total, true);
    fin.setUint16(10, total, true);
    fin.setUint32(12, central.reduce((s, p) => s + p.length, 0), true);
    fin.setUint32(16, offset, true);
    return [...partes, ...central, new Uint8Array(fin.buffer)];
  }

  const escXml = (s) => String(s).replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const CT  = 'http://schemas.openxmlformats.org/package/2006/content-types';

  /* ---------------------------------------------------------
     Excel (.xlsx): varias hojas
     hojas = [{ nombre, filas, anchos }]  (número = celda numérica)
     --------------------------------------------------------- */
  function generarXLSX(hojas, fecha) {
    const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const letra = (i) => String.fromCharCode(65 + i);

    const archivos = {
      '[Content_Types].xml': `${XML}<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
      '_rels/.rels': `${XML}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml': `${XML}<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>${hojas.map((h, i) => `<sheet name="${escXml(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `${XML}<Relationships xmlns="${PKG}">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
      'xl/styles.xml': `${XML}<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
    };

    hojas.forEach((h, i) => {
      const cols = (h.anchos || []).map((a, c) => `<col min="${c + 1}" max="${c + 1}" width="${a}" customWidth="1"/>`).join('');
      const datos = h.filas.map((fila, r) => {
        const celdas = fila.map((v, c) => {
          const ref = letra(c) + (r + 1);
          if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
          return `<c r="${ref}" t="inlineStr"${r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${escXml(v)}</t></is></c>`;
        }).join('');
        return `<row r="${r + 1}">${celdas}</row>`;
      }).join('');
      archivos[`xl/worksheets/sheet${i + 1}.xml`] = `${XML}<worksheet xmlns="${NS}">${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${datos}</sheetData></worksheet>`;
    });

    return crearZip(archivos, fecha);
  }

  /* ---------------------------------------------------------
     Word (.docx)
     doc = { titulo, subtitulo, bloques, imagen }
     bloques: { tipo: 'h', texto } | { tipo: 'p', texto } |
              { tipo: 'tabla', filas, anchos } | { tipo: 'img' }
     imagen: { bytes: Uint8Array (PNG), ancho, alto }  (píxeles)
     --------------------------------------------------------- */
  function generarDOCX(doc, fecha) {
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
    const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
    const borde = (n) => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`;

    const parrafo = (texto, { negrita = false, tam = 22, despues = 120, color = '' } = {}) =>
      `<w:p><w:pPr><w:spacing w:after="${despues}"/></w:pPr><w:r><w:rPr>${negrita ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}<w:sz w:val="${tam}"/></w:rPr><w:t xml:space="preserve">${escXml(texto)}</w:t></w:r></w:p>`;

    const tabla = (filas, anchos) => {
      const celda = (v, c, enc) =>
        `<w:tc><w:tcPr><w:tcW w:w="${anchos[c]}" w:type="dxa"/>${enc ? '<w:shd w:val="clear" w:color="auto" w:fill="FDEEF4"/>' : ''}</w:tcPr>${parrafo(String(v), { negrita: enc, despues: 40 })}</w:tc>`;
      return `<w:tbl><w:tblPr><w:tblW w:w="${anchos.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(borde).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${anchos.map((a) => `<w:gridCol w:w="${a}"/>`).join('')}</w:tblGrid>${filas.map((f, r) => `<w:tr>${f.map((v, c) => celda(v, c, r === 0)).join('')}</w:tr>`).join('')}</w:tbl>`;
    };

    const imagen = () => {
      const im = doc.imagen;
      const cx = Math.round(im.ancho * 9525), cy = Math.round(im.alto * 9525);
      return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Croquis" descr="Dibujo de la columna con sus varillas"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${A}" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="${A}"><a:graphicData uri="${PIC}"><pic:pic xmlns:pic="${PIC}"><pic:nvPicPr><pic:cNvPr id="0" name="croquis.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    };

    let cuerpo = parrafo(doc.titulo, { negrita: true, tam: 36, despues: 60, color: '93406A' }) +
                 parrafo(doc.subtitulo, { tam: 20, despues: 240, color: '8B717E' });
    for (const b of doc.bloques) {
      if (b.tipo === 'h') cuerpo += parrafo(b.texto, { negrita: true, tam: 26, despues: 100, color: '93406A' });
      else if (b.tipo === 'p') cuerpo += parrafo(b.texto);
      else if (b.tipo === 'tabla') cuerpo += tabla(b.filas, b.anchos) + parrafo('', { despues: 160 });
      else if (b.tipo === 'img' && doc.imagen) cuerpo += imagen();
    }

    const archivos = {
      '[Content_Types].xml': `${XML}<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${doc.imagen ? '<Default Extension="png" ContentType="image/png"/>' : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
      '_rels/.rels': `${XML}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`,
      'word/document.xml': `${XML}<w:document xmlns:w="${W}" xmlns:r="${REL}" xmlns:wp="${WP}"><w:body>${cuerpo}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1440" w:bottom="1134" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`
    };
    if (doc.imagen) {
      archivos['word/_rels/document.xml.rels'] = `${XML}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/image" Target="media/croquis.png"/></Relationships>`;
      archivos['word/media/croquis.png'] = doc.imagen.bytes;
    }
    return crearZip(archivos, fecha);
  }

  /* ---------------------------------------------------------
     CSV, texto y JSON
     --------------------------------------------------------- */
  function generarCSV(tablas) {
    const celda = (v) => {
      const s = String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // BOM al inicio para que Excel respete los acentos
    return '﻿' + tablas.map((t) => t.map((f) => f.map(celda).join(',')).join('\r\n')).join('\r\n\r\n') + '\r\n';
  }

  /* ---------------------------------------------------------
     Datos a exportar (salen de ultimoResultado, de app.js)
     --------------------------------------------------------- */
  const r2 = (n) => Math.round(n * 100) / 100;

  function obtenerDatos(r, historial, fecha = new Date()) {
    const op = r.elegida;
    const resultado = [
      ['Concepto', 'Valor', 'Unidad'],
      ['Ancho de la columna', r.ancho, 'cm'],
      ['Largo de la columna', r.largo, 'cm'],
      ['Porcentaje de acero', r.porcentaje, '%'],
      ['Área de la columna', r2(r.areaColumna), 'cm²'],
      ['Acero necesario', r2(r.aceroNecesario), 'cm²'],
      ['Tamaño de varilla', op.varilla.nombre, ''],
      ['Cantidad de varillas', op.cantidad, 'varillas'],
      ['Acero con estas varillas', r2(op.aceroPuesto), 'cm²'],
      ['Fecha', fecha.toLocaleString('es-MX'), '']
    ];
    const opciones = [['Varilla', 'Cantidad', 'Acero aportado (cm²)', 'Elegida']].concat(
      r.opciones.map((o) => [o.varilla.nombre, o.cantidad, r2(o.aceroPuesto), o === op ? 'Sí' : ''])
    );
    const hist = [['Fecha', 'Ancho (cm)', 'Largo (cm)', 'Acero (%)', 'Varilla', 'Cantidad']].concat(
      historial.map((h) => [
        new Date(h.fecha).toLocaleString('es-MX'), h.ancho, h.largo, h.porcentaje, h.nombreVarilla, h.cantidad
      ])
    );
    return { r, op, fecha, resultado, opciones, hist };
  }

  function generarJSON(d) {
    const { r, op } = d;
    return JSON.stringify({
      fecha: d.fecha.toISOString(),
      columna: { ancho_cm: r.ancho, largo_cm: r.largo, area_cm2: r2(r.areaColumna) },
      porcentaje_acero: r.porcentaje,
      acero_necesario_cm2: r2(r.aceroNecesario),
      resultado: { varilla: op.varilla.nombre, cantidad: op.cantidad, acero_puesto_cm2: r2(op.aceroPuesto) },
      otras_opciones: r.opciones.map((o) => ({ varilla: o.varilla.nombre, cantidad: o.cantidad, acero_puesto_cm2: r2(o.aceroPuesto) })),
      historial: d.hist.slice(1).map(([fecha, ancho, largo, pct, varilla, cantidad]) => ({ fecha, ancho_cm: ancho, largo_cm: largo, porcentaje: pct, varilla, cantidad }))
    }, null, 2);
  }

  const crearArchivo = {
    xlsx: (d) => generarXLSX([
      { nombre: 'Resultado', filas: d.resultado, anchos: [28, 22, 12] },
      { nombre: 'Otras opciones', filas: d.opciones, anchos: [14, 12, 22, 10] },
      { nombre: 'Historial', filas: d.hist, anchos: [22, 12, 12, 10, 10, 10] }
    ], d.fecha),
    csv: (d) => generarCSV([d.resultado, d.opciones]),
    json: generarJSON,
    txt: () => textoResultado(ultimoResultado) + '\n'
  };

  const MIME = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    csv: 'text/csv;charset=utf-8',
    json: 'application/json',
    txt: 'text/plain;charset=utf-8'
  };

  /* ---------------------------------------------------------
     Croquis → PNG (para el Word). Si falla, el Word sale sin dibujo.
     --------------------------------------------------------- */
  async function croquisComoPNG() {
    try {
      const svg = document.querySelector('#croquis svg');
      if (!svg) return null;
      const [, , vw, vh] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
      const copia = svg.cloneNode(true);
      copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      copia.setAttribute('width', vw * 3);
      copia.setAttribute('height', vh * 3);
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copia));
      const img = new Image();
      await new Promise((ok, mal) => { img.onload = ok; img.onerror = mal; img.src = url; });
      const lienzo = document.createElement('canvas');
      lienzo.width = vw * 3;
      lienzo.height = vh * 3;
      const ctx = lienzo.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, lienzo.width, lienzo.height);
      ctx.drawImage(img, 0, 0);
      const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/png'));
      if (!blob) return null;
      return { bytes: new Uint8Array(await blob.arrayBuffer()), ancho: vw * 1.4, alto: vh * 1.4 };
    } catch {
      return null;
    }
  }

  async function crearWord(d) {
    const imagen = await croquisComoPNG();
    return generarDOCX({
      titulo: 'Calculadora de Varillas',
      subtitulo: `Columna de ${fmtCorto(d.r.ancho)} × ${fmtCorto(d.r.largo)} cm · ${d.fecha.toLocaleString('es-MX')}`,
      imagen,
      bloques: [
        { tipo: 'h', texto: `Necesitas ${textoVarillas(d.op)}` },
        { tipo: 'img' },
        { tipo: 'tabla', filas: d.resultado.slice(0, -1), anchos: [3800, 2800, 2400] },
        { tipo: 'h', texto: 'Otras opciones' },
        { tipo: 'tabla', filas: d.opciones, anchos: [2200, 2000, 3200, 1600] },
        { tipo: 'p', texto: 'Siempre se usan al menos 4 varillas, una en cada esquina.' }
      ]
    }, d.fecha);
  }

  /* ---------------------------------------------------------
     Pruebas fuera del navegador (node) y salida
     --------------------------------------------------------- */
  if (typeof module !== 'undefined') {
    module.exports = { crearZip, generarXLSX, generarDOCX, generarCSV, obtenerDatos, generarJSON };
  }
  if (typeof document === 'undefined') return;

  /* ---------------------------------------------------------
     Menú del botón Compartir
     --------------------------------------------------------- */
  const menu = document.getElementById('menuCompartir');
  const boton = document.getElementById('tbCompartir');

  function cerrarMenu() {
    if (menu.hidden) return;
    menu.hidden = true;
    boton.setAttribute('aria-expanded', 'false');
  }
  function abrirMenu() {
    menu.hidden = false;
    boton.setAttribute('aria-expanded', 'true');
    menu.querySelector('button').focus();
  }

  boton.setAttribute('aria-haspopup', 'menu');
  boton.setAttribute('aria-expanded', 'false');
  boton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!menu.hidden) return cerrarMenu();
    if (hayResultado()) abrirMenu();        // sin resultado, avisa que hay que calcular
  });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) cerrarMenu(); });
  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      boton.click();
      return;
    }
    if (menu.hidden) return;
    if (e.key === 'Escape') { cerrarMenu(); boton.focus(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [...menu.querySelectorAll('button')];
      const i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    }
  });

  async function descargar(formato) {
    if (!hayResultado()) return;
    const historial = leer(LS_HISTORIAL, []).map((h) => ({
      ...h,
      nombreVarilla: (VARILLAS.find((v) => v.id === h.varilla) || VARILLAS[0]).nombre
    }));
    const d = obtenerDatos(ultimoResultado, historial);
    const contenido = formato === 'docx' ? await crearWord(d) : crearArchivo[formato](d);
    const blob = new Blob(Array.isArray(contenido) ? contenido : [contenido], { type: MIME[formato] });

    const sello = d.fecha.toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const nombre = `varillas-${fmtCorto(d.r.ancho)}x${fmtCorto(d.r.largo)}-${sello}.${formato}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    avisar('⬇ Exportado: ' + nombre);
  }

  menu.addEventListener('click', async (e) => {
    const item = e.target.closest('button[data-accion]');
    if (!item) return;
    const accion = item.dataset.accion;
    cerrarMenu();
    try {
      if (accion === 'compartir') await compartirResultado();
      else if (accion === 'copiar') await copiarResultado();
      else await descargar(accion);
    } catch (err) {
      console.error(err);
      avisar('No se pudo exportar el archivo.');
    }
  });
})();
