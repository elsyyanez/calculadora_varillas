/* =========================================================
   Calculadora de Varillas — Lógica
   ---------------------------------------------------------
   Secciones:
     1. Datos de las varillas
     2. Cálculos
     3. Mostrar resultados
     4. Dibujo de la columna (croquis)
     5. Historial (LocalStorage)
     6. PWA (instalación y funcionamiento sin internet)
     7. Barra de título y sus 5 controles (Window Controls Overlay)
     8. Inicio de la app
   ========================================================= */

'use strict';

/* ---------------------------------------------------------
   1. DATOS DE LAS VARILLAS
   --------------------------------------------------------- */

/**
 * Tamaños de varilla disponibles. `pulgadas` es el diámetro.
 * Para agregar o quitar tamaños, basta con editar esta lista.
 */
const VARILLAS = [
  { id: '3/8',   nombre: '3/8"',   pulgadas: 3 / 8 },
  { id: '1/2',   nombre: '1/2"',   pulgadas: 1 / 2 },
  { id: '5/8',   nombre: '5/8"',   pulgadas: 5 / 8 },
  { id: '3/4',   nombre: '3/4"',   pulgadas: 3 / 4 },
  { id: '1',     nombre: '1"',     pulgadas: 1 },
  { id: '1-1/4', nombre: '1 1/4"', pulgadas: 5 / 4 },
];

const MIN_VARILLAS = 4;        // una en cada esquina
const LS_HISTORIAL = 'calcVarillas.historial.v3';
const LS_ULTIMOS   = 'calcVarillas.ultimosDatos';
const MAX_HISTORIAL = 15;

/* ---------------------------------------------------------
   2. CÁLCULOS
   --------------------------------------------------------- */

/** Diámetro de la varilla en cm (1 pulgada = 2.54 cm). */
function diametroCm(varilla) {
  return varilla.pulgadas * 2.54;
}

/** Área de una varilla en cm²: π × d² / 4 */
function areaVarilla(varilla) {
  const d = diametroCm(varilla);
  return (Math.PI * d * d) / 4;
}

/**
 * Cuántas varillas de un tamaño se necesitan.
 * Se redondea hacia arriba y nunca menos de 4.
 */
function opcionConVarilla(varilla, aceroNecesario) {
  const area = areaVarilla(varilla);
  const exacto = Math.ceil(aceroNecesario / area - 1e-9); // el 1e-9 evita errores de redondeo
  const cantidad = Math.max(exacto, MIN_VARILLAS);
  return {
    varilla,
    cantidad,
    usoMinimo: exacto < MIN_VARILLAS,       // true si se subió a 4
    aceroPuesto: cantidad * area,
  };
}

/**
 * Cuando el usuario deja que la app elija:
 * se busca el tamaño que cubre el acero con poco desperdicio
 * y sin usar demasiadas piezas. Se prefieren cantidades pares
 * para que las varillas queden parejas en la columna.
 */
function elegirMejor(opciones, aceroNecesario) {
  let mejor = null;
  let mejorPuntaje = Infinity;
  for (const op of opciones) {
    if (op.cantidad % 2 !== 0 || op.cantidad > 20) continue;
    const desperdicio = (op.aceroPuesto - aceroNecesario) / aceroNecesario;
    const puntaje = desperdicio + 0.015 * op.cantidad;
    if (puntaje < mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = op;
    }
  }
  // Si ninguna opción es par, se usa la de menos varillas.
  return mejor || opciones.reduce((a, b) => (b.cantidad < a.cantidad ? b : a));
}

/** Cálculo completo a partir de los datos del formulario. */
function calcular(ancho, largo, porcentaje, tamano) {
  const areaColumna = ancho * largo;                     // 1. área de la columna
  const aceroNecesario = areaColumna * porcentaje / 100; // 2. acero necesario
  const opciones = VARILLAS.map((v) => opcionConVarilla(v, aceroNecesario)); // 3. varillas

  const elegida = tamano === 'auto'
    ? elegirMejor(opciones, aceroNecesario)
    : opciones.find((op) => op.varilla.id === tamano);

  return { ancho, largo, porcentaje, tamano, areaColumna, aceroNecesario, opciones, elegida };
}

