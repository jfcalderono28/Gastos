import { useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import SubcategoriaSelect from '../../components/SubcategoriaSelect'
import { repo } from '../../data/repository'
import type { Category, Obligacion } from '../../data/db'
import { useCategories, useMoneda, useObligaciones, useTransactions } from '../../hooks/data'
import { formatMoney } from '../../lib/format'
import { estimadoMensual } from './calc'

export default function ObligacionesManager({ onVolver }: { onVolver: () => void }) {
  const categorias = useCategories()
  const obligaciones = useObligaciones()
  const transacciones = useTransactions()
  const moneda = useMoneda()
  const [editar, setEditar] = useState<Obligacion | null | 'nueva'>(null)

  const catById = useMemo(() => {
    const m = new Map<number, Category>()
    categorias.forEach((c) => c.id && m.set(c.id, c))
    return m
  }, [categorias])

  return (
    <div className="space-y-4">
      <button onClick={onVolver} className="text-sm text-emerald-600">
        ‹ Volver a Ajustes
      </button>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Gastos obligatorios
        </h2>
        <button
          onClick={() => setEditar('nueva')}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          + Nuevo
        </button>
      </div>
      <p className="text-sm text-slate-400">
        Gastos que pagas mes a mes con una ventana de fechas. Si no pones un monto fijo, se estima
        promediando lo que gastas en esa categoría.
      </p>

      {obligaciones.length === 0 ? (
        <p className="py-8 text-center text-slate-400">Aún no has creado gastos obligatorios.</p>
      ) : (
        <ul className="space-y-2">
          {obligaciones.map((o) => {
            const cat = catById.get(o.categoriaId)
            return (
              <li
                key={o.id}
                onClick={() => setEditar(o)}
                className="flex cursor-pointer items-center gap-3 rounded-xl bg-white p-3 shadow-sm dark:bg-slate-800"
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
                  style={{ backgroundColor: (cat?.color ?? '#94a3b8') + '22' }}
                >
                  {cat?.icono ?? '📌'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-800 dark:text-slate-100">
                    {cat?.nombre ?? 'Categoría'}
                    {o.subcategoria ? ` · ${o.subcategoria}` : ''}
                  </div>
                  <div className="text-xs text-slate-400">
                    Pago entre el {o.diaInicio} y el {o.diaFin} ·{' '}
                    {o.montoFijo != null
                      ? `${formatMoney(o.montoFijo, moneda)} fijo`
                      : `~${formatMoney(estimadoMensual(o, transacciones), moneda)} (promedio)`}
                  </div>
                </div>
                <span className="text-slate-300">›</span>
              </li>
            )
          })}
        </ul>
      )}

      {editar !== null && (
        <ObligacionEditor
          inicial={editar === 'nueva' ? null : editar}
          categorias={categorias}
          moneda={moneda}
          onClose={() => setEditar(null)}
        />
      )}
    </div>
  )
}

function ObligacionEditor({
  inicial,
  categorias,
  moneda,
  onClose,
}: {
  inicial: Obligacion | null
  categorias: Category[]
  moneda: string
  onClose: () => void
}) {
  const categoriasGasto = categorias.filter((c) => c.tipo === 'gasto')
  const [categoriaId, setCategoriaId] = useState<number | '' | '__nueva__'>(
    inicial?.categoriaId ?? '',
  )
  const [nombreNueva, setNombreNueva] = useState('')
  const [subcategoria, setSubcategoria] = useState(inicial?.subcategoria ?? '')
  const [diaInicio, setDiaInicio] = useState(String(inicial?.diaInicio ?? 1))
  const [diaFin, setDiaFin] = useState(String(inicial?.diaFin ?? 5))
  const [montoFijo, setMontoFijo] = useState(inicial?.montoFijo != null ? String(inicial.montoFijo) : '')

  const categoriaSel =
    typeof categoriaId === 'number' ? categorias.find((c) => c.id === categoriaId) : undefined
  const subSugeridas = categoriaSel?.subcategorias ?? []

  const valido =
    (categoriaId === '__nueva__' ? nombreNueva.trim().length > 0 : categoriaId !== '') &&
    Number(diaInicio) >= 1 &&
    Number(diaFin) >= 1

  async function guardar() {
    if (!valido) return
    const sub = subcategoria.trim()
    let catId: number
    if (categoriaId === '__nueva__') {
      catId = await repo.addCategory({
        nombre: nombreNueva.trim(),
        tipo: 'gasto',
        color: '#0ea5e9',
        icono: '📌',
        subcategorias: sub ? [sub] : [],
      })
    } else {
      catId = Number(categoriaId)
      // Si la subcategoría es nueva para la categoría, la guardamos para reusarla
      if (sub && categoriaSel?.id) {
        const lista = categoriaSel.subcategorias ?? []
        if (!lista.some((s) => s.toLowerCase() === sub.toLowerCase())) {
          await repo.updateCategory(categoriaSel.id, { subcategorias: [...lista, sub] })
        }
      }
    }
    const datos: Omit<Obligacion, 'id'> = {
      categoriaId: catId,
      subcategoria: sub || undefined,
      diaInicio: Math.min(31, Math.max(1, Number(diaInicio))),
      diaFin: Math.min(31, Math.max(1, Number(diaFin))),
      montoFijo: montoFijo.trim() ? Number(montoFijo) : undefined,
    }
    if (inicial?.id) await repo.updateObligacion(inicial.id, datos)
    else await repo.addObligacion(datos)
    onClose()
  }

  return (
    <Modal title={inicial ? 'Editar gasto obligatorio' : 'Nuevo gasto obligatorio'} onClose={onClose}>
      <div className="space-y-4">
        <Campo label="Categoría">
          <select
            value={categoriaId}
            onChange={(e) => {
              const v = e.target.value
              setCategoriaId(v === '' ? '' : v === '__nueva__' ? '__nueva__' : Number(v))
            }}
            className={`${inputCls}`}
          >
            <option value="" className="text-black">Selecciona…</option>
            {categoriasGasto.map((c) => (
              <option key={c.id} value={c.id} className="text-black">
                {c.icono} {c.nombre}
              </option>
            ))}
            <option value="__nueva__" className="text-black">➕ Crear nueva categoría…</option>
          </select>
        </Campo>

        {categoriaId === '__nueva__' && (
          <Campo label="Nombre de la nueva categoría">
            <input
              value={nombreNueva}
              onChange={(e) => setNombreNueva(e.target.value)}
              placeholder="Ej. Impuestos, Curso inglés…"
              autoFocus
              className={inputCls}
            />
          </Campo>
        )}

        {categoriaId !== '' && (
          <Campo label="Subcategoría (opcional)">
            <SubcategoriaSelect
              subcategorias={subSugeridas}
              value={subcategoria}
              onChange={setSubcategoria}
            />
            <span className="mt-1 block text-xs text-slate-400">
              Déjalo vacío para tomar toda la categoría; o especifica una (ej. Impuestos → Luz).
            </span>
          </Campo>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Pagar desde el día">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              value={diaInicio}
              onChange={(e) => setDiaInicio(e.target.value)}
              className={inputCls}
            />
          </Campo>
          <Campo label="Hasta el día (límite)">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              value={diaFin}
              onChange={(e) => setDiaFin(e.target.value)}
              className={inputCls}
            />
          </Campo>
        </div>

        <Campo label="Monto fijo (opcional)">
          <input
            type="number"
            inputMode="decimal"
            value={montoFijo}
            onChange={(e) => setMontoFijo(e.target.value)}
            placeholder="Déjalo vacío para promediar la categoría"
            className={inputCls}
          />
          <span className="mt-1 block text-xs text-slate-400">
            En blanco = se estima con el promedio de gasto en esa categoría ({moneda}).
          </span>
        </Campo>

        <button
          onClick={guardar}
          disabled={!valido}
          className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white disabled:opacity-40"
        >
          Guardar
        </button>

        {inicial?.id && (
          <button
            onClick={async () => {
              if (inicial.id) await repo.deleteObligacion(inicial.id)
              onClose()
            }}
            className="w-full rounded-lg py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            Eliminar
          </button>
        )}
      </div>
    </Modal>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600'

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </label>
  )
}
