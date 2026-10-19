# Calculadora de Varillas (PWA)

App web que dice **cuántas varillas necesita una columna de concreto**.
Escribes el ancho, el largo y el porcentaje de acero, y la app responde algo como
**"Necesitas 8 varillas de 1/2""**, con un dibujo de cómo quedan en la columna.

Hecha con HTML, CSS y JavaScript. Se puede instalar como aplicación y funciona sin internet.

## Cómo se usa

1. Escribe el **ancho** y el **largo** de la columna en centímetros.
2. Deja el **porcentaje de acero** en 1 % (o cámbialo si te lo piden).
3. Elige un **tamaño de varilla**, o deja que la app elija por ti.
4. Presiona **Calcular**.

Además:
- En **Otras opciones** ves cuántas varillas harían falta con cada tamaño. Toca una para verla en el dibujo.
- En **Cálculos recientes** se guardan tus últimos cálculos. Toca uno para verlo otra vez.

## Barra de controles

Arriba de la app hay una barra con 5 controles:

| Control | Qué hace |
|---|---|
| ➕ **Nuevo** | Limpia el formulario para un cálculo nuevo (atajo: Alt+N) |
| 📋 **Copiar** | Copia el resultado como texto |
| 🔗 **Compartir** | Comparte el resultado (WhatsApp, correo…); si no se puede, lo copia |
| 🖨️ **Imprimir** | Imprime el resultado con el dibujo de la columna |
| ❓ **Ayuda** | Abre "¿Cómo se calcula?" |

Si presionas Copiar, Compartir o Imprimir antes de calcular, la app te avisa que primero hay que calcular.

Con la app **instalada**, la barra usa *Window Controls Overlay*: ocupa la barra de título de la ventana,
junto a los botones de minimizar, maximizar y cerrar, y sirve para arrastrar la ventana.
En el navegador se ve como una barra normal arriba de la página.

- `manifest.json` la activa con `"display_override": ["window-controls-overlay", "standalone"]`.
- `style.css` la coloca con `env(titlebar-area-x / y / width / height)` y usa `app-region: drag` (los botones llevan `no-drag`).
- `app.js` escucha `navigator.windowControlsOverlay` y el evento `geometrychange` para mostrar solo iconos cuando hay poco espacio.

Para probarla sin instalar: en Edge DevTools → **Aplicación** → **Manifiesto** → *Superposición de controles de ventana*.

## Cómo se calcula

1. **Área de la columna** = ancho × largo → 30 × 30 = 900 cm²
2. **Acero necesario** = área × porcentaje ÷ 100 → 900 × 1 ÷ 100 = 9 cm²
3. **Número de varillas** = acero necesario ÷ área de una varilla, redondeando hacia arriba
   → 9 ÷ 1.27 = 7.1 → **8 varillas de 1/2"**

Siempre se usan al menos 4 varillas, una por esquina.
El área de una varilla sale de su diámetro: π × d² ÷ 4, con d en cm (pulgadas × 2.54).

Cuando la app elige sola, busca el tamaño que cubra el acero necesario con poco desperdicio,
sin demasiadas varillas y, si se puede, con un número par para que queden parejas.

## Archivos

```
index.html      La página
style.css       Los colores y el diseño (los colores están al inicio, en :root)
app.js          Los cálculos, el dibujo y el historial
manifest.json   Datos para instalar la app
sw.js           Hace que funcione sin internet
icons/          Iconos de la app
assets/         Logo
```

## Cómo ejecutarla

Desde esta carpeta:

```bash
python -m http.server 8080
```

Luego abre <http://localhost:8080>.
Tiene que ser desde `localhost`: si abres `index.html` con doble clic, no funcionan la instalación ni el modo sin internet.

## Cómo instalarla (Chrome o Edge)

Presiona el botón **⬇ Instalar** del encabezado, o el icono de instalar en la barra de direcciones.
La app se abrirá en su propia ventana y aparecerá en el menú Inicio.

## Si cambias el código

Cambia `CACHE_VERSION` en `sw.js` (por ejemplo, a `v3.0.1`) para que la app instalada descargue la versión nueva.
