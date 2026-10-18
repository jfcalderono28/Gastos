# Mi Finanzas — Documentación del proyecto

> Última actualización: octubre 2026

---

## Descripción general

**Mi Finanzas** es una PWA (Progressive Web App) de finanzas personales diseñada para uso sin anuncios ni suscripciones. Corre completamente en el dispositivo: toda la información se almacena localmente en IndexedDB (Dexie). Está empaquetada como APK de Android mediante Capacitor, lo que permite acceder a APIs nativas como la captura de notificaciones bancarias.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| UI | React 18 + TypeScript + Vite |
| Estilos | Tailwind CSS v3.4 |
| Base de datos local | Dexie (IndexedDB) |
| Reactividad DB | `useLiveQuery` de dexie-react-hooks |
| Empaquetado Android | Capacitor v8 (Java, no Kotlin) |
| Plugin nativo | Java — `NotificationListenerService` |
| PWA | vite-plugin-pwa (generateSW) |

---

## Estructura de carpetas

```
mi-finanzas/
├── src/
│   ├── App.tsx                        # Raíz: tabs + hook procesador de notificaciones
│   ├── main.tsx
│   ├── data/
│   │   ├── db.ts                      # Esquema Dexie + interfaces TypeScript
│   │   ├── repository.ts              # Capa de acceso a datos (nunca se toca Dexie desde la UI)
│   │   └── seed.ts                    # Categorías por defecto + migración de bolsillos
│   ├── hooks/
│   │   ├── data.ts                    # Hooks reactivos: useTransactions, useBolsillos, etc.
│   │   └── useNotificationProcessor.ts # Hook global: clasifica y guarda capturas bancarias
│   ├── lib/
│   │   ├── dates.ts                   # Utilidades de fechas
│   │   └── format.ts                  # formatMoney (formato COP)
│   ├── plugins/
│   │   └── NotificationCapture.ts     # Interfaz TypeScript del plugin Capacitor nativo
│   ├── components/
│   │   ├── BottomNav.tsx
│   │   ├── Modal.tsx
│   │   ├── FlashBar.tsx
│   │   ├── MonthSelector.tsx
│   │   └── SubcategoriaSelect.tsx
│   └── features/
│       ├── transactions/              # Registro de ingresos y gastos
│       ├── debts/                     # Deudas (debo / me deben)
│       ├── budgets/                   # Presupuestos mensuales por categoría
│       ├── reports/                   # Reportes y gráficas
│       ├── compras/                   # Listas de mercado
│       ├── bolsillos/                 # Gestión de cuentas/bolsillos
│       ├── categories/                # Categorías y subcategorías
│       ├── obligatorios/              # Gastos obligatorios recurrentes
│       ├── import/                    # Importación de movimientos por CSV
│       └── settings/
│           ├── SettingsPage.tsx
│           └── CaptureNotificationsModal.tsx  # Cola de capturas bancarias pendientes
└── android/
    └── app/src/main/java/com/mifinanzas/app/
        ├── NotificationCapture.java   # NotificationListenerService + persistencia
        └── NotificationPlugin.java    # Plugin Capacitor (bridge Java ↔ JS)
```

---

## Modelo de datos (db.ts)

La base de datos Dexie se llama `mi-finanzas` y está en la versión 9.

### Tablas

#### `transactions`
```typescript
{
  id?: number
  tipo: 'ingreso' | 'gasto'
  monto: number
  fecha: string          // 'YYYY-MM-DD'
  categoriaId: number
  subcategoria?: string
  nota?: string
  extId?: string         // id externo para evitar duplicados al importar CSV
  bolsilloId?: number
  listaId?: number       // vinculado a una ListaMercado
}
```

#### `categories`
```typescript
{
  id?: number
  nombre: string
  tipo: 'ingreso' | 'gasto'
  color: string
  icono: string
  subcategorias?: string[]
}
```

#### `bolsillos`
```typescript
{
  id?: number
  nombre: string
  icono: string
  color: string
  tipo?: 'debito' | 'credito'
  diaCorte?: number        // para tarjetas de crédito
  orden?: number
  packageName?: string     // app bancaria vinculada (ej. 'com.nequi.MobileApp')
}
```

#### `debts`
```typescript
{
  id?: number
  tipo_deuda: 'debo' | 'me_deben'
  nombre: string
  montoTotal: number
  fechaCreacion: string
  esCuotas: boolean
  fechaPago?: string       // pago único
  numCuotas?: number
  montoCuota?: number
  mesPrimeraCuota?: string // 'YYYY-MM'
  montoPagado?: number
  bolsilloId?: number
  categoriaId?: number
  subcategoria?: string
  deudor?: string          // solo para 'me_deben'
  concepto?: string
}
```

