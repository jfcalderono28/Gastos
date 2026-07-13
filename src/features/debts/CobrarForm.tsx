import { useState } from 'react'
import Modal from '../../components/Modal'
import { repo } from '../../data/repository'
import type { Bolsillo, Category, Debt } from '../../data/db'
import { hoyISO } from '../../lib/dates'
import { formatMoney } from '../../lib/format'
import { pendiente } from './calc'

export default function CobrarForm({
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
  const [monto, setMonto] = useState(String(pend))
  const [bolsilloId, setBolsilloId] = useState<number | ''>(bolsillos[0]?.id ?? '')
  const [cobrando, setCobrando] = useState(false)

  const valor = Number(monto) || 0
  const valido = valor > 0
  const esFinal = valor >= pend

  async function cobrar() {
    if (!valido || !deuda.id) return
    setCobrando(true)

    let categoriaId = categorias.find(
      (c) => c.tipo === 'ingreso' && c.nombre.toLowerCase() === 'cobros',
    )?.id
    if (!categoriaId) {
      categoriaId = await repo.addCategory({
        nombre: 'Cobros',
        tipo: 'ingreso',
        color: '#059669',
        icono: '🤝',
      })
    }

    await repo.addTransaction({
      tipo: 'ingreso',
      monto: valor,
      fecha: hoyISO(),
      categoriaId,
      subcategoria: deuda.deudor ?? deuda.nombre,
      nota: deuda.concepto || undefined,
      bolsilloId: bolsilloId || undefined,
    })

    await repo.updateDebt(deuda.id, { montoPagado: (deuda.montoPagado ?? 0) + valor })

    setCobrando(false)
    onClose()
  }

  return (
    <Modal title={`Cobrar · ${deuda.deudor ?? deuda.nombre}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Pendiente: <b>{formatMoney(pend, moneda)}</b>
        </p>

        <Campo label="Monto a cobrar">
          <input
            type="number"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            autoFocus
            className={inputCls}
          />
        </Campo>

        {bolsillos.length > 1 && (
          <Campo label="¿A qué bolsillo ingresa?">
            <select
              value={bolsilloId}
              onChange={(e) => setBolsilloId(e.target.value ? Number(e.target.value) : '')}
              className={`${inputCls}`}
            >
              {bolsillos.map((b) => (
                <option key={b.id} value={b.id} className="text-black">
                  {b.icono} {b.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {esFinal && (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
            ✓ Esta deuda quedará saldada
          </div>
        )}

        <button
          onClick={cobrar}
          disabled={!valido || cobrando}
          className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white disabled:opacity-40"
        >
          {cobrando ? 'Registrando…' : esFinal ? 'Cobrar y finalizar' : 'Registrar cobro parcial'}
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
