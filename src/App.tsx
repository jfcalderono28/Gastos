import { useEffect, useMemo, useState } from 'react'
import BottomNav, { type Tab } from './components/BottomNav'
import FlashBar from './components/FlashBar'
import TransactionsPage from './features/transactions/TransactionsPage'
import DebtsPage from './features/debts/DebtsPage'
import BudgetsPage from './features/budgets/BudgetsPage'
import ReportsPage from './features/reports/ReportsPage'
import SettingsPage from './features/settings/SettingsPage'
import ComprasPage from './features/compras/ComprasPage'
import SimuladorPage from './features/simulador/SimuladorPage'
import { migrarBolsillos, seedSiPrimeraVez } from './data/seed'
import { mesActual } from './lib/dates'
import { useCategories, useComprasActivo, useSimuladorActivo, useTransactions } from './hooks/data'
import { useNotificationProcessor } from './hooks/useNotificationProcessor'

export default function App() {
  useNotificationProcessor()
  const [tab, setTab] = useState<Tab>('movimientos')
  const [mes, setMes] = useState(mesActual())
  const comprasActivo = useComprasActivo()
  const simuladorActivo = useSimuladorActivo()

  useEffect(() => {
    seedSiPrimeraVez().then(() => migrarBolsillos())
  }, [])

  return (
    <div className="min-h-svh text-slate-900 dark:text-slate-100">
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-4">
        <FlashBar />
        <BannerSaldoInicial />
        {tab === 'movimientos' && <TransactionsPage mes={mes} setMes={setMes} />}
        {tab === 'deudas' && <DebtsPage />}
        {tab === 'presupuestos' && !simuladorActivo && <BudgetsPage mes={mes} setMes={setMes} />}
        {tab === 'presupuestos' && simuladorActivo && <SimuladorPage />}
        {tab === 'reportes' && <ReportsPage mes={mes} setMes={setMes} />}
        {tab === 'ajustes' && <SettingsPage />}
        {tab === 'compras' && <ComprasPage />}
      </main>
      <BottomNav tab={tab} setTab={setTab} comprasActivo={comprasActivo} simuladorActivo={simuladorActivo} />
    </div>
  )
}

function BannerSaldoInicial() {
  const transacciones = useTransactions()
  const categorias = useCategories()
  const [cerrado, setCerrado] = useState(() => localStorage.getItem('avisoSaldoInicial') === '1')

  const necesitaAviso = useMemo(() => {
    if (transacciones.length === 0) return false
    const catId = categorias.find(
      c => c.tipo === 'ingreso' && c.nombre.toLowerCase() === 'saldo inicial',
    )?.id
    if (!catId) return true
    return !transacciones.some(t => t.categoriaId === catId)
  }, [transacciones, categorias])

  if (cerrado || !necesitaAviso) return null

  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      <span className="shrink-0">⚠️</span>
      <p className="flex-1">
        <b>Sin saldo inicial registrado.</b> Tu balance puede no reflejar la realidad.
        Ve a <b>Ajustes → Ajustar saldo</b> para calibrarlo.
      </p>
      <button
        onClick={() => { localStorage.setItem('avisoSaldoInicial', '1'); setCerrado(true) }}
        className="shrink-0 font-bold text-amber-600 dark:text-amber-400"
      >✕</button>
    </div>
  )
}
