import { useEffect, useRef, useState } from 'react'
import type { Folder } from '../types'

interface FolderBarProps {
  folders: Folder[]
  selected: number | null
  onSelect: (id: number | null) => void
  onCreate: (name: string) => Promise<void>
  onRename: (id: number, name: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

export function FolderBar({ folders, selected, onSelect, onCreate, onRename, onDelete }: FolderBarProps) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
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
    void onCreate(value)
    setNewName('')
  }

  const submitRename = (e: React.FormEvent) => {
    e.preventDefault()
    const value = draft.trim()
    if (editing && value) void onRename(editing, value)
    setEditing(null)
  }

  return (
    <div className="folderbar">
      <span className="tagbar-label">Папки:</span>
      <div className="tagbar-chips">
        <button
          className={`tag-chip${selected === null ? ' on' : ''}`}
          onClick={() => onSelect(null)}
          title="Показать все заметки"
        >
          Все
        </button>
        {folders.length === 0 ? (
          <span className="tagbar-empty">папок пока нет</span>
        ) : (
          folders.map((f) => (
            <button
              key={f.id}
              className={`tag-chip${selected === f.id ? ' on' : ''}`}
              onClick={() => onSelect(f.id)}
              title={`Показать только папку «${f.name}»`}
            >
              {f.name}
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
        title="Управление папками (до 10)"
      >
        ＋ Папка
      </button>
      {open && (
        <div className="tag-manage-pop" onMouseDown={(e) => e.stopPropagation()}>
          <div className="menu-label">Папки ({folders.length}/10)</div>
          <form className="tag-add-row" onSubmit={submitAdd}>
            <input
              className="tag-add-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Название папки…"
              maxLength={40}
            />
            <button type="submit" className="arrow-menu-btn">
              Создать
            </button>
          </form>
          {folders.length === 0 ? (
            <div className="tagbar-empty">папок пока нет</div>
          ) : (
            <div className="tag-manage-list">
              {folders.map((f) =>
                editing === f.id ? (
                  <form key={f.id} className="tag-manage-row" onSubmit={submitRename}>
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
                  <div key={f.id} className="tag-manage-row">
                    <span
                      className="tag-chip"
                      onClick={() => onSelect(f.id)}
                      title="Показать папку"
                    >
                      {f.name}
                    </span>
                    <button
                      className="arrow-menu-btn tag-manage-edit"
                      onClick={() => {
                        setEditing(f.id)
                        setDraft(f.name)
                      }}
                      title="Переименовать"
                    >
                      ✎
                    </button>
                    <button
                      className="arrow-menu-btn danger tag-manage-del"
                      onClick={() => onDelete(f.id)}
                      title="Удалить папку (заметки останутся)"
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
