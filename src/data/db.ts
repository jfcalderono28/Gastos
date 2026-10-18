import Dexie, { type Table } from 'dexie'

export type TipoMovimiento = 'ingreso' | 'gasto'

export interface Category {
  id?: number
  nombre: string
  tipo: TipoMovimiento
  color: string
  icono: string
  subcategorias?: string[] // ej. Impuestos → ['Agua', 'Luz', 'Gas']
}

export interface Transaction {
  id?: number
  tipo: TipoMovimiento
  monto: number
  fecha: string // ISO 'YYYY-MM-DD'
  categoriaId: number
  subcategoria?: string
  nota?: string
  extId?: string // id de origen (CSV) para evitar duplicados al reimportar
  bolsilloId?: number // bolsillo de origen/destino
  listaId?: number  // referencia a ListaMercado si fue registrado desde Compras
}

export interface ItemLista {
  id: string
  nombre: string
  costo: string
  cantidad: string
  subcategoria?: string
}

export interface ListaMercado {
  id?: number
  nombre: string
  fecha: string
  items: ItemLista[]
  subcategorias?: string[] // secciones de la lista (ej. Lácteos, Carnes…)
  total: number
  transaccionId?: number
  categoriaId?: number // categoría asociada elegida al crear la lista
}

export interface Budget {
  id?: number
  categoriaId: number
  montoLimite: number // límite mensual
}

export type TipoDeuda = 'debo' | 'me_deben'

export interface Debt {
  id?: number
  tipo_deuda: TipoDeuda
  nombre: string
  montoTotal: number
  fechaCreacion: string // ISO 'YYYY-MM-DD'
  esCuotas: boolean
  // Pago único:
  fechaPago?: string // ISO 'YYYY-MM-DD' (vencimiento)
  // A cuotas (mensuales):
  numCuotas?: number
  montoCuota?: number
  mesPrimeraCuota?: string // 'YYYY-MM'
  montoPagado?: number
  bolsilloId?: number // medio de pago (ej. bolsillo credito)
  categoriaId?: number // categoría de gasto (solo 'debo')
  subcategoria?: string // subcategoría opcional
  // Solo para 'me_deben':
  deudor?: string
  concepto?: string
}

/** Gasto obligatorio recurrente mensual (ej. impuestos, mercado, cursos). */
export interface Obligacion {
  id?: number
  categoriaId: number
  subcategoria?: string // opcional: limita a una subcategoría (ej. Impuestos → Luz)
  diaInicio: number // día del mes en que abre la ventana de pago (1-31)
  diaFin: number // día límite de pago (1-31)
  montoFijo?: number // si se define, se usa; si no, se promedia el gasto de la categoría
}

/** Bolsillo / cuenta donde se guarda el dinero. */
export interface Bolsillo {
  id?: number
  nombre: string
  icono: string
  color: string
  tipo?: 'debito' | 'credito'
  diaCorte?: number
  orden?: number
  packageName?: string  // app bancaria vinculada (ej. 'com.nequi.MobileApp')
}

/** Notificación bancaria capturada, clasificada y pendiente de registrar. */
export interface CapturaNotif {
  id?: number
  capturaId: string              // id de la notificación original (para dedup)
  packageName: string
  bolsilloId: number
  bolsilloTipo: 'debito' | 'credito'
  monto: number
  tipo: 'ingreso' | 'gasto' | 'ambiguo'
  descripcion: string            // "título: texto" de la notificación
  timestamp: number
  estado: 'pendiente' | 'aceptado' | 'descartado'
  transaccionId?: number
  deudaId?: number
}

export interface Setting {
  key: string
  value: string
}

export class FinanzasDB extends Dexie {
  transactions!: Table<Transaction, number>
  categories!: Table<Category, number>
  budgets!: Table<Budget, number>
  debts!: Table<Debt, number>
  obligaciones!: Table<Obligacion, number>
  bolsillos!: Table<Bolsillo, number>
  settings!: Table<Setting, string>
  listaMercado!: Table<ListaMercado, number>
  capturasNotif!: Table<CapturaNotif, number>

  constructor() {
    super('mi-finanzas')
    this.version(1).stores({
      transactions: '++id, tipo, fecha, categoriaId',
      categories: '++id, tipo',
      budgets: '++id, categoriaId',
      settings: 'key',
    })
    // v2: índice extId para detectar movimientos ya importados
    this.version(2).stores({
      transactions: '++id, tipo, fecha, categoriaId, extId',
    })
    // v3: módulo de deudas
    this.version(3).stores({
      debts: '++id, fechaCreacion',
    })
    // v4: gastos obligatorios
    this.version(4).stores({
      obligaciones: '++id, categoriaId',
    })
    // v5: bolsillos + bolsilloId en transacciones
    this.version(5).stores({
      bolsillos: '++id',
      transactions: '++id, tipo, fecha, categoriaId, extId, bolsilloId',
    })
    // v6: tipo_deuda en deudas (debo / me_deben)
    this.version(6).stores({
      debts: '++id, fechaCreacion, tipo_deuda',
    }).upgrade(tx => {
      return tx.table('debts').toCollection().modify(debt => {
        if (!debt.tipo_deuda) debt.tipo_deuda = 'debo'
      })
    })
    // v7: categoriaId y subcategoria en deudas
    this.version(7).stores({
      debts: '++id, fechaCreacion, tipo_deuda, categoriaId',
    })
    // v8: listas de mercado + listaId en transacciones
    this.version(8).stores({
      listaMercado: '++id, fecha',
      transactions: '++id, tipo, fecha, categoriaId, extId, bolsilloId, listaId',
    })
    // v9: packageName en bolsillos + tabla de capturas de notificaciones
    this.version(9).stores({
      bolsillos: '++id, packageName',
      capturasNotif: '++id, capturaId, estado, bolsilloId, timestamp',
    })
  }
}

export const db = new FinanzasDB()
