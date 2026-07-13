import { useState } from 'react'
import Modal from '../../components/Modal'
import { repo } from '../../data/repository'
import type { Category, TipoMovimiento } from '../../data/db'
import { useCategories } from '../../hooks/data'

const COLORES = [
  '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#3b82f6',
  '#14b8a6', '#22c55e', '#84cc16', '#eab308', '#64748b',
]

export default function CategoriesManager({ onVolver }: { onVolver: () => void }) {
  const categorias = useCategories()
  const [editar, setEditar] = useState<Partial<Category> | null>(null)

  const gastos = categorias.filter((c) => c.tipo === 'gasto')
  const ingresos = categorias.filter((c) => c.tipo === 'ingreso')

  return (
    <div className="space-y-4">
      <button onClick={onVolver} className="text-sm text-emerald-600">
        ‹ Volver a Ajustes
      </button>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Categorías</h2>
        <button
          onClick={() => setEditar({ tipo: 'gasto', color: COLORES[0], icono: '🏷️' })}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          + Nueva
        </button>
      </div>

      <Grupo titulo="Gastos" items={gastos} onEditar={setEditar} />
      <Grupo titulo="Ingresos" items={ingresos} onEditar={setEditar} />

      {editar && <CategoryEditor inicial={editar} onClose={() => setEditar(null)} />}
    </div>
  )
}

function Grupo({
  titulo,
  items,
  onEditar,
}: {
  titulo: string
  items: Category[]
  onEditar: (c: Category) => void
}) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-medium text-slate-400">{titulo}</h3>
      <ul className="space-y-1">
        {items.map((c) => (
          <li
            key={c.id}
            onClick={() => onEditar(c)}
            className="flex cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-sm dark:bg-slate-800"
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: c.color + '22' }}
            >
              {c.icono}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-slate-800 dark:text-slate-100">{c.nombre}</div>
              {c.subcategorias && c.subcategorias.length > 0 && (
                <div className="truncate text-xs text-slate-400">
                  {c.subcategorias.join(' · ')}
                </div>
              )}
            </div>
            <span className="text-slate-300">›</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CategoryEditor({
  inicial,
  onClose,
}: {
  inicial: Partial<Category>
  onClose: () => void
}) {
  const [nombre, setNombre] = useState(inicial.nombre ?? '')
  const [tipo, setTipo] = useState<TipoMovimiento>(inicial.tipo ?? 'gasto')
  const [color, setColor] = useState(inicial.color ?? COLORES[0])
  const [icono, setIcono] = useState(inicial.icono ?? '🏷️')
  const [subs, setSubs] = useState<string[]>(inicial.subcategorias ?? [])
  const [nuevaSub, setNuevaSub] = useState('')

  function agregarSub() {
    const s = nuevaSub.trim()
    if (s && !subs.some((x) => x.toLowerCase() === s.toLowerCase())) {
      setSubs([...subs, s])
    }
    setNuevaSub('')
  }

  async function guardar() {
    if (!nombre.trim()) return
    const datos = { nombre: nombre.trim(), tipo, color, icono, subcategorias: subs }
    if (inicial.id) {
      await repo.updateCategory(inicial.id, datos)
    } else {
      await repo.addCategory(datos)
    }
    onClose()
  }

  return (
    <Modal title={inicial.id ? 'Editar categoría' : 'Nueva categoría'} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-3">
          <input
            value={icono}
            onChange={(e) => setIcono(e.target.value.slice(0, 2))}
            className="w-16 rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-center text-2xl dark:border-slate-600"
            aria-label="Ícono"
          />
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre"
            autoFocus
            className="flex-1 rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(['gasto', 'ingreso'] as TipoMovimiento[]).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`rounded-lg py-2 font-medium capitalize ${
                tipo === t
                  ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {COLORES.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-800' : ''}`}
              style={{ backgroundColor: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>

        <div>
          <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
            Subcategorías
          </span>
          {subs.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {subs.map((s) => (
                <span
                  key={s}
                  className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-700"
                >
                  {s}
                  <button
                    onClick={() => setSubs(subs.filter((x) => x !== s))}
                    className="text-slate-400 hover:text-red-500"
                    aria-label={`Quitar ${s}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={nuevaSub}
              onChange={(e) => setNuevaSub(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarSub())}
              placeholder="Ej. Agua"
              className="flex-1 rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600"
            />
            <button
              onClick={agregarSub}
              className="rounded-lg bg-slate-200 px-4 font-medium text-slate-700 dark:bg-slate-600 dark:text-slate-100"
            >
              Añadir
            </button>
          </div>
        </div>

        <button
          onClick={guardar}
          className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white"
        >
          Guardar
        </button>

        {inicial.id && (
          <button
            onClick={async () => {
              if (inicial.id) await repo.deleteCategory(inicial.id)
              onClose()
            }}
            className="w-full rounded-lg py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            Eliminar categoría
          </button>
        )}
      </div>
    </Modal>
  )
}