/* ---------------------------------------------------------
   3. MOSTRAR RESULTADOS
   --------------------------------------------------------- */

const $ = (sel) => document.querySelector(sel);

/** Número con 2 decimales. */
const fmt = (n) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Número sin decimales innecesarios (30 → "30"). */
const fmtCorto = (n) => n.toLocaleString('es-MX', { maximumFractionDigits: 2 });

/** "8 varillas de 1/2"" */
const textoVarillas = (op) => `${op.cantidad} varillas de ${op.varilla.nombre}`;

/** Último resultado mostrado (lo usan Copiar, Compartir e Imprimir). */
let ultimoResultado = null;

function mostrarResultado(r) {
  const op = r.elegida;
  ultimoResultado = r;

  $('#respuesta').textContent = textoVarillas(op);
  $('#fColumna').textContent = `${fmtCorto(r.ancho)} × ${fmtCorto(r.largo)} cm`;
  $('#fNecesario').textContent = `${fmt(r.aceroNecesario)} cm²`;
  $('#fPuesto').textContent = `${fmt(op.aceroPuesto)} cm² · ¡Alcanza!`;
  $('#croquis').innerHTML = dibujarColumna(r.ancho, r.largo, op.varilla, op.cantidad);

  // Nota solo cuando hace falta explicar algo
  const nota = $('#nota');
  if (op.usoMinimo) {
    nota.textContent = 'Tu columna necesita poco acero, pero se ponen mínimo 4 varillas: una en cada esquina.';
    nota.hidden = false;
  } else if (r.tamano === 'auto') {
    nota.textContent = `✨ La app eligió varillas de ${op.varilla.nombre} porque cubren lo necesario sin desperdiciar mucho acero.`;
    nota.hidden = false;
  } else {
    nota.hidden = true;
  }

  $('#resultadoVacio').hidden = true;
  $('#resultado').hidden = false;
  mostrarOpciones(r);
  activarControlesResultado(true);
}

/** Lista "Otras opciones": cuántas varillas con cada tamaño. */
function mostrarOpciones(r) {
  $('#listaOpciones').innerHTML = r.opciones
    .map((op) => `
      <li>
        <button type="button" data-id="${op.varilla.id}" class="${op === r.elegida ? 'active' : ''}">
          <span class="o-size">Varilla ${op.varilla.nombre}</span>
          <span class="o-count">${op.cantidad} varillas</span>
        </button>
      </li>`)
    .join('');
  $('#opcionesVacio').hidden = true;
  $('#opcionesAyuda').hidden = false;
}

function limpiarResultados() {
  ultimoResultado = null;
  activarControlesResultado(false);
  $('#resultado').hidden = true;
  $('#resultadoVacio').hidden = false;
  $('#listaOpciones').innerHTML = '';
  $('#opcionesVacio').hidden = false;
  $('#opcionesAyuda').hidden = true;
}

/* ---------------------------------------------------------
   4. DIBUJO DE LA COLUMNA (CROQUIS)
   ---------------------------------------------------------
   Se dibuja a escala: 4 cm de recubrimiento hasta el estribo,
   estribo de 3/8" y las varillas con su tamaño real.
   Primero van 4 varillas en las esquinas; el resto se reparte
   en pares en los lados, según lo largo de cada lado.
   --------------------------------------------------------- */

const RECUBRIMIENTO_CM = 4;
const ESTRIBO_CM = 0.9525; // 3/8"

