import { useEffect, useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import SubcategoriaSelect from '../../components/SubcategoriaSelect'
import { repo } from '../../data/repository'
import type { Debt } from '../../data/db'
import { useBolsillos, useCategories } from '../../hooks/data'
import { hoyISO, mesActual } from '../../lib/dates'
import { formatMoney } from '../../lib/format'

export default function DebtForm({
  existente,
  moneda,
  onClose,
}: {
  existente?: Debt
  moneda: string
  onClose: () => void
}) {
  const [nombre, setNombre] = useState(existente?.nombre ?? '')
  const [montoTotal, setMontoTotal] = useState(existente ? String(existente.montoTotal) : '')
  const [fechaCreacion, setFechaCreacion] = useState(existente?.fechaCreacion ?? hoyISO())
  const [esCuotas, setEsCuotas] = useState(existente?.esCuotas ?? false)
  // Pago único
  const [fechaPago, setFechaPago] = useState(existente?.fechaPago ?? hoyISO())
  // Cuotas
  const [numCuotas, setNumCuotas] = useState(existente?.numCuotas ? String(existente.numCuotas) : '')
  const [montoCuota, setMontoCuota] = useState(existente?.montoCuota ? String(existente.montoCuota) : '')
  const [mesPrimeraCuota, setMesPrimeraCuota] = useState(existente?.mesPrimeraCuota ?? mesActual())
  const [cuotaEditada, setCuotaEditada] = useState(false)
  const bolsillos = useBolsillos()
  const categorias = useCategories()
  const [bolsilloId, setBolsilloId] = useState<number | ''>(existente?.bolsilloId ?? '')
  const [categoriaId, setCategoriaId] = useState<number | ''>(existente?.categoriaId ?? '')
  const [subcategoria, setSubcategoria] = useState(existente?.subcategoria ?? '')

  const categoriasGasto = useMemo(
    () => categorias.filter(c => c.tipo === 'gasto'),
    [categorias]
  )
  const subcategoriasDeCat = useMemo(() => {
    const cat = categorias.find(c => c.id === categoriaId)
    return cat?.subcategorias ?? []
  }, [categorias, categoriaId])

  useEffect(() => {
    if (!bolsilloId) return
    const b = bolsillos.find(x => x.id === bolsilloId)
    if (b?.tipo === 'credito' && b.diaCorte) {
      const d = new Date(fechaCreacion + 'T00:00:00')
      let month = d.getMonth()
      let year = d.getFullYear()
      if (d.getDate() > b.diaCorte) {
        month++
        if (month > 11) {
          month = 0
          year++
        }
      }
      const cutoff = new Date(year, month, b.diaCorte)
      cutoff.setDate(cutoff.getDate() + 15)

      const y = cutoff.getFullYear()
      const m = String(cutoff.getMonth() + 1).padStart(2, '0')
      const dd = String(cutoff.getDate()).padStart(2, '0')

      if (esCuotas) setMesPrimeraCuota(`${y}-${m}`)
      else setFechaPago(`${y}-${m}-${dd}`)
    }
  }, [bolsilloId, bolsillos, fechaCreacion, esCuotas])

  const total = Number(montoTotal) || 0
  const n = Number(numCuotas) || 0
  // Sugerir cuota = total / nº cuotas (si el usuario no la ha tocado)
  const cuotaSugerida = esCuotas && n > 0 ? Math.round(total / n) : 0
  const cuotaMostrada = cuotaEditada ? montoCuota : cuotaSugerida ? String(cuotaSugerida) : montoCuota

  function valido() {
    if (!nombre.trim() || total <= 0) return false
    if (esCuotas) return n > 0 && Number(cuotaMostrada) > 0
    return true
  }

  async function guardar() {
    if (!valido()) return

    // Persistir subcategoría nueva en la categoría
    const sub = subcategoria.trim()
    if (sub && categoriaId) {
      const cat = categorias.find(c => c.id === categoriaId)
      if (cat?.id) {
        const lista = cat.subcategorias ?? []
        if (!lista.some(s => s.toLowerCase() === sub.toLowerCase())) {
          await repo.updateCategory(cat.id, { subcategorias: [...lista, sub] })
        }
      }
    }

    const base = {
      nombre: nombre.trim(),
      montoTotal: total,
      fechaCreacion,
      esCuotas,
      tipo_deuda: 'debo' as const,
      bolsilloId: bolsilloId || undefined,
      categoriaId: categoriaId || undefined,
      subcategoria: sub || undefined,
    }
    const datos: Omit<Debt, 'id'> = esCuotas
      ? {
        ...base,
        numCuotas: n,
        montoCuota: Number(cuotaMostrada),
        mesPrimeraCuota,
      }
      : { ...base, fechaPago }
    if (existente?.id) await repo.updateDebt(existente.id, datos)
    else await repo.addDebt(datos)
    onClose()
  }

  return (
    <Modal title={existente ? 'Editar deuda' : 'Nueva deuda'} onClose={onClose}>
      <div className="space-y-4">
        <Campo label="Nombre">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Préstamo, tarjeta…"
            autoFocus
            className={inputCls}
          />
        </Campo>

        <Campo label="Monto total">
          <input
            type="number"
            inputMode="decimal"
            value={montoTotal}
            onChange={(e) => setMontoTotal(e.target.value)}
            placeholder="0"
            className={inputCls}
          />
        </Campo>

        <Campo label="Fecha de creación">
          <input type="date" value={fechaCreacion} onChange={(e) => setFechaCreacion(e.target.value)} className={inputCls} />
        </Campo>

        <Campo label="Categoría">
          <select
            value={categoriaId}
            onChange={e => { setCategoriaId(e.target.value ? Number(e.target.value) : ''); setSubcategoria('') }}
            className={`${inputCls}`}
          >
            <option value="" className="text-black">-- Sin categoría --</option>
            {categoriasGasto.map(c => (
              <option key={c.id} value={c.id} className="text-black">
                {c.icono} {c.nombre}
              </option>
            ))}
          </select>
        </Campo>

        {categoriaId !== '' && (
          <Campo label="Subcategoría">
            <SubcategoriaSelect
              subcategorias={subcategoriasDeCat}
              value={subcategoria}
              onChange={setSubcategoria}
            />
          </Campo>
        )}

        <Campo label="Medio de pago (Bolsillo / Tarjeta)">
          <select
            value={bolsilloId}
            onChange={(e) => setBolsilloId(e.target.value ? Number(e.target.value) : '')}
            className={`${inputCls}`}
          >
            <option value="" className="text-black">-- Ninguno o externo --</option>
            {bolsillos.map((b) => (
              <option key={b.id} value={b.id} className="text-black">
                {b.icono} {b.nombre} {b.tipo === 'credito' ? '(Crédito)' : ''}
              </option>
            ))}
          </select>
        </Campo>

        {/* ¿A cuotas? */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setEsCuotas(false)}
            className={`rounded-lg py-2 font-medium ${!esCuotas ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
          >
            Pago único
          </button>
          <button
            onClick={() => setEsCuotas(true)}
            className={`rounded-lg py-2 font-medium ${esCuotas ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
          >
            A cuotas
          </button>
        </div>

        {!esCuotas ? (
          <Campo label="Fecha de pago (vencimiento)">
            <input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} className={inputCls} />
          </Campo>
        ) : (
          <>
            <Campo label="Número de cuotas (meses)">
              <input
                type="number"
                inputMode="numeric"
                value={numCuotas}
                onChange={(e) => setNumCuotas(e.target.value)}
                placeholder="Ej. 6"
                className={inputCls}
              />
            </Campo>
            <Campo label="Monto por cuota">
              <input
                type="number"
                inputMode="decimal"
                value={cuotaMostrada}
                onChange={(e) => {
                  setCuotaEditada(true)
                  setMontoCuota(e.target.value)
                }}
                placeholder="0"
                className={inputCls}
              />
              {cuotaSugerida > 0 && !cuotaEditada && (
                <span className="mt-1 block text-xs text-slate-400">
                  Sugerido: {formatMoney(cuotaSugerida, moneda)} (total ÷ {n})
                </span>
              )}
            </Campo>
            <Campo label="Mes de la primera cuota">
              <input
                type="month"
                value={mesPrimeraCuota}
                onChange={(e) => setMesPrimeraCuota(e.target.value)}
                className={inputCls}
              />
            </Campo>
          </>
        )}

        <button
          onClick={guardar}
          disabled={!valido()}
          className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white disabled:opacity-40"
        >
          Guardar
        </button>

        {existente?.id && (
          <button
            onClick={async () => {
              if (existente.id) await repo.deleteDebt(existente.id)
              onClose()
            }}
            className="w-full rounded-lg py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            Eliminar deuda
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
