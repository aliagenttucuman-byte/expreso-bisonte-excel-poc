# Ingeniería inversa de campos — CONTADO_PABLO_RUIZ.xlsx

Fecha: 2026-06-02
Archivo fuente: `/home/server/.hermes/document_cache/doc_07f056549711_CONTADO_PABLO_RUIZ.xlsx`

## 1) Resumen de hojas y volumen

- CDO SISTEMA: 405 filas, 14 columnas
- CDO TRABAJADA: 402 filas, 17 columnas
- PTE DE FACT SISTEMA: 1409 filas, 37 columnas
- PF TRABAJADA: 1503 filas, 16 columnas

## 2) Mapeo de columnas — CDO

### Coinciden entre CDO SISTEMA y CDO TRABAJADA (14)
- nro
- guiafec
- razsocc
- clase
- fechaedit
- sucori
- sucdest
- importe
- saldo
- succobro
- tiporec
- sucursal
- nrogen_a
- (ESTADO en trabajada queda como `ESTADO`; en sistema aparece `estado`)

### Solo en CDO TRABAJADA (3)
- JUSTIFICACIÓN
- REFERENTE
- OBSERVACIÓN

### Solo en CDO SISTEMA
- Ninguna adicional relevante (más allá de variación de mayúsculas/minúsculas en `estado`)

## 3) Mapeo de columnas — PF

### Coinciden entre PTE DE FACT SISTEMA y PF TRABAJADA (13)
- nro
- guiafec
- fecha_conf
- clicta
- guiaest
- razsocc
- dias_sin_c
- importe
- nicsuc
- ensucursal
- fecharep
- reparto
- fecharecep

### Solo en PF TRABAJADA (3)
- JUSTIFICACIÓN
- REFERENTE
- OBS CTAS CTES

### Solo en PTE DE FACT SISTEMA (24)
- codmovesp
- Año-GUIAFEC
- AñoMes-GUIAFEC
- clisuc
- guicodsuc
- guinrogen
- nicnro
- gravado
- totbultos
- totkilos
- impflete
- impseg
- totm3
- impar
- impadi
- impdomic
- impcr
- valorcr
- sucdest
- comprob
- facconfor
- fcdocensuc
- Año-FECHARECEP
- AñoMes-FECHARECEP

## 4) Hallazgo importante de ingeniería inversa

PF TRABAJADA **no** parece ser una simple transformación 1:1 de PTE DE FACT SISTEMA:

- PF TRABAJADA tiene 1503 filas (más que PF sistema: 1409)
- `nro` es único en ambas, pero los conjuntos difieren fuerte:
  - en trabajada y no en sistema: 871
  - en sistema y no en trabajada: 777

Interpretación preliminar:
- PF TRABAJADA probablemente mezcla universo operativo adicional (otra fuente/otro corte temporal/arrastre histórico), no solo “PTE DE FACT SISTEMA del mismo día”.

## 5) Definiciones preliminares (para catalogar)

### Campos operativos añadidos en hojas trabajadas
- REFERENTE: responsable asignado para gestión.
- JUSTIFICACIÓN: motivo de estado/acción tomada.
- OBSERVACIÓN / OBS CTAS CTES: comentario libre para seguimiento (cuentas corrientes, bloqueos, notas operativas).

### Campos base clave (comunes)
- nro: identificador de guía/documento operativo.
- guiafec: fecha de guía.
- razsocc: razón social del cliente.
- guiaest / estado: estado operativo de guía/cobranza.
- dias_sin_c: antigüedad (días sin cobrar/facturar, según contexto).
- importe / saldo: montos económicos para priorización.

## 6) Próximo paso recomendado (para definiciones formales)

Armar un **diccionario de datos v1** con estas columnas por hoja:

- nombre_campo
- hoja_origen (sistema/trabajada/ambas)
- tipo_dato observado
- obligatoriedad (% no nulo)
- regla de negocio (cómo se usa)
- ejemplo_real
- owner (quién lo mantiene)

Y definir la matriz de trazabilidad:
- `sistema -> trabajada` (copia directa)
- `sistema -> trabajada` (derivado)
- `trabajada` (manual/humano)
- `externo -> trabajada` (si aplica)
