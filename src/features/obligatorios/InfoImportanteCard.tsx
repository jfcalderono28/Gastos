import { useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import { repo } from '../../data/repository'
import { useDebts, useMoneda, useObligaciones, useSueldo, useTransactions } from '../../hooks/data'
import { mesActual } from '../../lib/dates'
import { formatMoney } from '../../lib/format'
import { montoEnMes, pendiente } from '../debts/calc'
import { estimadoMensual } from './calc'

export default function InfoImportanteCard() {
  const sueldo = useSueldo()
  const deudas = useDebts()
  const obligaciones = useObligaciones()
  const transacciones = useTransactions()
  const moneda = useMoneda()
  const [editarSueldo, setEditarSueldo] = useState(false)

  const totalDeudas = useMemo(() => deudas.reduce((s, d) => s + pendiente(d), 0), [deudas])
  const deudaMensual = useMemo(
    () => deudas.reduce((s, d) => s + montoEnMes(d, mesActual()), 0),
    [deudas],
  )
  const totalObligatorios = useMemo(
    () => obligaciones.reduce((s, o) => s + estimadoMensual(o, transacciones), 0),
    [obligaciones, transacciones],
  )
  const disponible = sueldo - totalObligatorios - deudaMensual

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
      <h2 className="mb-2 font-semibold text-slate-800 dark:text-slate-100">Información importante</h2>
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        <Fila
          label="Mi sueldo"
          valor={formatMoney(sueldo, moneda)}
          accion={
            <button onClick={() => setEditarSueldo(true)} className="text-xs font-medium text-emerald-600">
              editar
            </button>
          }
        />
        <Fila label="Total de deudas" valor={formatMoney(totalDeudas, moneda)} color="text-rose-600" />
        <Fila
          label="Gastos obligatorios (mes)"
          valor={formatMoney(totalObligatorios, moneda)}
          color="text-amber-600"
        />
        <Fila
          label="Disponible estimado/mes"
          valor={formatMoney(disponible, moneda)}
          color={disponible >= 0 ? 'text-emerald-600' : 'text-red-600'}
          fuerte
        />
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Disponible = sueldo − gastos obligatorios − cuotas de deuda de este mes.
      </p>

      {editarSueldo && <EditarSueldo sueldo={sueldo} moneda={moneda} onClose={() => setEditarSueldo(false)} />}
    </section>
  )
}

function Fila({
  label,
  valor,
  color,
  fuerte,
  accion,
}: {
  label: string
  valor: string
  color?: string
  fuerte?: boolean
  accion?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`${fuerte ? 'text-base font-bold' : 'font-semibold'} ${color ?? 'text-slate-800 dark:text-slate-100'}`}>
          {valor}
        </span>
        {accion}
      </div>
    </div>
  )
}

function EditarSueldo({ sueldo, moneda, onClose }: { sueldo: number; moneda: string; onClose: () => void }) {
  const [valor, setValor] = useState(sueldo ? String(sueldo) : '')
  async function guardar() {
    await repo.setSetting('sueldo', String(Number(valor) || 0))
    onClose()
  }
  return (
    <Modal title="Mi sueldo" onClose={onClose}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
            Sueldo mensual ({moneda})
          </span>
          <input
            type="number"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            autoFocus
            className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-lg dark:border-slate-600"
          />
        </label>
        <button onClick={guardar} className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white">
          Guardar
        </button>
      </div>
    </Modal>
  )
}
