# Diccionario de Datos v1 — CONTADO_PABLO_RUIZ

Generado: 2026-06-03 00:18

## Objetivo
Definir de forma auditable los campos de las hojas de sistema y trabajadas para presentar a Pablo y alinear reglas de negocio.

## Archivo analizado
- Ruta: `/home/server/.hermes/document_cache/doc_07f056549711_CONTADO_PABLO_RUIZ.xlsx`
- Tamaño: 0.49 MB

## Resumen ejecutivo
- CDO SISTEMA: 405 filas, 14 columnas
- CDO TRABAJADA: 402 filas, 17 columnas
- PTE DE FACT SISTEMA: 1409 filas, 37 columnas
- PF TRABAJADA: 1503 filas, 16 columnas

## Trazabilidad de campos — CDO

- Campos compartidos: 14
- Solo en sistema: 0
- Solo en trabajada: 3

| Campo sistema | Campo trabajada | Tipo mapeo |
|---|---|---|
| clase | clase | directo |
| estado | ESTADO | directo |
| fechaedit | fechaedit | directo |
| guiafec | guiafec | directo |
| importe | importe | directo |
| nro | nro | directo |
| nrogen_a | nrogen_a | directo |
| razsocc | razsocc | directo |
| saldo | saldo | directo |
| succobro | succobro | directo |
| sucdest | sucdest | directo |
| sucori | sucori | directo |
| sucursal | sucursal | directo |
| tiporec | tiporec | directo |
| — | JUSTIFICACIÓN | agregado manual/operativo |
| — | OBSERVACIÓN | agregado manual/operativo |
| — | REFERENTE | agregado manual/operativo |

## Trazabilidad de campos — PF

- Campos compartidos: 13
- Solo en sistema: 24
- Solo en trabajada: 3

| Campo sistema | Campo trabajada | Tipo mapeo |
|---|---|---|
| clicta | clicta | directo |
| dias_sin_c | dias_sin_c | directo |
| ensucursal | ensucursal | directo |
| fecha_conf | fecha_conf | directo |
| fecharecep | fecharecep | directo |
| fecharep | fecharep | directo |
| guiaest | guiaest | directo |
| guiafec | guiafec | directo |
| importe | importe | directo |
| nicsuc | nicsuc | directo |
| nro | nro | directo |
| razsocc | razsocc | directo |
| reparto | reparto | directo |
| — | JUSTIFICACIÓN | agregado manual/operativo |
| — | OBS CTAS CTES | agregado manual/operativo |
| — | REFERENTE | agregado manual/operativo |
| Año-FECHARECEP | — | descartado/no visible en trabajada |
| Año-GUIAFEC | — | descartado/no visible en trabajada |
| AñoMes-FECHARECEP | — | descartado/no visible en trabajada |
| AñoMes-GUIAFEC | — | descartado/no visible en trabajada |
| clisuc | — | descartado/no visible en trabajada |
| codmovesp | — | descartado/no visible en trabajada |
| comprob | — | descartado/no visible en trabajada |
| facconfor | — | descartado/no visible en trabajada |
| fcdocensuc | — | descartado/no visible en trabajada |
| gravado | — | descartado/no visible en trabajada |
| guicodsuc | — | descartado/no visible en trabajada |
| guinrogen | — | descartado/no visible en trabajada |
| impadi | — | descartado/no visible en trabajada |
| impar | — | descartado/no visible en trabajada |
| impcr | — | descartado/no visible en trabajada |
| impdomic | — | descartado/no visible en trabajada |
| impflete | — | descartado/no visible en trabajada |
| impseg | — | descartado/no visible en trabajada |
| nicnro | — | descartado/no visible en trabajada |
| sucdest | — | descartado/no visible en trabajada |
| totbultos | — | descartado/no visible en trabajada |
| totkilos | — | descartado/no visible en trabajada |
| totm3 | — | descartado/no visible en trabajada |
| valorcr | — | descartado/no visible en trabajada |

## Definiciones funcionales propuestas (v1)

