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

  const commitAll = () => {
    const lines = splitHtmlLines(getHtml())
    for (const line of lines) void onCreate(line, mode)
    return lines.length
  }

  const commitAndKeep = () => {
    commitAll()
    clear()
  }

  const commitAndClose = () => {
    commitAll()
    onClose()
  }

  return (
    <div className="task-editor">
      <div className="new-editor-toggle">
        <button className={`toggle-btn${mode === 'task' ? ' on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => onModeChange?.('task')}>Задача</button>
        <button className={`toggle-btn${mode === 'note' ? ' on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => onModeChange?.('note')}>Заметка</button>
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
            if (getHtml()) commitAndKeep()
            else onClose()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault()
            commitAndClose()
            onNavAdjacent(e.key === 'ArrowRight' ? 1 : -1)
          }
        }}
        onBlur={commitAndClose}
      />
    </div>
  )
}