/** Posiciones (en cm) de cada varilla dentro de la columna. */
function posicionesVarillas(ancho, largo, varilla, cantidad) {
  // En columnas muy chicas el recubrimiento se reduce para que el dibujo se entienda.
  const rec = Math.min(RECUBRIMIENTO_CM, 0.2 * Math.min(ancho, largo));
  const off = rec + ESTRIBO_CM + diametroCm(varilla) / 2;
  const iw = ancho - 2 * off, ih = largo - 2 * off;

  const extras = cantidad - 4;
  const pares = Math.floor(extras / 2);
  const paresH = Math.round(pares * (iw / (iw + ih))); // pares arriba/abajo
  const paresV = pares - paresH;                       // pares izquierda/derecha
  const sobrante = extras % 2;                         // si es impar, una más arriba

  // dx, dy indican hacia dónde va la etiqueta (hacia el centro)
  const pts = [
    { x: off, y: off, dx: 1, dy: 1 },
    { x: off + iw, y: off, dx: -1, dy: 1 },
    { x: off, y: off + ih, dx: 1, dy: -1 },
    { x: off + iw, y: off + ih, dx: -1, dy: -1 },
  ];
  const repartir = (n, fn) => { for (let k = 1; k <= n; k++) fn(k / (n + 1)); };
  repartir(paresH + sobrante, (t) => pts.push({ x: off + iw * t, y: off, dx: 0, dy: 1 }));
  repartir(paresH, (t) => pts.push({ x: off + iw * t, y: off + ih, dx: 0, dy: -1 }));
  repartir(paresV, (t) => pts.push({ x: off, y: off + ih * t, dx: 1, dy: 0 }));
  repartir(paresV, (t) => pts.push({ x: off + iw, y: off + ih * t, dx: -1, dy: 0 }));
  return { pts, rec };
}

/**
 * Devuelve el dibujo SVG de la columna.
 * Con { mini: true } se hace la versión pequeña del historial (sin medidas ni textos).
 */