| Campo | Definición operativa | Uso |
|---|---|---|
| nro | Identificador único de guía/documento | Clave de trazabilidad y conciliación |
| REFERENTE | Responsable asignado a la gestión | Distribución y seguimiento de cartera |
| JUSTIFICACIÓN | Motivo de decisión operativa | Auditoría y contexto de acción |
| OBSERVACIÓN / OBS CTAS CTES | Comentario libre de gestión | Seguimiento, bloqueos y notas |
| guiaest / estado | Estado logístico/comercial del documento | Priorización de acciones |
| dias_sin_c | Antigüedad en días sin resolución | Orden de urgencia |
| importe / saldo | Monto económico asociado | Priorización financiera |

## Diccionario por hoja

## Hoja: CDO SISTEMA

Filas: 405 | Columnas: 14

| Campo | Tipo inferido | % no nulo | Ejemplo |
|---|---|---:|---|
| clase | texto/categórico | 67.4% | SUCURSAL BUENOS AIRES |
| estado | texto/categórico | 98.8% | DT |
| fechaedit | numérico (entero) | 98.8% | 2026-06-01 10:12:40 |
| guiafec | fecha/datetime | 98.8% | 27/05/2026 |
| importe | numérico (decimal) | 98.8% | 790130.0 |
| nro | texto/categórico | 100.0% | A.0017.00000053 |
| nrogen_a | numérico (entero) | 4.7% | 157039.0 |
| razsocc | texto/categórico | 98.8% | IMPULSORA METALURGICA DEL NOROESTE |
| saldo | numérico (decimal) | 98.8% | 790130.0 |
| succobro | texto/categórico | 98.8% | BA |
| sucdest | texto/categórico | 98.8% | BA |
| sucori | texto/categórico | 98.8% | JU |
| sucursal | numérico (entero) | 4.7% | 97.0 |
| tiporec | texto/categórico | 4.7% | XF |
## Hoja: CDO TRABAJADA

Filas: 402 | Columnas: 17

| Campo | Tipo inferido | % no nulo | Ejemplo |
|---|---|---:|---|
| clase | texto/categórico | 67.4% | SUCURSAL BUENOS AIRES |
| ESTADO | texto/categórico | 98.8% | DT |
| fechaedit | numérico (entero) | 98.8% | 2026-06-01 10:12:40 |
| guiafec | fecha/datetime | 98.8% | 27/05/2026 |
| importe | numérico (decimal) | 98.8% | 790130.0 |
| JUSTIFICACIÓN | texto/categórico | 9.2% | SGCP 6480 |
| nro | texto/categórico | 100.0% | A.0017.00000053 |
| nrogen_a | numérico (entero) | 4.0% | 157039.0 |
| OBSERVACIÓN | texto/categórico | 4.0% | VER DIF |
| razsocc | texto/categórico | 98.8% | IMPULSORA METALURGICA DEL NOROESTE |
| REFERENTE | texto/categórico | 18.2% | BA |
| saldo | numérico (decimal) | 98.8% | 790130.0 |
| succobro | texto/categórico | 98.8% | BA |
| sucdest | texto/categórico | 98.8% | BA |
| sucori | texto/categórico | 98.8% | JU |
| sucursal | numérico (entero) | 4.0% | 97.0 |
| tiporec | texto/categórico | 4.0% | XF |
## Hoja: PTE DE FACT SISTEMA

Filas: 1409 | Columnas: 37

