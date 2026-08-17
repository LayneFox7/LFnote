import { useEffect, useRef } from 'react'
import { useRichEditor, type EditorApi } from '../editor'
import { splitHtmlLines } from '../sanitize'

interface NewNoteEditorProps {
  onRegister: (api: EditorApi | null) => void
  onCreate: (html: string, type: 'task' | 'note') => Promise<void>
  onClose: () => void
  onNavAdjacent: (delta: number) => void
  mode?: 'task' | 'note'
  onModeChange?: (mode: 'task' | 'note') => void
}

export function NewNoteEditor({ onRegister, onCreate, onClose, onNavAdjacent, mode = 'task', onModeChange }: NewNoteEditorProps) {
  const { ref, getHtml, clear } = useRichEditor('', onRegister)
  const modeRef = useRef(mode)
  modeRef.current = mode
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onCreateRef = useRef(onCreate)
  onCreateRef.current = onCreate
  const getHtmlRef = useRef(getHtml)
  getHtmlRef.current = getHtml

  const commitAll = (m?: 'task' | 'note') => {
    const lines = splitHtmlLines(getHtmlRef.current())
    for (const line of lines) void onCreateRef.current(line, m ?? modeRef.current)
    return lines.length
  }

  const commitAndKeep = () => {
    commitAll()
    clear()
  }

  const commitAndClose = () => {
    commitAll()
    onCloseRef.current()
  }

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (ref.current?.contains(target)) return
      if (target.closest('.new-editor-toggle')) return
      if (getHtmlRef.current()) {
        const lines = splitHtmlLines(getHtmlRef.current())
        for (const line of lines) void onCreateRef.current(line, modeRef.current)
      }
      onCloseRef.current()
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [])

  return (
    <div className="task-editor">
      <div className="new-editor-toggle">
        <button
          className={`toggle-btn${mode === 'task' ? ' on' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onModeChange?.('task')}
        >Задача</button>
        <button
          className={`toggle-btn${mode === 'note' ? ' on' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onModeChange?.('note')}
        >Заметка</button>
      </div>
      <div
        ref={ref}
        className="task-editor-area new-note"
        data-placeholder={mode === 'task' ? 'Новая задача… (Enter — создать, Shift+Enter — новая строка)' : 'Новая заметка… (Enter — создать, Shift+Enter — новая строка)'}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (getHtmlRef.current()) commitAndKeep()
            else onCloseRef.current()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            commitAndClose()
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault()
            commitAndClose()
            onNavAdjacent(e.key === 'ArrowRight' ? 1 : -1)
          }
        }}
      />
    </div>
  )
}
