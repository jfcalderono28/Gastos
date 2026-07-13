import { useState } from 'react'
import Modal from '../../components/Modal'
import { repo } from '../../data/repository'
import type { Bolsillo, Category, Debt } from '../../data/db'
import { hoyISO } from '../../lib/dates'
import { formatMoney } from '../../lib/format'
import { estaAtrasada, montoAtrasado, montoEnMes, pendiente } from './calc'

export default function PagarTodoMesForm({
  deudas,
  esteMes,
  categorias,
  bolsillos,
  moneda,
  onClose,
}: {
  deudas: Debt[]
  esteMes: string
  categorias: Category[]
  bolsillos: Bolsillo[]
  moneda: string
  onClose: () => void
}) {
  // Deudas con monto en este mes (incluyendo atrasadas)
  const deudasDelMes = deudas.filter(
    d => montoEnMes(d, esteMes) > 0 || estaAtrasada(d, esteMes),
  )

  const totalCalculado = deudasDelMes.reduce(
    (s, d) => s + montoEnMes(d, esteMes) + montoAtrasado(d, esteMes),
    0,
  )

  const [monto, setMonto] = useState(totalCalculado ? String(totalCalculado) : '')
  const [bolsilloId, setBolsilloId] = useState<number | ''>(bolsillos[0]?.id ?? '')
  const [pagando, setPagando] = useState(false)

  const valor = Number(monto) || 0
  const diff = valor - totalCalculado

  async function pagar() {
    if (valor <= 0 || deudasDelMes.length === 0) return
    setPagando(true)

    const fecha = hoyISO()
    const bId = bolsilloId || undefined

    // Categoría "Deudas"
    let catDeudaId = categorias.find(
      c => c.tipo === 'gasto' && c.nombre.toLowerCase() === 'deudas',
    )?.id
    if (!catDeudaId) {
      catDeudaId = await repo.addCategory({
        nombre: 'Deudas',
        tipo: 'gasto',
        color: '#e11d48',
        icono: '💳',
      })
    }

    // Registrar pago por cada deuda
    for (const d of deudasDelMes) {
      if (!d.id) continue
      const montoPagar = montoEnMes(d, esteMes) + montoAtrasado(d, esteMes)
      if (montoPagar <= 0) continue
      const montoPagarReal = Math.min(montoPagar, pendiente(d))
      await repo.addTransaction({
        tipo: 'gasto',
        monto: montoPagarReal,
        fecha,
        categoriaId: catDeudaId,
        subcategoria: d.nombre,
        bolsilloId: bId,
      })
      await repo.updateDebt(d.id, {
        montoPagado: (d.montoPagado ?? 0) + montoPagarReal,
      })
    }

    // Ajuste si el monto real difiere del calculado
    if (Math.abs(diff) > 0.01) {
      if (diff > 0) {
        // Pagó más → gasto adicional
        let catId = categorias.find(
          c => c.tipo === 'gasto' && c.nombre.toLowerCase() === 'deudas',
        )?.id ?? catDeudaId
        await repo.addTransaction({
          tipo: 'gasto',
          monto: diff,
          fecha,
          categoriaId: catId,
          subcategoria: 'Ajuste de cuota',
          bolsilloId: bId,
        })
      } else {
        // Pagó menos → ingreso (diferencia a favor)
        let catId = categorias.find(
          c => c.tipo === 'ingreso' && c.nombre.toLowerCase() === 'ajustes',
        )?.id
        if (!catId) {
          catId = await repo.addCategory({
            nombre: 'Ajustes',
            tipo: 'ingreso',
            color: '#6366f1',
            icono: '⚖️',
          })
        }
        await repo.addTransaction({
          tipo: 'ingreso',
          monto: Math.abs(diff),
          fecha,
          categoriaId: catId,
          subcategoria: 'Ajuste de cuota',
          bolsilloId: bId,
        })
      }
    }

    setPagando(false)
    onClose()
  }

  if (deudasDelMes.length === 0) {
    return (
      <Modal title="Pagar todo el mes" onClose={onClose}>
        <p className="py-6 text-center text-slate-400">
          No hay deudas con vencimiento este mes.
        </p>
      </Modal>
    )
  }

  return (
    <Modal title="Pagar todo el mes" onClose={onClose}>
      <div className="space-y-4">
        {/* Lista de deudas incluidas */}
        <ul className="space-y-1 rounded-lg bg-slate-50 p-3 dark:bg-slate-700/40">
          {deudasDelMes.map(d => {
            const m = montoEnMes(d, esteMes) + montoAtrasado(d, esteMes)
            return (
              <li key={d.id} className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300 truncate">{d.nombre}</span>
                <span className="shrink-0 font-medium text-slate-700 dark:text-slate-200 ml-2">
                  {formatMoney(m, moneda)}
                </span>
              </li>
            )
          })}
          <li className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-sm font-semibold dark:border-slate-600">
            <span>Total calculado</span>
            <span>{formatMoney(totalCalculado, moneda)}</span>
          </li>
        </ul>

        {/* Monto real a pagar */}
        <label className="block">
          <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
            Monto real a pagar
          </span>
          <input
            type="number"
            inputMode="decimal"
            value={monto}
            onChange={e => setMonto(e.target.value)}
            autoFocus
            className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-lg dark:border-slate-600"
          />
        </label>

        {/* Ajuste */}
        {valor > 0 && Math.abs(diff) > 0.01 && (
          <div className={`rounded-lg px-3 py-2 text-sm ${
            diff > 0
              ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
              : 'bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200'
          }`}>
            {diff > 0
              ? `Se registrará un gasto adicional de ${formatMoney(diff, moneda)} como "Ajuste de cuota"`
              : `Se registrará un ingreso de ${formatMoney(Math.abs(diff), moneda)} como "Ajuste de cuota"`}
          </div>
        )}

        {/* Bolsillo */}
        {bolsillos.length > 1 && (
          <label className="block">
            <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
              Bolsillo de origen
            </span>
            <select
              value={bolsilloId}
              onChange={e => setBolsilloId(e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600"
            >
              {bolsillos.map(b => (
                <option key={b.id} value={b.id} className="text-black">
                  {b.icono} {b.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          onClick={pagar}
          disabled={valor <= 0 || pagando}
          className="w-full rounded-lg bg-rose-600 py-3 font-semibold text-white disabled:opacity-40"
        >
          {pagando ? 'Registrando…' : `Registrar ${formatMoney(valor, moneda)}`}
        </button>
      </div>
    </Modal>
  )
}
