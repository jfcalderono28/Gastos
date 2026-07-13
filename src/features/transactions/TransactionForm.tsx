import { useEffect, useState } from 'react'
import Modal from '../../components/Modal'
import SubcategoriaSelect from '../../components/SubcategoriaSelect'
import { repo } from '../../data/repository'
import type { Bolsillo, Category, TipoMovimiento, Transaction } from '../../data/db'
import { hoyISO, mesActual } from '../../lib/dates'
import { useBolsillosSaldos } from '../../hooks/data'
import { formatMoney } from '../../lib/format'

export default function TransactionForm({
  categorias,
  bolsillos,
  existente,
  onClose,
}: {
  categorias: Category[]
  bolsillos: Bolsillo[]
  existente?: Transaction
  onClose: () => void
}) {
  const [tipo, setTipo] = useState<TipoMovimiento>(existente?.tipo ?? 'gasto')
  const [monto, setMonto] = useState(existente ? String(existente.monto) : '')
  const [fecha, setFecha] = useState(existente?.fecha ?? hoyISO())
  const [categoriaId, setCategoriaId] = useState<number | '' | '__nueva__'>(existente?.categoriaId ?? '')
  const [nombreNueva, setNombreNueva] = useState('')
  const [subcategoria, setSubcategoria] = useState(existente?.subcategoria ?? '')
  const [nota, setNota] = useState(existente?.nota ?? '')
  const [bolsilloId, setBolsilloId] = useState<number | ''>(existente?.bolsilloId ?? (bolsillos[0]?.id ?? ''))

  // Campos extra para modo deuda (tarjeta crédito)
  const [nombreDeudaInput, setNombreDeudaInput] = useState('')
  const [esCuotas, setEsCuotas] = useState(false)
  const [numCuotas, setNumCuotas] = useState('')
  const [montoCuota, setMontoCuota] = useState('')
  const [cuotaEditada, setCuotaEditada] = useState(false)
  const [mesPrimeraCuota, setMesPrimeraCuota] = useState(mesActual())
  const [fechaPago, setFechaPago] = useState(hoyISO())

  const saldos = useBolsillosSaldos()

  const bolsilloSel = bolsillos.find(b => b.id === bolsilloId)
  const esCredito = bolsilloSel?.tipo === 'credito'

  const categoriasTipo = categorias.filter((c) => c.tipo === (esCredito ? 'gasto' : tipo))
  const categoriaSel = typeof categoriaId === 'number' ? categorias.find((c) => c.id === categoriaId) : undefined
  const subSugeridas = categoriaSel?.subcategorias ?? []

  const saldoBolsillo = typeof bolsilloId === 'number' ? (saldos.get(bolsilloId) ?? null) : null
  const saldoInsuficiente =
    tipo === 'gasto' &&
    !esCredito &&
    saldoBolsillo !== null &&
    Number(monto) > saldoBolsillo

  // Auto-calcular fechas de pago según diaCorte de la tarjeta
  useEffect(() => {
    if (!esCredito || !bolsilloSel?.diaCorte) return
    const d = new Date(fecha + 'T00:00:00')
    let month = d.getMonth()
    let year = d.getFullYear()
    if (d.getDate() > bolsilloSel.diaCorte) {
      month++
      if (month > 11) { month = 0; year++ }
    }
    const cutoff = new Date(year, month, bolsilloSel.diaCorte)
    cutoff.setDate(cutoff.getDate() + 15)
    const y = cutoff.getFullYear()
    const m = String(cutoff.getMonth() + 1).padStart(2, '0')
    const dd = String(cutoff.getDate()).padStart(2, '0')
    if (esCuotas) setMesPrimeraCuota(`${y}-${m}`)
    else setFechaPago(`${y}-${m}-${dd}`)
  }, [bolsilloId, fecha, esCuotas, esCredito, bolsilloSel?.diaCorte])

  const montoNum = Number(monto) || 0
  const n = Number(numCuotas) || 0
  const cuotaSugerida = esCuotas && n > 0 ? Math.round(montoNum / n) : 0
  const cuotaMostrada = cuotaEditada ? montoCuota : cuotaSugerida ? String(cuotaSugerida) : montoCuota

  const nombreDeuda = (nombreDeudaInput.trim() || subcategoria.trim() || categoriaSel?.nombre || '').trim()

  const valido = esCredito
    ? montoNum > 0 && nombreDeuda.length > 0 && (!esCuotas || (n > 0 && Number(cuotaMostrada) > 0))
    : montoNum > 0 &&
      !saldoInsuficiente &&
      (categoriaId === '__nueva__' ? nombreNueva.trim().length > 0 : categoriaId !== '')

  async function guardar() {
    if (!valido) return
    const sub = subcategoria.trim()

    // Persistir subcategoría nueva si aplica
    if (sub && typeof categoriaId === 'number' && categoriaSel?.id) {
      const lista = categoriaSel.subcategorias ?? []
      if (!lista.some((s) => s.toLowerCase() === sub.toLowerCase())) {
        await repo.updateCategory(categoriaSel.id, { subcategorias: [...lista, sub] })
      }
    }

    if (esCredito) {
      // Crear como Debt
      let catId = typeof categoriaId === 'number' ? categoriaId : undefined
      if (categoriaId === '__nueva__' && nombreNueva.trim()) {
        catId = await repo.addCategory({
          nombre: nombreNueva.trim(),
          tipo: 'gasto',
          color: '#ef4444',
          icono: '📦',
          subcategorias: sub ? [sub] : [],
        })
      }
      const base = {
        nombre: nombreDeuda || nota.trim() || 'Compra con tarjeta',
        montoTotal: montoNum,
        fechaCreacion: fecha,
        esCuotas,
        tipo_deuda: 'debo' as const,
        bolsilloId: bolsilloId || undefined,
        categoriaId: catId,
        subcategoria: sub || undefined,
      }
      if (esCuotas) {
        await repo.addDebt({ ...base, numCuotas: n, montoCuota: Number(cuotaMostrada), mesPrimeraCuota })
      } else {
        await repo.addDebt({ ...base, fechaPago })
      }
      onClose()
      return
    }

    // Modo normal: crear Transaction
    const valor = montoNum
    let catId: number
    if (categoriaId === '__nueva__') {
      catId = await repo.addCategory({
        nombre: nombreNueva.trim(),
        tipo,
        color: tipo === 'gasto' ? '#ef4444' : '#10b981',
        icono: tipo === 'gasto' ? '📦' : '💰',
        subcategorias: sub ? [sub] : [],
      })
    } else {
      catId = Number(categoriaId)
    }

    const datos = {
      tipo,
      monto: valor,
      fecha,
      categoriaId: catId,
      subcategoria: sub || undefined,
      nota: nota.trim(),
      bolsilloId: bolsilloId || undefined,
    }
    if (existente?.id) {
      await repo.updateTransaction(existente.id, datos)
    } else {
      await repo.addTransaction(datos)
    }
    onClose()
  }

  const inputCls = 'w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600'

  return (
    <Modal title={existente ? 'Editar movimiento' : 'Nuevo movimiento'} onClose={onClose}>
      <div className="space-y-4">

        {/* Selector ingreso/gasto solo en modo normal */}
        {!esCredito && (
          <div className="grid grid-cols-2 gap-2">
            {(['gasto', 'ingreso'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTipo(t); setCategoriaId('') }}
                className={`rounded-lg py-2 font-medium capitalize ${
                  tipo === t
                    ? t === 'gasto' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Banner informativo en modo crédito */}
        {esCredito && (
          <div className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            💳 Tarjeta de crédito — se registrará como <strong>deuda</strong> con su calendario de pago.
          </div>
        )}

        {esCredito && (
          <Campo label="Nombre de la deuda">
            <input
              value={nombreDeudaInput}
              onChange={(e) => setNombreDeudaInput(e.target.value)}
              placeholder="Ej. Compra Nike, Netflix, Viaje…"
              className={inputCls}
            />
          </Campo>
        )}

        <Campo label="Monto">
          <input
            type="number"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0"
            className={`${inputCls} text-lg`}
            autoFocus
          />
        </Campo>

        {bolsillos.length > 1 && (
          <Campo label="Bolsillo">
            <select
              value={bolsilloId}
              onChange={(e) => {
                setBolsilloId(e.target.value ? Number(e.target.value) : '')
                setCategoriaId('')
                setEsCuotas(false)
                setCuotaEditada(false)
                setNombreDeudaInput('')
              }}
              className={inputCls}
            >
              {bolsillos.map((b) => (
                <option key={b.id} value={b.id} className="text-black">
                  {b.icono} {b.nombre}{b.tipo === 'credito' ? ' (Crédito)' : ''}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <Campo label="Categoría">
          <select
            value={categoriaId}
            onChange={(e) => {
              const v = e.target.value
              setCategoriaId(v === '' ? '' : v === '__nueva__' ? '__nueva__' : Number(v))
              setSubcategoria('')
            }}
            className={inputCls}
          >
            <option value="" className="text-black">Selecciona…</option>
            {(esCredito ? categorias.filter(c => c.tipo === 'gasto') : categoriasTipo).map((c) => (
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
              placeholder="Ej. Suscripciones, Mascotas…"
              autoFocus
              className={inputCls}
            />
          </Campo>
        )}

        {categoriaId !== '' && categoriaId !== '__nueva__' && (
          <Campo label={esCredito ? 'Descripción (nombre de la deuda)' : 'Subcategoría (opcional)'}>
            <SubcategoriaSelect
              subcategorias={subSugeridas}
              value={subcategoria}
              onChange={setSubcategoria}
            />
          </Campo>
        )}

        <Campo label="Fecha">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={inputCls}
          />
        </Campo>

        <Campo label="Nota (opcional)">
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej. mercado del mes"
            className={inputCls}
          />
        </Campo>

        {/* Campos de deuda (solo crédito) */}
        {esCredito && (
          <>
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
                    onChange={(e) => { setCuotaEditada(true); setMontoCuota(e.target.value) }}
                    placeholder="0"
                    className={inputCls}
                  />
                  {cuotaSugerida > 0 && !cuotaEditada && (
                    <span className="mt-1 block text-xs text-slate-400">
                      Sugerido: {formatMoney(cuotaSugerida, '')} (total ÷ {n})
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
          </>
        )}

        {saldoInsuficiente && saldoBolsillo !== null && (
          <p className="text-xs text-red-600 dark:text-red-400">
            ⚠️ Saldo insuficiente en {bolsilloSel?.nombre} (disponible: {formatMoney(saldoBolsillo, '')}).
          </p>
        )}

        <button
          onClick={guardar}
          disabled={!valido}
          className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white disabled:opacity-40"
        >
          {esCredito ? '💳 Registrar deuda' : 'Guardar'}
        </button>

        {existente?.id && (
          <button
            onClick={async () => {
              if (existente.id) await repo.deleteTransaction(existente.id)
              onClose()
            }}
            className="w-full rounded-lg py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            Eliminar movimiento
          </button>
        )}
      </div>
    </Modal>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </label>
  )
}
