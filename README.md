# Trasabilidad Interna Operario v.1

Aplicación web para el seguimiento de casos de un laboratorio de diagnóstico molecular orientado a la industria salmonera (SRS, ISA, IPN, Caligus, BKD, etc.). HTML5 + CSS3 + JavaScript puro, sin build ni instalación.

## Uso

1. Descarga o clona este repositorio.
2. Abre `index.html` con doble clic (o "Abrir con..." tu navegador). No requiere servidor, Node, ni build.
3. Funciona 100% offline: las únicas 3 librerías de terceros (Chart.js, SheetJS, jsPDF) están empaquetadas en `vendor/`, no se descargan de internet en cada uso.

Navegadores recomendados: Chrome, Edge o Firefox actualizados.

## Estructura

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de la página y los modales |
| `style.css` | Estilos (tema corporativo azul/gris) |
| `app.js` | Controlador: vistas, tablas, formularios, filtros, exportación |
| `db.js` | Única capa que toca el almacenamiento — ver [Datos](#datos-y-almacenamiento) |
| `charts.js` | Gráficos del Dashboard (Chart.js) |
| `utils.js` | Helpers compartidos (fechas, ids, toasts, modales, paginación) |
| `vendor/` | Copias locales de Chart.js, SheetJS y jsPDF |
| `test.html` | Self-check sin frameworks — ábrelo en el navegador para verificar que la lógica de Ct/paginación/CRUD sigue funcionando |
| `versions/` | Versiones anteriores de la app, conservadas por si se necesita volver atrás |

## Datos y almacenamiento

- Cada persona que descarga y abre esta app tiene **su propia base de datos local**: todo se guarda en el `localStorage` del navegador (claves `lims_cases_v1` y `lims_pathologies_v1`). Nadie comparte datos por bajar el mismo repositorio.
- Los datos persisten aunque cierres el navegador, pero **son locales a ese navegador y ese equipo** — no se sincronizan entre dispositivos ni se suben a ningún servidor.
- Borrar el historial/datos de navegación de ese navegador borra la base local. Usa los botones de exportar (Excel/CSV/PDF) como respaldo periódico.
- `localStorage` tiene un límite típico de 5–10&nbsp;MB por navegador, suficiente para varios miles de casos. Si se acerca al límite, la app te avisa con una notificación al guardar en vez de perder el caso en silencio.
- La tabla de Casos y la pestaña Explorar están paginadas (50 filas por página) para mantenerse rápidas aunque el catálogo crezca a miles de registros.
- **Importar / restaurar casos**: el botón "Importar" en la pestaña Casos acepta un CSV o Excel con las mismas columnas que genera "Exportar caso" (N° Caso, Fecha, Cliente, Matriz, Muestra, Peso (g), Patología, Ct corte, Ct obtenido, Resultado, Observaciones). Sirve tanto para carga masiva como para restaurar casos a partir de una exportación anterior: si el N° de Caso ya existe, lo actualiza; si no, lo crea.

## Nota sobre `test.html`

El self-check usa claves de `localStorage` propias (`lims_cases_selftest` / `lims_pathologies_selftest`), completamente separadas de las reales. Puede abrirse en cualquier navegador, incluso el mismo que usas para la app real, sin riesgo de perder datos.

## Migrar a una base de datos real (SQLite / API)

Toda la app habla con los datos solo a través de los métodos de `db.js` (`getAll` / `getById` / `create` / `update` / `remove`, por caso y por patología). Para pasar a un backend real (API + SQLite, por ejemplo), basta con reescribir ese archivo — el resto de la app no sabe ni le importa de dónde vienen los datos.

## Licencia

MIT — ver [LICENSE](LICENSE).
