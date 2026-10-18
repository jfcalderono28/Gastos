import { db, type Transaction, type Category, type Budget, type Debt, type Obligacion, type Bolsillo, type ListaMercado, type CapturaNotif } from './db'

/**
 * Capa de acceso a datos. La UI SIEMPRE habla con esta interfaz, nunca con
 * Dexie directamente. Para añadir sincronización en la nube en el futuro, basta
 * con crear un `CloudRepository` que cumpla esta misma interfaz (ej. Supabase)
 * y cambiar la instancia exportada al final del archivo. La UI no cambia.
 */
export interface Repository {
  // Movimientos
  getTransactions(): Promise<Transaction[]>
  addTransaction(t: Omit<Transaction, 'id'>): Promise<number>
  updateTransaction(id: number, cambios: Partial<Transaction>): Promise<void>
  deleteTransaction(id: number): Promise<void>
  bulkAddTransactions(ts: Omit<Transaction, 'id'>[]): Promise<void>
  getExtIds(): Promise<Set<string>> // ids de origen ya importados

  // Categorías
  getCategories(): Promise<Category[]>
  addCategory(c: Omit<Category, 'id'>): Promise<number>
  updateCategory(id: number, cambios: Partial<Category>): Promise<void>
  deleteCategory(id: number): Promise<void>

  // Presupuestos
  getBudgets(): Promise<Budget[]>
  setBudget(categoriaId: number, montoLimite: number): Promise<void>
  deleteBudget(id: number): Promise<void>

  // Deudas
  getDebts(): Promise<Debt[]>
  addDebt(d: Omit<Debt, 'id'>): Promise<number>
  updateDebt(id: number, cambios: Partial<Debt>): Promise<void>
  deleteDebt(id: number): Promise<void>

  // Gastos obligatorios
  getObligaciones(): Promise<Obligacion[]>
  addObligacion(o: Omit<Obligacion, 'id'>): Promise<number>
  updateObligacion(id: number, cambios: Partial<Obligacion>): Promise<void>
  deleteObligacion(id: number): Promise<void>

  // Bolsillos
  getBolsillos(): Promise<Bolsillo[]>
  addBolsillo(b: Omit<Bolsillo, 'id'>): Promise<number>
  updateBolsillo(id: number, cambios: Partial<Bolsillo>): Promise<void>
  deleteBolsillo(id: number): Promise<void>

  // Ajustes (clave/valor)
  getSetting(key: string): Promise<string | undefined>
  setSetting(key: string, value: string): Promise<void>

  // Listas de mercado
  getListasMercado(): Promise<ListaMercado[]>
  getListaMercado(id: number): Promise<ListaMercado | undefined>
  addListaMercado(l: Omit<ListaMercado, 'id'>): Promise<number>
  updateListaMercado(id: number, cambios: Partial<ListaMercado>): Promise<void>
  deleteListaMercado(id: number): Promise<void>

  // Capturas de notificaciones
  addCapturaNotif(c: Omit<CapturaNotif, 'id'>): Promise<number | null>
  getCapturasNotif(estado?: CapturaNotif['estado']): Promise<CapturaNotif[]>
  updateCapturaNotif(id: number, cambios: Partial<CapturaNotif>): Promise<void>

  // Borra TODOS los datos (movimientos, categorías, presupuestos y ajustes)
  borrarTodo(): Promise<void>
}

class LocalRepository implements Repository {
  // Movimientos
  getTransactions() {
    return db.transactions.orderBy('fecha').reverse().toArray()
  }
  async addTransaction(t: Omit<Transaction, 'id'>) {
    return db.transactions.add(t as Transaction)
  }
  async updateTransaction(id: number, cambios: Partial<Transaction>) {
    await db.transactions.update(id, cambios)
  }
  async deleteTransaction(id: number) {
    await db.transactions.delete(id)
  }
  async bulkAddTransactions(ts: Omit<Transaction, 'id'>[]) {
    await db.transactions.bulkAdd(ts as Transaction[])
  }
  async getExtIds() {
    const keys = await db.transactions.orderBy('extId').keys()
    return new Set(keys as string[])
  }

  // Categorías
  getCategories() {
    return db.categories.toArray()
  }
  async addCategory(c: Omit<Category, 'id'>) {
    return db.categories.add(c as Category)
  }
  async updateCategory(id: number, cambios: Partial<Category>) {
    await db.categories.update(id, cambios)
  }
  async deleteCategory(id: number) {
    await db.categories.delete(id)
  }

