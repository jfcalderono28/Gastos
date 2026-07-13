import { useState } from 'react'

/**
 * Selector de subcategoría: lista desplegable con las subcategorías ya guardadas
 * de la categoría + opción para crear una nueva (que el formulario almacenará).
 */
export default function SubcategoriaSelect({
  subcategorias,
  value,
  onChange,
}: {
  subcategorias: string[]
  value: string
  onChange: (v: string) => void
}) {
  const enLista = subcategorias.some((s) => s.toLowerCase() === value.toLowerCase())
  const [nueva, setNueva] = useState(value !== '' && !enLista)

  if (nueva) {
    return (
      <div className="space-y-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nueva subcategoría (ej. Luz, Internet)"
          autoFocus
          className={inputCls}
        />
        {subcategorias.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setNueva(false)
              onChange('')
            }}
            className="text-xs font-medium text-emerald-600"
          >
            ‹ Elegir de la lista
          </button>
        )}
      </div>
    )
  }

  return (
    <select
      value={enLista ? value : ''}
      onChange={(e) => {
        const v = e.target.value
        if (v === '__nueva__') {
          setNueva(true)
          onChange('')
        } else {
          onChange(v)
        }
      }}
      className={`${inputCls}`}
    >
      <option value="" className="text-black">
        (ninguna)
      </option>
      {subcategorias.map((s) => (
        <option key={s} value={s} className="text-black">
          {s}
        </option>
      ))}
      <option value="__nueva__" className="text-black">
        ➕ Nueva subcategoría…
      </option>
    </select>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600'
