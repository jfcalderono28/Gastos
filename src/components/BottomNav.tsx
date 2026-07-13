export type Tab = 'movimientos' | 'deudas' | 'presupuestos' | 'reportes' | 'ajustes'

const items: { id: Tab; label: string; icon: string }[] = [
  { id: 'movimientos', label: 'Movim.', icon: '📒' },
  { id: 'deudas', label: 'Deudas', icon: '💳' },
  { id: 'presupuestos', label: 'Presup.', icon: '🎯' },
  { id: 'reportes', label: 'Reportes', icon: '📊' },
  { id: 'ajustes', label: 'Ajustes', icon: '⚙️' },
]

export default function BottomNav({
  tab,
  setTab,
}: {
  tab: Tab
  setTab: (t: Tab) => void
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <div className="mx-auto flex max-w-2xl">
        {items.map((it) => {
          const activo = tab === it.id
          return (
            <button
              key={it.id}
              onClick={() => setTab(it.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-xs ${
                activo ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
              }`}
            >
              <span className="text-xl">{it.icon}</span>
              {it.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
