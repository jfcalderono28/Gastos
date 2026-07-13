import { useState } from 'react'
import Modal from '../../components/Modal'
import { repo } from '../../data/repository'
import type { Bolsillo, Category, Debt } from '../../data/db'
import { hoyISO } from '../../lib/dates'
import { formatMoney } from '../../lib/format'
import { pendiente } from './calc'
import { useBolsillosSaldos } from '../../hooks/data'

export default function PayDebtForm({
  deuda,
  categorias,
  bolsillos,
  moneda,
  onClose,
}: {
  deuda: Debt
  categorias: Category[]
  bolsillos: Bolsillo[]
  moneda: string
  onClose: () => void
}) {
  const pend = pendiente(deuda)
  const sugerido = deuda.esCuotas ? Math.min(deuda.montoCuota ?? 0, pend) : pend
  const bolsilloMedioPago = bolsillos.find((b) => b.id === deuda.bolsilloId)

  const [monto, setMonto] = useState(sugerido ? String(sugerido) : '')
  const [nota, setNota] = useState('')
  const [bolsilloId, setBolsilloId] = useState<number | ''>(bolsillos[0]?.id ?? '')
  const [pagando, setPagando] = useState(false)
  const saldos = useBolsillosSaldos()

  const valor = Number(monto) || 0
  const bolsilloSel = bolsillos.find(b => b.id === bolsilloId)
  const saldoBolsillo = typeof bolsilloId === 'number' ? (saldos.get(bolsilloId) ?? null) : null
  const saldoInsuficiente =
    bolsilloSel?.tipo !== 'credito' &&
    saldoBolsillo !== null &&
    valor > saldoBolsillo
  const valido = valor > 0 && !saldoInsuficiente

  async function pagar() {
    if (!valido || !deuda.id) return
    setPagando(true)

    // Categoría "Deudas" (crear si no existe)
    let categoriaId = categorias.find(
      (c) => c.tipo === 'gasto' && c.nombre.toLowerCase() === 'deudas',
    )?.id
    if (!categoriaId) {
      categoriaId = await repo.addCategory({
        nombre: 'Deudas',
        tipo: 'gasto',
        color: '#e11d48',
        icono: '💳',
      })
    }

    const notaFinal = nota.trim()

    await repo.addTransaction({
      tipo: 'gasto',
      monto: valor,
      fecha: hoyISO(),
      categoriaId,
      subcategoria: deuda.nombre,
      nota: notaFinal || undefined,
      bolsilloId: bolsilloId || undefined,
    })
    // 2) Descuenta del saldo pendiente de la deuda
    await repo.updateDebt(deuda.id, { montoPagado: (deuda.montoPagado ?? 0) + valor })

    setPagando(false)
    onClose()
  }

  return (
    <Modal title={`Pagar · ${deuda.nombre}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Saldo pendiente: <b>{formatMoney(pend, moneda)}</b>
        </p>

        <Campo label="Monto a pagar">
          <input
            type="number"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            autoFocus
            className={inputCls}
          />
          {deuda.esCuotas && (
            <span className="mt-1 block text-xs text-slate-400">
              Cuota sugerida: {formatMoney(deuda.montoCuota ?? 0, moneda)}
            </span>
          )}
        </Campo>

        {bolsillos.length > 1 && (
          <Campo label={bolsilloMedioPago?.tipo === 'credito' ? 'Bolsillo de origen (desde donde saldrá el dinero)' : 'Bolsillo'}>
            <select
              value={bolsilloId}
              onChange={(e) => setBolsilloId(e.target.value ? Number(e.target.value) : '')}
              className={`${inputCls}`}
            >
              {bolsillos.map((b) => (
                <option key={b.id} value={b.id} className="text-black" disabled={b.id === deuda.bolsilloId}>
                  {b.icono} {b.nombre} {b.tipo === 'credito' ? '(Crédito)' : ''}
                </option>
              ))}
            </select>
          </Campo>
        )}



        <Campo label="Nota (opcional)">
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Detalle del pago"
            className={inputCls}
          />
        </Campo>

        {valor > pend && pend > 0 && (
          <p className="text-xs text-amber-600">
            Estás pagando más que el saldo pendiente ({formatMoney(pend, moneda)}).
          </p>
        )}

        {saldoInsuficiente && saldoBolsillo !== null && (
          <p className="text-xs text-red-600 dark:text-red-400">
            ⚠️ Saldo insuficiente en {bolsilloSel?.nombre} (disponible: {formatMoney(saldoBolsillo, moneda)}).
          </p>
        )}

        <button
          onClick={pagar}
          disabled={!valido || pagando}
          className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white disabled:opacity-40"
        >
          {pagando ? 'Registrando…' : 'Registrar pago'}
        </button>
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