#### `capturasNotif`
```typescript
{
  id?: number
  capturaId: string        // id de dedup (packageName|title|text|timestamp/60000)
  packageName: string
  bolsilloId: number
  bolsilloTipo: 'debito' | 'credito'
  monto: number
  tipo: 'ingreso' | 'gasto' | 'ambiguo'
  descripcion: string      // "título: texto"
  timestamp: number
  estado: 'pendiente' | 'aceptado' | 'descartado'
  transaccionId?: number   // creado al aceptar
  deudaId?: number         // creado al aceptar como deuda
}
```

#### Otras tablas
- `budgets` — presupuesto mensual por categoría (`categoriaId`, `montoLimite`)
- `obligaciones` — gastos recurrentes obligatorios (`categoriaId`, `diaInicio`, `diaFin`, `montoFijo?`)
- `listaMercado` — listas de compras con ítems y total
- `settings` — configuración clave-valor (ej. `saldoInicial`)

---

## Arquitectura de captura de notificaciones bancarias

### Flujo completo

```
App bancaria (Nequi, etc.)
        │
        ▼ NotificationListenerService
NotificationCapture.java
  • Extrae título, texto, timestamp
  • Genera capturaId: packageName|title|text|timestamp÷60000
  • Guarda en memoria (ArrayList) + disco (SharedPreferences)
  • Notifica al plugin vía pluginRef.onNewCapture()
        │
        ▼ Capacitor bridge
NotificationPlugin.java
  • getCaptures() — devuelve lista actual
  • clearCaptures() — vacía memoria + disco
  • isBatteryOptimized() — consulta PowerManager
  • requestBatteryExemption() — abre Settings del sistema
  • emite evento 'notificationReceived' al JS
        │
        ▼ JavaScript (useNotificationProcessor.ts)
  • Al montar: llama getCaptures() para procesar capturas acumuladas
  • En tiempo real: escucha evento 'notificationReceived'
  • Para cada captura:
      1. Busca bolsillo por packageName
      2. Extrae monto (regex: $N, puntos-de-miles, o keyword)
      3. Clasifica: ingreso / gasto / ambiguo (regex de palabras clave)
      4. Guarda en capturasNotif con estado 'pendiente' (dedup por capturaId)
        │
        ▼ CaptureNotificationsModal.tsx
  Usuario aprueba o descarta cada captura pendiente
```

### Deduplicación

El `capturaId` usa una ventana de **60 segundos** (`timestamp / 60000`). Esto absorbe el patrón de doble notificación de Nequi (push + actualización) siempre que el título y texto sean idénticos. Diferentes montos o remitentes producen IDs distintos.

### Persistencia entre reinicios (Motorola/Android agresivo)

Las capturas se persisten en `SharedPreferences` (clave `notif_captures`, array JSON) en cada `onNotificationPosted`. Al abrir la app, `loadFromPrefs()` restaura la lista en memoria. El hook `useNotificationProcessor` llama `getCaptures()` al montar para procesar todo lo acumulado mientras la app estuvo cerrada.

### Exemption de optimización de batería

En Motorola y dispositivos con capas de personalización agresivas (MIUI, One UI), Android puede matar el `NotificationListenerService` tras varias horas. La solución es solicitar estar exento de optimización de batería mediante `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`. El modal de capturas muestra un banner de advertencia cuando la optimización está activa.

---

## Apps bancarias soportadas

| App | Package Name |
|-----|-------------|
| Nequi | `com.nequi.MobileApp` |
| Bancolombia | `co.com.bancolombia.personas.superapp` |
| Nu (Nubank) | `com.nu.production` |
| Davivienda | `com.todo1.davivienda.mobileapp` |
| Daviplata | `com.davivienda.daviplataapp` |
| BBVA | `co.com.bbva.mb` |
| Falabella | `co.com.bancofalabella.mobile.omc` |
| WhatsApp *(pruebas)* | `com.whatsapp` |

Cada bolsillo puede vincularse a una app bancaria en **Ajustes → Bolsillos → App bancaria**. Las notificaciones de esa app se enrutan automáticamente a ese bolsillo.

---

## Clasificador de notificaciones

El clasificador en `useNotificationProcessor.ts` evalúa el texto completo (`título + texto`) con regex en este orden de prioridad:

**GASTO** (patrones más específicos primero):
- `le enviaste`, `que enviaste`, `envío exitoso`, `exitoso envío`
- `pagaste`, `pago exitoso`, `pago aprobado`
- `compraste`, `compra aprobada/por/en/de`
- `retiraste`, `retiro de`
- `transferiste`, `transferencia enviada`
- `débito`, `cargo por`
- `enviaste` (comodín)

