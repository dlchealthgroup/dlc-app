# DLC OS

Aplicación de gestión de DLC Health Group. Primer módulo: rutas, visitas y fichas de médicos.
Funciona sin conexión y se sincroniza con la hoja de Google "DLC Médicos (app)".

Este repositorio solo contiene el código: los datos viven en la hoja de Google y solo se
descargan con la clave, que se introduce una vez en cada dispositivo.

Versión 1.4.0

## Estructura
- `index.html`: pantalla, estilos y capa de datos (descarga desde la hoja y almacén local).
- `app.js`: la aplicación (módulo Rutas y médicos) y la sincronización de cambios.
- `sw.js`: funcionamiento sin conexión.
La capa de datos está separada de las pantallas para poder cambiar el almacén (versión 2.0) sin rehacer la app.
