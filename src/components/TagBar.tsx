import { useEffect, useRef, useState } from 'react'

interface TagBarProps {
  tags: string[]
  activeTags: string[]
  onToggleFilter: (tag: string) => void
  onAdd: (name: string) => void
  onRename: (oldName: string, name: string) => void
  onDelete: (name: string) => void
}

export function TagBar({ tags, activeTags, onToggleFilter, onAdd, onRename, onDelete }: TagBarProps) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const value = newName.trim()
    if (!value) return
    onAdd(value)
    setNewName('')
  }

  const submitRename = (e: React.FormEvent) => {
    e.preventDefault()
    const value = draft.trim()
    if (editing && value) onRename(editing, value)
    setEditing(null)
  }

  return (
    <div className="tagbar">
      <span className="tagbar-label">Фильтр:</span>
      <div className="tagbar-chips">
        {tags.length === 0 ? (
          <span className="tagbar-empty">тегов пока нет</span>
        ) : (
          tags.map((tag) => (
            <button
              key={tag}
              className={`tag-chip${activeTags.includes(tag) ? ' on' : ''}`}
              onClick={() => onToggleFilter(tag)}
              title={activeTags.includes(tag) ? 'Убрать из фильтра' : 'Фильтровать по тегу'}
            >
              {tag}
            </button>
          ))
        )}
      </div>
      <button
        className="toolbar-btn"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        title="Управление тегами"
      >
        ＋ Тег
      </button>
      {open && (
        <div className="tag-manage-pop" onMouseDown={(e) => e.stopPropagation()}>
          <div className="menu-label">Теги</div>
          <form className="tag-add-row" onSubmit={submitAdd}>
            <input
              className="tag-add-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Название тега…"
              maxLength={40}
            />
            <button type="submit" className="arrow-menu-btn">
              Создать
            </button>
          </form>
          {tags.length === 0 ? (
            <div className="tagbar-empty">тегов пока нет</div>
          ) : (
            <div className="tag-manage-list">
              {tags.map((tag) =>
                editing === tag ? (
                  <form key={tag} className="tag-manage-row" onSubmit={submitRename}>
                    <input
                      ref={inputRef}
                      className="tag-add-input"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      maxLength={40}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditing(null)
                      }}
                    />
                    <button type="submit" className="arrow-menu-btn">
                      ✓
                    </button>
                  </form>
                ) : (
                  <div key={tag} className="tag-manage-row">
                    <span className="tag-chip" onClick={() => onToggleFilter(tag)} title="Фильтровать">
                      {tag}
                    </span>
                    <button
                      className="arrow-menu-btn tag-manage-edit"
                      onClick={() => {
                        setEditing(tag)
                        setDraft(tag)
                      }}
                      title="Переименовать"
                    >
                      ✎
                    </button>
                    <button
                      className="arrow-menu-btn danger tag-manage-del"
                      onClick={() => onDelete(tag)}
                      title="Удалить тег"
                    >
                      ×
                    </button>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