**INGRESO**:
- `te envió`, `te enviaron`
- `recibiste`
- `consignación`, `consignó`
- `depósito`, `depositó`
- `abono`, `abonó`
- `ingresó`, `ingresaste`
- `te llegó`, `dinero llegó`
- `transferencia recibida`
- `enviaron plata`

Si no hay coincidencia → **AMBIGUO** (el usuario elige manualmente).

---

## Modal de captura de notificaciones (CaptureNotificationsModal.tsx)

### Comportamiento según tipo de bolsillo

**Bolsillo débito:**
1. Siempre se registra la transacción (ingreso o gasto según clasificación).
2. Toggle opcional **"¿También registrar como deuda?"**:
   - Si `tipo = ingreso` → tipo de deuda = `🔴 Yo debo` (me prestaron, debo devolver).
   - Si `tipo = gasto` → tipo de deuda = `🟢 Me deben` (les presté, me deben devolver).
   - El tipo de deuda es fijo (no editable) para evitar errores de lógica.
3. Al confirmar con el toggle activo: crea **tanto** la transacción **como** la deuda.

**Bolsillo crédito:**
- Siempre crea una deuda de tipo `🔴 Yo debo` (la notificación representa un cargo en la tarjeta).
- Formulario: nombre, cuotas (toggle + cálculo de cuota mensual), categoría opcional, subcategoría.

**Casos ambiguos:**
- Si la clasificación fue `ambiguo`, el usuario ve un selector `↑ Ingreso / ↓ Gasto` antes de categorizar.

---

## Extracción de montos

El extractor en `useNotificationProcessor.ts` prueba tres estrategias en orden:

1. **Signo pesos:** `$` seguido de número (`$50.000`, `$ 100`)
2. **Formato miles:** número con puntos como separador de miles (`1.500.000`)
3. **Keyword + número:** palabras clave como `envió`, `recibiste`, `pagaste`, etc. seguidas de un número

Formato colombiano: `.` = separador de miles, `,` = decimal.

---

## Flujo de build

```bash
# 1. Compilar la web
npm run build

# 2. Sincronizar activos con Android
npx cap sync android

# 3. Generar APK de debug
cd android
.\gradlew assembleDebug

# APK generada en:
# android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Permisos Android requeridos

| Permiso | Uso |
|---------|-----|
| `BIND_NOTIFICATION_LISTENER_SERVICE` | Leer notificaciones del sistema |
| `INTERNET` | Capacitor (requerido aunque no se use red) |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Solicitar exención de batería para mantener el servicio activo |

El permiso de notificaciones **no** se concede automáticamente; el usuario debe habilitarlo en **Configuración → Notificaciones → Acceso a notificaciones**.

---

## Historial de versiones de la base de datos

| Versión | Cambio |
|---------|--------|
| 1 | Transacciones, categorías, presupuestos, settings |
| 2 | Índice `extId` en transacciones (anti-duplicado CSV) |
| 3 | Tabla `debts` |
| 4 | Tabla `obligaciones` |
| 5 | Tabla `bolsillos` + `bolsilloId` en transacciones |
| 6 | Campo `tipo_deuda` en deudas (`debo` / `me_deben`) |
| 7 | `categoriaId` y `subcategoria` en deudas |
| 8 | Tabla `listaMercado` + `listaId` en transacciones |
| 9 | `packageName` en bolsillos + tabla `capturasNotif` |

---

## Módulos principales de la app

| Tab | Feature | Descripción |
|-----|---------|-------------|
| Movimientos | `TransactionsPage` | Lista de ingresos/gastos del mes con balance |
| Deudas | `DebtsPage` | Deudas propias y deudas a favor, con seguimiento de cuotas |
| Presupuestos | `BudgetsPage` | Límites mensuales por categoría con barra de progreso |
| Reportes | `ReportsPage` | Gráficas y resúmenes por período |
| Compras | `ComprasPage` | Listas de mercado con ítems y totales |
| Ajustes | `SettingsPage` | Categorías, bolsillos, obligaciones, captura de notificaciones, importar/exportar |

---

## Notas de diseño

- **Sin backend:** toda la lógica y datos viven en el dispositivo. No hay autenticación, servidor ni sincronización en la nube (la arquitectura de `repository.ts` está preparada para añadir sync sin tocar la UI).
- **Repository pattern:** la UI nunca importa `db` directamente; todo pasa por `repo` en `repository.ts`.
- **Reactividad:** las vistas usan `useLiveQuery` de Dexie para actualizarse automáticamente al cambiar los datos.
- **Dark mode:** soporte completo vía clases `dark:` de Tailwind, respetando la preferencia del sistema.
- **PWA:** service worker con precaché de todos los activos para funcionamiento completamente offline.