| Campo | Tipo inferido | % no nulo | Ejemplo |
|---|---|---:|---|
| Año-FECHARECEP | numérico (entero) | 99.6% | 0.0 |
| Año-GUIAFEC | numérico (entero) | 99.6% | 2025.0 |
| AñoMes-FECHARECEP | numérico (entero) | 99.6% | 0.0 |
| AñoMes-GUIAFEC | numérico (entero) | 99.6% | 202507.0 |
| clicta | numérico (entero) | 99.6% | 1840.0 |
| clisuc | texto/categórico | 99.6% | CC |
| codmovesp | texto/categórico | 99.6% | GS |
| comprob | vacío | 0.0% |  |
| dias_sin_c | numérico (entero) | 99.6% | 307.0 |
| ensucursal | texto/categórico | 99.6% | BA |
| facconfor | numérico (entero) | 99.6% | 1.0 |
| fcdocensuc | numérico (entero) | 99.6% | 0.0 |
| fecha_conf | texto/categórico | 86.7% | 04/08/2025 12:20 PM |
| fecharecep | texto/categórico | 99.6% | -   - |
| fecharep | fecha/datetime | 86.7% | 02/08/2025 11:41 AM |
| gravado | numérico (decimal) | 99.6% | 26153.81 |
| guiaest | texto/categórico | 99.6% | DT |
| guiafec | numérico (entero) | 99.6% | 2025-07-30 00:00:00 |
| guicodsuc | texto/categórico | 99.6% | CC |
| guinrogen | numérico (entero) | 99.6% | 241483.0 |
| impadi | numérico (entero) | 99.6% | 0.0 |
| impar | numérico (entero) | 99.6% | 0.0 |
| impcr | numérico (entero) | 99.6% | 0.0 |
| impdomic | numérico (entero) | 99.6% | 0.0 |
| impflete | numérico (decimal) | 99.6% | 26153.66 |
| importe | numérico (decimal) | 99.6% | 26153.81 |
| impseg | numérico (decimal) | 99.6% | 0.15 |
| nicnro | numérico (entero) | 99.6% | 103887.0 |
| nicsuc | texto/categórico | 99.6% | CC |
| nro | texto/categórico | 100.0% | R.0001.00075268 |
| razsocc | texto/categórico | 99.6% | FRACAS Y GUGLIELMELLI S.A. |
| reparto | texto/categórico | 86.7% | 0 |
| sucdest | texto/categórico | 99.6% | BA Buenos Aires |
| totbultos | numérico (entero) | 99.6% | 1.0 |
| totkilos | numérico (entero) | 99.6% | 15.0 |
| totm3 | numérico (decimal) | 99.6% | 0.0 |
| valorcr | numérico (entero) | 99.6% | 0.0 |
## Hoja: PF TRABAJADA

Filas: 1503 | Columnas: 16

| Campo | Tipo inferido | % no nulo | Ejemplo |
|---|---|---:|---|
| clicta | numérico (entero) | 99.6% | 2199.0 |
| dias_sin_c | numérico (entero) | 99.6% | 2517.0 |
| ensucursal | texto/categórico | 99.6% | CC |
| fecha_conf | fecha/datetime | 91.0% | 10/07/2019 03:48 PM |
| fecharecep | texto/categórico | 99.6% | -   - |
| fecharep | fecha/datetime | 91.0% | 10/07/2019 03:46 PM |
| guiaest | texto/categórico | 99.6% | ED |
| guiafec | numérico (entero) | 99.6% | 2019-07-05 00:00:00 |
| importe | numérico (decimal) | 99.6% | 13659.230000000001 |
| JUSTIFICACIÓN | texto/categórico | 52.2% | PENDIENTE DE FACTURAR |
| nicsuc | texto/categórico | 99.6% | BA |
| nro | texto/categórico | 100.0% | R.0009.00113004 |
| OBS CTAS CTES | texto/categórico | 0.8% | Gestionar HM con el cliente |
| razsocc | texto/categórico | 99.6% | ASB TECHNOLOGIES S.R.L. |
| REFERENTE | texto/categórico | 52.2% | OFICINA |
| reparto | texto/categórico | 91.0% | CC     32472 |

## Riesgos detectados para definición final

- PF TRABAJADA tiene mayor volumen que PF sistema en este archivo (1503 vs 1409), por lo que no representa un simple filtro 1:1.
- Se requiere confirmar con negocio si PF TRABAJADA integra fuentes/cortes adicionales.
- Recomendado: cerrar definición de "regla de ingreso/egreso" para cada campo agregado (REFERENTE, JUSTIFICACIÓN, OBS...).

## Próximos pasos sugeridos para presentación a Pablo

1. Validar este diccionario con Edith/operación (30 min).
2. Congelar versión v1.1 con definiciones aprobadas (owner por campo).
3. Conectar validaciones en pipeline para alertar campos faltantes o fuera de formato.
4. Preparar slide de trazabilidad: sistema → trabajada → acción.