  // Presupuestos
  getBudgets() {
    return db.budgets.toArray()
  }
  async setBudget(categoriaId: number, montoLimite: number) {
    const existente = await db.budgets.where('categoriaId').equals(categoriaId).first()
    if (existente?.id) {
      await db.budgets.update(existente.id, { montoLimite })
    } else {
      await db.budgets.add({ categoriaId, montoLimite })
    }
  }
  async deleteBudget(id: number) {
    await db.budgets.delete(id)
  }

  // Deudas
  getDebts() {
    return db.debts.orderBy('fechaCreacion').reverse().toArray()
  }
  async addDebt(d: Omit<Debt, 'id'>) {
    return db.debts.add(d as Debt)
  }
  async updateDebt(id: number, cambios: Partial<Debt>) {
    await db.debts.update(id, cambios)
  }
  async deleteDebt(id: number) {
    await db.debts.delete(id)
  }

  // Gastos obligatorios
  getObligaciones() {
    return db.obligaciones.toArray()
  }
  async addObligacion(o: Omit<Obligacion, 'id'>) {
    return db.obligaciones.add(o as Obligacion)
  }
  async updateObligacion(id: number, cambios: Partial<Obligacion>) {
    await db.obligaciones.update(id, cambios)
  }
  async deleteObligacion(id: number) {
    await db.obligaciones.delete(id)
  }

  // Bolsillos
  getBolsillos() {
    return db.bolsillos.toArray().then(bs =>
      bs.sort((a, b) => {
        const oa = a.orden ?? a.id ?? 0
        const ob = b.orden ?? b.id ?? 0
        return oa - ob
      })
    )
  }
  async addBolsillo(b: Omit<Bolsillo, 'id'>) {
    return db.bolsillos.add(b as Bolsillo)
  }
  async updateBolsillo(id: number, cambios: Partial<Bolsillo>) {
    await db.bolsillos.update(id, cambios)
  }
  async deleteBolsillo(id: number) {
    await db.bolsillos.delete(id)
  }

  // Ajustes
  async getSetting(key: string) {
    const s = await db.settings.get(key)
    return s?.value
  }
  async setSetting(key: string, value: string) {
    await db.settings.put({ key, value })
  }

  // Listas de mercado
  getListasMercado() {
    return db.listaMercado.orderBy('fecha').toArray()
  }
  async getListaMercado(id: number) {
    return db.listaMercado.get(id)
  }
  async addListaMercado(l: Omit<ListaMercado, 'id'>) {
    return db.listaMercado.add(l as ListaMercado)
  }
  async updateListaMercado(id: number, cambios: Partial<ListaMercado>) {
    await db.listaMercado.update(id, cambios)
  }
  async deleteListaMercado(id: number) {
    await db.listaMercado.delete(id)
  }

  // Capturas de notificaciones
  async addCapturaNotif(c: Omit<CapturaNotif, 'id'>): Promise<number | null> {
    const existing = await db.capturasNotif.where('capturaId').equals(c.capturaId).first()
    if (existing) return null
    return db.capturasNotif.add(c as CapturaNotif)
  }
  getCapturasNotif(estado?: CapturaNotif['estado']) {
    const col = estado
      ? db.capturasNotif.where('estado').equals(estado)
      : db.capturasNotif.orderBy('timestamp')
    return col.reverse().toArray()
  }
  async updateCapturaNotif(id: number, cambios: Partial<CapturaNotif>) {
    await db.capturasNotif.update(id, cambios)
  }

  async borrarTodo() {
    await db.transaction(
      'rw',
      [db.transactions, db.categories, db.budgets, db.debts, db.obligaciones, db.bolsillos, db.settings, db.listaMercado, db.capturasNotif],
      async () => {
        await db.transactions.clear()
        await db.categories.clear()
        await db.budgets.clear()
        await db.debts.clear()
        await db.obligaciones.clear()
        await db.bolsillos.clear()
        await db.settings.clear()
        await db.listaMercado.clear()
        await db.capturasNotif.clear()
      },
    )
  }
}

/** Instancia única usada por toda la app. Cambiar aquí para migrar a la nube. */
export const repo: Repository = new LocalRepository()
