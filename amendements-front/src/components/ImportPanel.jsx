import { useRef, useState } from 'react'
import { parseAmendmentTxt } from './parseAmendmentTxt'

export default function ImportPanel({ onImport }) {
  const fileInputRef = useRef(null)
  const txtInputRef = useRef(null)
  const [error, setError] = useState(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteValue, setPasteValue] = useState('')

  function handleParsed(json, sourceLabel) {
    const list = Array.isArray(json) ? json : json.amendments
    if (!Array.isArray(list)) {
      setError('Le JSON doit être un tableau d\u2019amendements (ou un objet { "amendments": [...] }).')
      return
    }
    setError(null)
    onImport(list, sourceLabel)
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result)
        handleParsed(json, file.name)
      } catch {
        setError('Impossible de lire ce fichier : JSON invalide.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleTxtFilesChange(e) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    Promise.all(
      files.map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve({ name: file.name, text: reader.result })
            reader.onerror = () => reject(new Error(`Lecture impossible : ${file.name}`))
            reader.readAsText(file)
          })
      )
    )
      .then((results) => {
        const parsed = results.map(({ name, text }) => parseAmendmentTxt(text, name))
        setError(null)
        onImport(parsed, files.length === 1 ? files[0].name : `${files.length} fichiers .txt`)
      })
      .catch((err) => {
        setError(err.message || 'Impossible de lire un des fichiers .txt.')
      })

    e.target.value = ''
  }

  function handlePasteSubmit() {
    try {
      const json = JSON.parse(pasteValue)
      handleParsed(json, 'Collage manuel')
      setPasteValue('')
      setPasteOpen(false)
    } catch {
      setError('JSON invalide, vérifie la syntaxe.')
    }
  }

  return (
    <div className="rounded-lg border border-ink-300 bg-white p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-lg text-marine-900">Récupérer des amendements</h2>
          <p className="text-sm text-ink-500 mt-0.5">
            Importe un fichier JSON, des fichiers .txt, ou colle directement les données.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md bg-marine-800 px-4 py-2 text-sm font-medium text-white hover:bg-marine-900 transition-colors"
          >
            Importer un fichier JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => txtInputRef.current?.click()}
            className="rounded-md bg-bronze-600 px-4 py-2 text-sm font-medium text-white hover:bg-bronze-700 transition-colors"
          >
            Importer des fichiers .txt
          </button>
          <input
            ref={txtInputRef}
            type="file"
            accept=".txt,text/plain"
            multiple
            onChange={handleTxtFilesChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => setPasteOpen((v) => !v)}
            className="rounded-md border border-ink-300 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100 transition-colors"
          >
            Coller du JSON
          </button>
        </div>
      </div>

      {pasteOpen && (
        <div className="mt-4">
          <textarea
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            rows={6}
            placeholder='[{ "id": "amdt-1", "article": "22", "numero": "1", ... }]'
            className="w-full rounded-md border border-ink-300 p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-marine-600"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handlePasteSubmit}
              className="rounded-md bg-marine-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-marine-900"
            >
              Charger
            </button>
            <button
              type="button"
              onClick={() => { setPasteOpen(false); setPasteValue(''); setError(null) }}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-500 hover:bg-ink-100"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}