function dibujarColumna(ancho, largo, varilla, cantidad, { mini = false } = {}) {
  const { pts, rec } = posicionesVarillas(ancho, largo, varilla, cantidad);

  // Tamaño del dibujo y escala (píxeles por cm)
  const VB_W = mini ? 60 : 300, VB_H = mini ? 60 : 290;
  const MAX = mini ? 50 : 196;
  const s = MAX / Math.max(ancho, largo);
  const W = ancho * s, H = largo * s;
  const ox = mini ? (VB_W - W) / 2 : 34 + (MAX - W) / 2;
  const oy = mini ? (VB_H - H) / 2 : 40 + (MAX - H) / 2;

  const C = { borde: '#b8527f', concreto: '#fbeef3', estribo: '#9a6fb5', varilla: '#b8527f', cota: '#8b717e', texto: '#3d2a34' };

  // Concreto y estribo
  const ew = (ancho - 2 * rec) * s, eh = (largo - 2 * rec) * s;
  let svg = `
    <rect x="${ox}" y="${oy}" width="${W}" height="${H}" fill="${mini ? C.concreto : 'url(#concreto)'}" stroke="${C.borde}" stroke-width="${mini ? 1.2 : 1.8}"/>
    <rect x="${ox + rec * s}" y="${oy + rec * s}" width="${ew}" height="${eh}" rx="${1.5 * s}"
          fill="none" stroke="${C.estribo}" stroke-width="${Math.min(3, Math.max(mini ? 0.8 : 1.4, ESTRIBO_CM * s * 0.4))}"/>`;

  // Varillas
  const r = Math.max(mini ? 1.6 : 2.4, (diametroCm(varilla) * s) / 2);
  const xs = pts.map((p) => p.x);
  const etiquetarTodas = cantidad <= 12;                            // con muchas, solo esquinas
  const soloIzquierda = (Math.max(...xs) - Math.min(...xs)) * s < 80; // columnas angostas
  for (const p of pts) {
    const cx = ox + p.x * s, cy = oy + p.y * s;
    svg += `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" fill="${C.varilla}" stroke="#fff" stroke-width="${mini ? 0.5 : 0.9}"/>`;

    const esEsquina = p.dx !== 0 && p.dy !== 0;
    if (!mini && (etiquetarTodas || esEsquina) && !(soloIzquierda && p.dx < 0)) {
      const g = r + 3;
      const tx = cx + p.dx * g;
      const ty = cy + (p.dy > 0 ? g + 6 : p.dy < 0 ? -g : 3);
      const anchor = p.dx > 0 ? 'start' : p.dx < 0 ? 'end' : 'middle';
      svg += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="7.5" text-anchor="${anchor}" fill="${C.texto}" font-weight="600">Ø${varilla.nombre}</text>`;
    }
  }

  if (mini) {
    return `<svg class="h-thumb" viewBox="0 0 ${VB_W} ${VB_H}" aria-hidden="true">${svg}</svg>`;
  }

  // Medidas (cotas)
  const tick = (x, y) => `<line x1="${x - 3}" y1="${y + 3}" x2="${x + 3}" y2="${y - 3}" stroke="${C.cota}" stroke-width="1"/>`;
  const font = `font-family="Segoe UI, system-ui, sans-serif" font-size="10" fill="${C.cota}"`;
  const yTop = oy - 16, xDer = ox + W + 16;

  // Ancho (arriba)
  svg += `
    <line x1="${ox}" y1="${oy - 4}" x2="${ox}" y2="${yTop - 4}" stroke="${C.cota}" stroke-width=".6"/>
    <line x1="${ox + W}" y1="${oy - 4}" x2="${ox + W}" y2="${yTop - 4}" stroke="${C.cota}" stroke-width=".6"/>
    <line x1="${ox}" y1="${yTop}" x2="${ox + W}" y2="${yTop}" stroke="${C.cota}" stroke-width="1"/>
    ${tick(ox, yTop)}${tick(ox + W, yTop)}
    <text x="${ox + W / 2}" y="${yTop - 5}" text-anchor="middle" ${font}>${fmtCorto(ancho)} cm</text>`;

  // Largo (derecha)
  svg += `
    <line x1="${ox + W + 4}" y1="${oy}" x2="${xDer + 4}" y2="${oy}" stroke="${C.cota}" stroke-width=".6"/>
    <line x1="${ox + W + 4}" y1="${oy + H}" x2="${xDer + 4}" y2="${oy + H}" stroke="${C.cota}" stroke-width=".6"/>
    <line x1="${xDer}" y1="${oy}" x2="${xDer}" y2="${oy + H}" stroke="${C.cota}" stroke-width="1"/>
    ${tick(xDer, oy)}${tick(xDer, oy + H)}
    <text x="${xDer + 12}" y="${oy + H / 2}" text-anchor="middle" transform="rotate(-90 ${xDer + 12} ${oy + H / 2})" ${font}>${fmtCorto(largo)} cm</text>`;

  // Recubrimiento (abajo)
  const yRec = oy + H + 12, xr = ox + rec * s;
  svg += `
    <line x1="${xr}" y1="${oy + H - rec * s}" x2="${xr}" y2="${yRec + 4}" stroke="${C.cota}" stroke-width=".6" stroke-dasharray="2 2"/>
    <line x1="${ox}" y1="${oy + H + 2}" x2="${ox}" y2="${yRec + 4}" stroke="${C.cota}" stroke-width=".6"/>
    <line x1="${ox}" y1="${yRec}" x2="${xr}" y2="${yRec}" stroke="${C.cota}" stroke-width="1"/>
    ${tick(ox, yRec)}${tick(xr, yRec)}
    <text x="${ox + W / 2}" y="${yRec + 16}" text-anchor="middle" ${font}>Recubrimiento: ${fmtCorto(rec)} cm</text>`;

  return `
    <svg viewBox="0 0 ${VB_W} ${VB_H}" role="img"
         aria-label="Dibujo de columna de ${fmtCorto(ancho)} por ${fmtCorto(largo)} cm con ${cantidad} varillas de ${varilla.nombre}">
      <defs>
        <!-- Textura del concreto -->
        <pattern id="concreto" width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill="${C.concreto}"/>
          <circle cx="3" cy="4" r=".9" fill="#ecc9d8"/>
          <circle cx="10" cy="9" r=".7" fill="#e2d3ee"/>
          <path d="M7 2 l1.4 2.2 h-2.8z" fill="#f0d4e1"/>
          <circle cx="5" cy="11.5" r=".5" fill="#ecc9d8"/>
        </pattern>
      </defs>
      ${svg}
    </svg>`;
}

/* ---------------------------------------------------------
   5. HISTORIAL (LocalStorage)
   --------------------------------------------------------- */

/** Lectura segura (LocalStorage puede fallar en modo privado). */
function leer(clave, porDefecto) {
  try {
    const valor = localStorage.getItem(clave);
    return valor ? JSON.parse(valor) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function guardar(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* Sin almacenamiento: la app funciona igual, solo sin historial. */
  }
}

function agregarAlHistorial(r) {
  const historial = leer(LS_HISTORIAL, []);

  // Si es igual al último cálculo guardado, no se repite.
  const ultimo = historial[0];
  if (ultimo && ultimo.ancho === r.ancho && ultimo.largo === r.largo &&
      ultimo.porcentaje === r.porcentaje && ultimo.tamano === r.tamano) return;

  historial.unshift({
    fecha: new Date().toISOString(),
    ancho: r.ancho,
    largo: r.largo,
    porcentaje: r.porcentaje,
    tamano: r.tamano,              // lo que eligió el usuario ('auto' o un tamaño)
    varilla: r.elegida.varilla.id, // el tamaño que resultó
    cantidad: r.elegida.cantidad,
  });
  guardar(LS_HISTORIAL, historial.slice(0, MAX_HISTORIAL));
  mostrarHistorial();
}

function mostrarHistorial() {
  const historial = leer(LS_HISTORIAL, []);
  $('#historialVacio').hidden = historial.length > 0;
  $('#btnBorrarHistorial').hidden = historial.length === 0;

  $('#listaHistorial').innerHTML = historial
    .map((h, i) => {
      const varilla = VARILLAS.find((v) => v.id === h.varilla) || VARILLAS[0];
      const fecha = new Date(h.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
      return `
        <li data-index="${i}" tabindex="0" title="Ver este cálculo otra vez">
          ${dibujarColumna(h.ancho, h.largo, varilla, h.cantidad, { mini: true })}
          <div class="h-text">
            <div class="h-main">${fmtCorto(h.ancho)} × ${fmtCorto(h.largo)} cm → ${h.cantidad} varillas de ${varilla.nombre}</div>
            <div class="h-date">${fecha} · ${fmtCorto(h.porcentaje)} % de acero</div>
          </div>
        </li>`;
    })
    .join('');
}

/** Vuelve a mostrar un cálculo del historial. */
function abrirDelHistorial(index) {
  const h = leer(LS_HISTORIAL, [])[index];
  if (!h) return;
  $('#ancho').value = h.ancho;
  $('#largo').value = h.largo;
  $('#porcentaje').value = h.porcentaje;
  $('#diametro').value = h.tamano || 'auto';
  ejecutarCalculo(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------------------------------------------------
   Formulario
   --------------------------------------------------------- */

function mostrarError(msg, campos = []) {
  document.querySelectorAll('input.invalid').forEach((el) => el.classList.remove('invalid'));
  const box = $('#formError');
  box.hidden = !msg;
  box.textContent = msg || '';
  campos.forEach((el) => el.classList.add('invalid'));
  if (campos[0]) campos[0].focus();
}

/**
 * Lee el formulario, revisa los datos y calcula.
 * @param {boolean} guardarEnHistorial
 */
function ejecutarCalculo(guardarEnHistorial = true) {
  const inAncho = $('#ancho'), inLargo = $('#largo'), inPct = $('#porcentaje');
  const ancho = parseFloat(inAncho.value);
  const largo = parseFloat(inLargo.value);
  const porcentaje = parseFloat(inPct.value);
  const tamano = $('#diametro').value;

  const faltan = [];
  if (!(ancho > 0)) faltan.push(inAncho);
  if (!(largo > 0)) faltan.push(inLargo);
  if (faltan.length) return mostrarError('Escribe el ancho y el largo de la columna.', faltan);
  if (!(porcentaje > 0) || porcentaje > 10) return mostrarError('El porcentaje debe estar entre 0.1 y 10 %.', [inPct]);
  mostrarError('');

  const r = calcular(ancho, largo, porcentaje, tamano);
  mostrarResultado(r);
  guardar(LS_ULTIMOS, { ancho, largo, porcentaje, tamano });
  if (guardarEnHistorial) agregarAlHistorial(r);
}

function limpiar() {
  $('#formColumna').reset();
  $('#porcentaje').value = 1;
  $('#diametro').value = 'auto';
  mostrarError('');
  limpiarResultados();
  guardar(LS_ULTIMOS, null);
  $('#ancho').focus();
}

/* ---------------------------------------------------------
   6. PWA — instalación y funcionamiento sin internet
   --------------------------------------------------------- */

function avisar(msg, ms = 4000) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(avisar._timer);
  avisar._timer = setTimeout(() => { t.hidden = true; }, ms);
}

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      reg.update();                                          // busca versión nueva al abrir
      setInterval(() => reg.update(), 60 * 60 * 1000);      // y cada hora

      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        nuevo?.addEventListener('statechange', () => {
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
            avisar('✨ Hay una versión nueva. Actualizando…');
          }
        });
      });
    } catch (err) {
      console.warn('No se pudo registrar el Service Worker:', err);
    }
  });

  // Cuando la versión nueva toma el control, se recarga la página una vez.
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return;
    recargando = true;
    window.location.reload();
  });
}

function configurarInstalacion() {
  let eventoInstalar = null;
  const btn = $('#btnInstall');

  // El navegador avisa que la app se puede instalar → se muestra el botón.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    eventoInstalar = e;
    btn.hidden = false;
  });

  btn.addEventListener('click', async () => {
    if (!eventoInstalar) return;
    btn.hidden = true;
    eventoInstalar.prompt();
    const { outcome } = await eventoInstalar.userChoice;
    if (outcome === 'accepted') avisar('💖 ¡App instalada!');
    eventoInstalar = null;
  });

  window.addEventListener('appinstalled', () => { btn.hidden = true; });
}

/* ---------------------------------------------------------
   7. BARRA DE TÍTULO Y SUS 5 CONTROLES
   ---------------------------------------------------------
   Con la app instalada, el manifest pide "window-controls-overlay":
   la barra de título del sistema desaparece y nuestra barra (#titlebar)
   ocupa su lugar junto a minimizar / maximizar / cerrar.
   Guía: https://learn.microsoft.com/es-es/microsoft-edge/progressive-web-apps/how-to/window-controls-overlay

   Controles:
     1. Nuevo      → limpia el formulario
     2. Copiar     → copia el resultado al portapapeles
     3. Compartir  → comparte el resultado (o lo copia si no se puede)
     4. Imprimir   → imprime el resultado con el dibujo
     5. Ayuda      → abre "¿Cómo se calcula?"
   --------------------------------------------------------- */

/**
 * Copiar, Compartir e Imprimir necesitan un resultado.
 * Los botones siempre están activos; si aún no hay resultado, se avisa.
 */
function activarControlesResultado(activo) {
  document.documentElement.classList.toggle('con-resultado', activo);
}

function hayResultado() {
  if (ultimoResultado) return true;
  avisar('Primero escribe las medidas y presiona Calcular.');
  $('#ancho').focus();
  return false;
}

/** Resultado en texto para copiar o compartir. */
function textoResultado(r) {
  const op = r.elegida;
  return [
    `Columna de ${fmtCorto(r.ancho)} × ${fmtCorto(r.largo)} cm con ${fmtCorto(r.porcentaje)} % de acero`,
    `→ Necesitas ${textoVarillas(op)}`,
    `Acero necesario: ${fmt(r.aceroNecesario)} cm² · Acero con estas varillas: ${fmt(op.aceroPuesto)} cm²`,
  ].join('\n');
}

async function copiarResultado() {
  if (!hayResultado()) return;
  try {
    await navigator.clipboard.writeText(textoResultado(ultimoResultado));
    avisar('📋 Resultado copiado');
  } catch {
    avisar('No se pudo copiar el resultado.');
  }
}

async function compartirResultado() {
  if (!hayResultado()) return;
  const datos = { title: 'Calculadora de Varillas', text: textoResultado(ultimoResultado) };
  if (navigator.share) {
    try {
      await navigator.share(datos);
    } catch (err) {
      if (err.name !== 'AbortError') copiarResultado(); // si falla (no si el usuario cancela), se copia
    }
  } else {
    copiarResultado();
  }
}

function abrirAyuda() {
  const ayuda = $('#ayuda');
  ayuda.open = true;
  ayuda.scrollIntoView({ behavior: 'smooth', block: 'start' });
  ayuda.querySelector('summary').focus({ preventScroll: true });
}

/** Evita ejecutar una función muchas veces seguidas (la recomienda la guía para geometrychange). */
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * Ajusta la barra según el espacio disponible.
 * - Marca <html class="wco"> cuando la superposición está visible.
 * - Si el área de la barra es angosta, muestra solo iconos.
 */
function ajustarBarra(rect) {
  const wco = navigator.windowControlsOverlay;
  const visible = Boolean(wco && wco.visible);
  document.documentElement.classList.toggle('wco', visible);

  const ancho = visible && rect ? rect.width : window.innerWidth;
  $('#titlebar').classList.toggle('compacta', ancho < 620);
}

function configurarBarraTitulo() {
  $('#tbNuevo').addEventListener('click', limpiar);
  $('#tbCopiar').addEventListener('click', copiarResultado);
  $('#tbCompartir').addEventListener('click', compartirResultado);
  $('#tbImprimir').addEventListener('click', () => { if (hayResultado()) window.print(); });
  $('#tbAyuda').addEventListener('click', abrirAyuda);

  // Atajo de teclado: Alt+N = nuevo cálculo
  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      limpiar();
    }
  });

  if ('windowControlsOverlay' in navigator) {
    const wco = navigator.windowControlsOverlay;
    // Estado inicial
    ajustarBarra(wco.visible ? wco.getTitlebarAreaRect() : null);
    // Se dispara al cambiar el tamaño de la ventana o al activar/desactivar la superposición
    wco.addEventListener('geometrychange', debounce((e) => {
      ajustarBarra(e.titlebarAreaRect);
    }, 200));
  } else {
    ajustarBarra(null);
    window.addEventListener('resize', debounce(() => ajustarBarra(null), 200));
  }
}

/* ---------------------------------------------------------
   8. INICIO DE LA APP
   --------------------------------------------------------- */

function init() {
  // Tamaños de varilla en el selector
  const select = $('#diametro');
  VARILLAS.forEach((v) => select.add(new Option(`Varilla de ${v.nombre}`, v.id)));

  // Botones y formulario
  $('#formColumna').addEventListener('submit', (e) => {
    e.preventDefault();
    ejecutarCalculo(true);
  });
  $('#btnLimpiar').addEventListener('click', limpiar);

  // Tocar una "otra opción" la muestra en el resultado
  $('#listaOpciones').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    $('#diametro').value = btn.dataset.id;
    ejecutarCalculo(false);
  });

  // Historial
  $('#btnBorrarHistorial').addEventListener('click', () => {
    if (confirm('¿Borrar todos los cálculos recientes?')) {
      guardar(LS_HISTORIAL, []);
      mostrarHistorial();
    }
  });
  const lista = $('#listaHistorial');
  lista.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-index]');
    if (li) abrirDelHistorial(Number(li.dataset.index));
  });
  lista.addEventListener('keydown', (e) => {
    const li = e.target.closest('li[data-index]');
    if (li && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      abrirDelHistorial(Number(li.dataset.index));
    }
  });

  // Recuperar el último cálculo al abrir la app
  const ultimos = leer(LS_ULTIMOS, null);
  if (ultimos) {
    $('#ancho').value = ultimos.ancho;
    $('#largo').value = ultimos.largo;
    $('#porcentaje').value = ultimos.porcentaje;
    $('#diametro').value = ultimos.tamano || 'auto';
    ejecutarCalculo(false);
  }

  mostrarHistorial();
  configurarBarraTitulo();
  configurarInstalacion();
  registrarServiceWorker();
}

document.addEventListener('DOMContentLoaded', init);
