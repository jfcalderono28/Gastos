import { useState } from 'react'
import MercadoPage from './MercadoPage'
import { useCategories, useListasMercado, useMoneda } from '../../hooks/data'
import { repo } from '../../data/repository'
import { hoyISO } from '../../lib/dates'
import { formatMoney } from '../../lib/format'
import Modal from '../../components/Modal'
import type { Category } from '../../data/db'

function itemVacio() {
  return { id: Date.now().toString() + Math.random(), nombre: '', costo: '', cantidad: '1' }
}

export default function ComprasPage() {
  const [listaId, setListaId] = useState<number | null>(null)
  const [eligiendoCategoria, setEligiendoCategoria] = useState(false)
  const listas = useListasMercado()
  const moneda = useMoneda()
  const categorias = useCategories()
  const categoriasGasto = categorias.filter(c => c.tipo === 'gasto')

  if (listaId !== null) {
    return <MercadoPage listaId={listaId} onVolver={() => setListaId(null)} />
  }

  async function crearConCategoria(cat: Category) {
    const id = await repo.addListaMercado({
      nombre: `${cat.nombre} ${new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`,
      fecha: hoyISO(),
      items: [itemVacio()],
      subcategorias: [],
      categoriaId: cat.id,
      total: 0,
    })
    setEligiendoCategoria(false)
    setListaId(id)
  }

  async function eliminarLista(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('¿Eliminar esta lista?')) return
    await repo.deleteListaMercado(id)
  }

  const listasOrdenadas = [...listas].reverse()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Compras</h1>
        <button
          onClick={() => setEligiendoCategoria(true)}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white active:scale-95"
        >
          + Nueva lista
        </button>
      </div>

      {listasOrdenadas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
          <span className="text-5xl">🛒</span>
          <p className="text-sm">Sin listas guardadas</p>
          <button
            onClick={() => setEligiendoCategoria(true)}
            className="mt-1 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Crear primera lista
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm dark:divide-slate-700 dark:bg-slate-800">
          {listasOrdenadas.map(lista => (
            <li key={lista.id} className="flex items-center hover:bg-slate-50 dark:hover:bg-slate-700/50">
              <div
                role="button"
                onClick={() => setListaId(lista.id!)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-3 text-left"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${lista.transaccionId ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-slate-100 dark:bg-slate-700'}`}>
                  {categorias.find(c => c.id === lista.categoriaId)?.icono ?? '🛒'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800 dark:text-slate-100">{lista.nombre}</div>
                  <div className="text-xs text-slate-400">
                    {lista.items.filter(it => it.nombre.trim()).length} productos · {lista.fecha}
                    {lista.transaccionId && (
                      <span className="ml-2 font-medium text-emerald-600 dark:text-emerald-400">✓ Registrado</span>
                    )}
                  </div>
                </div>
                <span className={`text-sm font-semibold tabular-nums ${lista.total > 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-300'}`}>
                  {lista.total > 0 ? formatMoney(lista.total, moneda) : '—'}
                </span>
              </div>
              <button
                onClick={e => eliminarLista(lista.id!, e)}
                className="shrink-0 px-3 py-3 text-sm text-slate-300 hover:text-rose-400"
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}

      {eligiendoCategoria && (
        <Modal title="¿Para qué categoría?" onClose={() => setEligiendoCategoria(false)}>
          <ul className="space-y-1">
            {categoriasGasto.length === 0 ? (
              <li className="py-6 text-center text-sm text-slate-400">
                No hay categorías de gasto. Crea una en Ajustes.
              </li>
            ) : (
              categoriasGasto.map(cat => (
                <li key={cat.id}>
                  <button
                    type="button"
                    onClick={() => crearConCategoria(cat)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-700 dark:active:bg-slate-600"
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl"
                      style={{ backgroundColor: cat.color + '33' }}
                    >
                      {cat.icono}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-800 dark:text-slate-100">{cat.nombre}</div>
                      {cat.subcategorias && cat.subcategorias.length > 0 ? (
                        <div className="truncate text-xs text-slate-400">
                          {cat.subcategorias.slice(0, 4).join(' · ')}
                          {cat.subcategorias.length > 4 && ` +${cat.subcategorias.length - 4}`}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">Sin secciones guardadas</div>
                      )}
                    </div>
                    <span className="text-slate-300">›</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </Modal>
      )}
    </div>
  )
}
