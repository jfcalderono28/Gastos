import { useState } from 'react'
import Papa from 'papaparse'
import { repo } from '../../data/repository'
import type { TipoMovimiento, Transaction } from '../../data/db'
import { useCategories } from '../../hooks/data'
import { parseFecha, parseMonto, repararTexto } from '../../lib/csv'

type Fila = Record<string, string>
type TipoModo = 'columna' | 'signo' | 'todoGasto' | 'todoIngreso'

export default function ImportPage({ onVolver }: { onVolver: () => void }) {
  const categorias = useCategories()
  const [filas, setFilas] = useState<Fila[]>([])
  const [columnas, setColumnas] = useState<string[]>([])
  const [mapa, setMapa] = useState({ fecha: '', monto: '', tipo: '', categoria: '', subcategoria: '', id: '' })
  const [tipoModo, setTipoModo] = useState<TipoModo>('signo')
  const [resultado, setResultado] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)

  function elegirArchivo(file: File) {
    setResultado(null)
    Papa.parse<Fila>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const cols = res.meta.fields ?? []
        setColumnas(cols)
        setFilas(res.data)

        // Adivina el mapeo por nombre de columna
        const has = (c: string, ...ks: string[]) => ks.some((k) => c.toLowerCase().includes(k))
        const find = (pred: (c: string) => boolean) => cols.find(pred) ?? ''

        const fecha =
          find((c) => has(c, 'fecha', 'date') && !has(c, 'creation', 'creaci')) ||
          find((c) => has(c, 'fecha', 'date'))
        const monto = find((c) => has(c, 'monto', 'valor', 'amount', 'importe'))
        const tipo = find((c) => has(c, 'expense', 'income', 'tipo', 'ingreso', 'gasto'))
        const categoria =
          find((c) => has(c, 'categor', 'category') && has(c, 'name', 'nombre') && !has(c, 'sub')) ||
          find((c) => has(c, 'categor', 'category') && !has(c, 'id', 'sub')) ||
          find((c) => has(c, 'categor', 'category') && !has(c, 'sub'))
        const subcategoria =
          find((c) => has(c, 'subcategor', 'subcategory') && has(c, 'name', 'nombre')) ||
          find((c) => has(c, 'subcategor', 'subcategory') && !has(c, 'id'))
        const id =
          find((c) => has(c, 'transaction') && has(c, 'id')) ||
          find((c) => c.toLowerCase().trim() === 'id')

        setMapa({ fecha, monto, tipo, categoria, subcategoria, id })
        if (tipo) setTipoModo('columna')
      },
    })
  }

  async function importar() {
    if (!mapa.fecha || !mapa.monto) return
    setImportando(true)

    // Índice de categorías existentes por nombre+tipo (en minúsculas)
    const catIndex = new Map<string, number>()
    categorias.forEach((c) => c.id && catIndex.set(`${c.tipo}|${c.nombre.toLowerCase()}`, c.id))

    // Subcategorías existentes por categoría (para no perder las ya guardadas)
    const subsPorCat = new Map<number, Set<string>>()
    categorias.forEach((c) => {
      if (c.id && c.subcategorias?.length) subsPorCat.set(c.id, new Set(c.subcategorias))
    })

    // IDs ya importados (de la BD) + los que vayamos viendo en este archivo
    const extIdsExistentes = mapa.id ? await repo.getExtIds() : new Set<string>()

    const paleta = ['#f97316', '#3b82f6', '#8b5cf6', '#eab308', '#ec4899', '#14b8a6', '#64748b']
    const nuevas: Omit<Transaction, 'id'>[] = []
    let descartadas = 0
    let duplicados = 0

    for (const fila of filas) {
      const fecha = parseFecha(fila[mapa.fecha])
      const m = parseMonto(fila[mapa.monto])
      if (!fecha || !m) {
        descartadas++
        continue
      }

      // Saltar si ya fue importado antes (mismo id de origen)
      const extId = mapa.id ? (fila[mapa.id] ?? '').trim() : ''
      if (extId && extIdsExistentes.has(extId)) {
        duplicados++
        continue
      }
      if (extId) extIdsExistentes.add(extId)

      // Determinar tipo
      let tipo: TipoMovimiento
      if (tipoModo === 'columna' && mapa.tipo) {
        const v = (fila[mapa.tipo] ?? '').toLowerCase().trim()
        const esGasto =
          /gasto|expense|salida|egreso|retiro|debit/.test(v) ||
          v === '-1' ||
          v.startsWith('-') ||
          Number(v) < 0
        const esIngreso =
          /ingreso|income|entrada|deposit|abono|credit/.test(v) ||
          v === '1' ||
          v === '+' ||
          Number(v) > 0
        tipo = esGasto ? 'gasto' : esIngreso ? 'ingreso' : 'gasto'
      } else if (tipoModo === 'signo') {
        tipo = m.negativo ? 'gasto' : 'ingreso'
      } else {
        tipo = tipoModo === 'todoIngreso' ? 'ingreso' : 'gasto'
      }

      // Resolver categoría (crear si no existe)
      const nombreCat = repararTexto((mapa.categoria ? fila[mapa.categoria] : '')?.trim()) || 'Importado'
      const clave = `${tipo}|${nombreCat.toLowerCase()}`
      let categoriaId = catIndex.get(clave)
      if (!categoriaId) {
        categoriaId = await repo.addCategory({
          nombre: nombreCat,
          tipo,
          color: paleta[catIndex.size % paleta.length],
          icono: tipo === 'ingreso' ? '💰' : '🏷️',
        })
        catIndex.set(clave, categoriaId)
      }

      // Resolver subcategoría (opcional)
      const sub = repararTexto((mapa.subcategoria ? fila[mapa.subcategoria] : '')?.trim()) || undefined
      if (sub) {
        if (!subsPorCat.has(categoriaId)) subsPorCat.set(categoriaId, new Set())
        subsPorCat.get(categoriaId)!.add(sub)
      }

      nuevas.push({ tipo, monto: m.valor, fecha, categoriaId, subcategoria: sub, extId: extId || undefined })
    }

    if (nuevas.length) await repo.bulkAddTransactions(nuevas)

    // Guardar las subcategorías acumuladas en cada categoría
    for (const [catId, set] of subsPorCat) {
      await repo.updateCategory(catId, { subcategorias: [...set] })
    }

    setImportando(false)
    setResultado(
      `Importados ${nuevas.length} movimientos.` +
        (duplicados ? ` ${duplicados} ya estaban (omitidos).` : '') +
        (descartadas ? ` ${descartadas} filas descartadas (fecha o monto inválidos).` : ''),
    )
    setFilas([])
    setColumnas([])
  }

  return (
    <div className="space-y-4">
      <button onClick={onVolver} className="text-sm text-emerald-600">
        ‹ Volver a Ajustes
      </button>
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Importar CSV</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Sube el archivo que exportaste de tu app anterior (formato .csv). Luego indica qué columna
        es cada cosa.
      </p>

      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center text-slate-500 dark:border-slate-600 dark:bg-slate-800">
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && elegirArchivo(e.target.files[0])}
        />
        📄 Toca para elegir un archivo CSV
      </label>

      {resultado && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          ✅ {resultado}
        </div>
      )}

      {columnas.length > 0 && (
        <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm dark:bg-slate-800">
          <p className="text-sm text-slate-500">
            Detectadas <b>{filas.length}</b> filas. Asigna las columnas:
          </p>

          <Mapeo label="Fecha *" valor={mapa.fecha} columnas={columnas} onChange={(v) => setMapa({ ...mapa, fecha: v })} />
          <Mapeo label="Monto *" valor={mapa.monto} columnas={columnas} onChange={(v) => setMapa({ ...mapa, monto: v })} />
          <Mapeo label="Categoría" valor={mapa.categoria} columnas={columnas} onChange={(v) => setMapa({ ...mapa, categoria: v })} opcional />
          <Mapeo label="Subcategoría" valor={mapa.subcategoria} columnas={columnas} onChange={(v) => setMapa({ ...mapa, subcategoria: v })} opcional />
          <Mapeo label="ID único (evita duplicados)" valor={mapa.id} columnas={columnas} onChange={(v) => setMapa({ ...mapa, id: v })} opcional />

          <label className="block">
            <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
              ¿Cómo distinguir ingreso/gasto?
            </span>
            <select
              value={tipoModo}
              onChange={(e) => setTipoModo(e.target.value as TipoModo)}
              className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600"
            >
              <option value="signo">Por el signo del monto (negativo = gasto)</option>
              <option value="columna">Por una columna de tipo</option>
              <option value="todoGasto">Todo son gastos</option>
              <option value="todoIngreso">Todo son ingresos</option>
            </select>
          </label>

          {tipoModo === 'columna' && (
            <Mapeo label="Columna de tipo" valor={mapa.tipo} columnas={columnas} onChange={(v) => setMapa({ ...mapa, tipo: v })} />
          )}

          <button
            onClick={importar}
            disabled={!mapa.fecha || !mapa.monto || importando}
            className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white disabled:opacity-40"
          >
            {importando ? 'Importando…' : 'Importar movimientos'}
          </button>
        </div>
      )}
    </div>
  )
}

function Mapeo({
  label,
  valor,
  columnas,
  onChange,
  opcional,
}: {
  label: string
  valor: string
  columnas: string[]
  onChange: (v: string) => void
  opcional?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600"
      >
        <option value="">{opcional ? '(ninguna)' : 'Selecciona…'}</option>
        {columnas.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  )
}
