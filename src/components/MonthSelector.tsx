import { useState } from 'react'
import Modal from './Modal'
import { nombreMes, sumarMeses } from '../lib/dates'

const MESES_CORTOS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

export default function MonthSelector({
  mes,
  setMes,
}: {
  mes: string
  setMes: (m: string) => void
}) {
  const [picker, setPicker] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between rounded-xl bg-white px-2 py-1 shadow-sm dark:bg-slate-800">
        <button
          onClick={() => setMes(sumarMeses(mes, -1))}
          className="px-4 py-1 text-2xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          aria-label="Mes anterior"
        >
          ‹
        </button>
        <button
          onClick={() => setPicker(true)}
          className="rounded-lg px-3 py-1 font-medium text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700"
        >
          {nombreMes(mes)}
        </button>
        <button
          onClick={() => setMes(sumarMeses(mes, 1))}
          className="px-4 py-1 text-2xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          aria-label="Mes siguiente"
        >
          ›
        </button>
      </div>

      {picker && (
        <MonthPicker
          mes={mes}
          onSelect={(m) => {
            setMes(m)
            setPicker(false)
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </>
  )
}

function MonthPicker({
  mes,
  onSelect,
  onClose,
}: {
  mes: string
  onSelect: (m: string) => void
  onClose: () => void
}) {
  const [anioSel, mesSel] = mes.split('-').map(Number)
  const [anio, setAnio] = useState(anioSel)

  return (
    <Modal title="Ir a mes" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setAnio((a) => a - 1)}
            className="px-4 py-1 text-2xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label="Año anterior"
          >
            ‹
          </button>
          <span className="text-lg font-semibold text-slate-800 dark:text-slate-100">{anio}</span>
          <button
            onClick={() => setAnio((a) => a + 1)}
            className="px-4 py-1 text-2xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label="Año siguiente"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {MESES_CORTOS.map((nombre, i) => {
            const m = `${anio}-${String(i + 1).padStart(2, '0')}`
            const activo = anio === anioSel && i + 1 === mesSel
            return (
              <button
                key={nombre}
                onClick={() => onSelect(m)}
                className={`rounded-lg py-3 font-medium ${
                  activo
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {nombre}
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
