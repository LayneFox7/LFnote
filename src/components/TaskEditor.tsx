import { useRef } from 'react'
import { useRichEditor, type EditorApi } from '../editor'

interface TaskEditorProps {
  initialHtml: string
  onRegister: (api: EditorApi | null) => void
  onSave: (html: string, openNew: boolean) => void
  onCancel: () => void
}

export function TaskEditor({ initialHtml, onRegister, onSave, onCancel }: TaskEditorProps) {
  const savedRef = useRef(false)
  const { ref, getHtml } = useRichEditor(initialHtml, onRegister)

  const save = (openNew: boolean) => {
    if (savedRef.current) return
    savedRef.current = true
    onSave(getHtml(), openNew)
  }

  return (
    <div className="task-editor">
      <div
        ref={ref}
        className="task-editor-area"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            save(true)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            savedRef.current = true
            onCancel()
          }
        }}
        onBlur={() => save(false)}
      />
    </div>
  )
}
