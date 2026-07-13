import { repo } from './repository'
import type { Category } from './db'
import { db } from './db'

const CATEGORIAS_DEFECTO: Omit<Category, 'id'>[] = [
  // Gastos
  { nombre: 'Comida', tipo: 'gasto', color: '#f97316', icono: '🍔' },
  { nombre: 'Transporte', tipo: 'gasto', color: '#3b82f6', icono: '🚌' },
  { nombre: 'Vivienda', tipo: 'gasto', color: '#8b5cf6', icono: '🏠' },
  { nombre: 'Servicios', tipo: 'gasto', color: '#eab308', icono: '💡' },
  { nombre: 'Salud', tipo: 'gasto', color: '#ef4444', icono: '💊' },
  { nombre: 'Entretenimiento', tipo: 'gasto', color: '#ec4899', icono: '🎬' },
  { nombre: 'Compras', tipo: 'gasto', color: '#14b8a6', icono: '🛍️' },
  { nombre: 'Otros gastos', tipo: 'gasto', color: '#64748b', icono: '📦' },
  // Ingresos
  { nombre: 'Salario', tipo: 'ingreso', color: '#22c55e', icono: '💼' },
  { nombre: 'Ventas', tipo: 'ingreso', color: '#10b981', icono: '🪙' },
  { nombre: 'Otros ingresos', tipo: 'ingreso', color: '#84cc16', icono: '➕' },
]

/** Siembra categorías y moneda por defecto la primera vez que se abre la app. */
export async function seedSiPrimeraVez() {
  const yaSembrado = await repo.getSetting('seeded')
  if (yaSembrado) return

  for (const c of CATEGORIAS_DEFECTO) {
    await repo.addCategory(c)
  }
  await repo.addBolsillo({ nombre: 'General', icono: '👛', color: '#10b981' })
  await repo.setSetting('moneda', 'COP')
  await repo.setSetting('seeded', '1')
}

export async function migrarBolsillos() {
  const count = await db.bolsillos.count()
  if (count > 0) return
  const id = await repo.addBolsillo({ nombre: 'General', icono: '👛', color: '#10b981' })
  await db.transactions.toCollection().modify({ bolsilloId: id })
}
