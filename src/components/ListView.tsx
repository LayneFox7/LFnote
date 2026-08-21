import { useState } from 'react'
import type { CardStyle, Folder, Task } from '../types'
import { formatDayHeader, toISODate } from '../date'
import type { EditorApi } from '../editor'
import { ArrowsLayer } from '../arrows'
import { TaskEditor } from './TaskEditor'
import { TaskRow } from './TaskRow'

interface ListViewProps {
  openByIso: Record<string, Task[]>
  doneByIso: Record<string, Task[]>
  editingId: string | null
  linkedSet: Set<string>
  edgeSet: Set<string>
  onCardPointerDown: (e: React.PointerEvent, task: Task) => void
  onAdd: (text: string, date: Date) => Promise<void>
  onToggle: (task: Task) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCheckToggle: (task: Task, index: number, checked: boolean) => Promise<void>
  onUpdateStyle: (id: string, style: CardStyle | null) => Promise<void>
  allTags: string[]
  onUpdateTags: (id: string, tags: string[]) => void
  folders?: Folder[]
  onAssignFolder?: (id: string, folderId: number | null) => void
  onStartEdit: (task: Task) => void
  onCancelEdit: () => void
  onEditorSave: (task: Task, html: string, openNew: boolean) => void
  onRegisterEditor: (api: EditorApi | null) => void
  containerRef?: (el: HTMLDivElement | null) => void
}

export function ListView({
  openByIso,
  doneByIso,
  editingId,
  linkedSet,
  edgeSet,
  onCardPointerDown,
  onAdd,
  onToggle,
  onDelete,
  onCheckToggle,
  onUpdateStyle,
  allTags,
  onUpdateTags,
  folders,
  onAssignFolder,
  onStartEdit,
  onCancelEdit,
  onEditorSave,
  onRegisterEditor,
  containerRef,
}: ListViewProps) {
  const [text, setText] = useState('')
  const [dateIso, setDateIso] = useState(() => toISODate(new Date()))

  const openGroups = Object.keys(openByIso).sort()
  const doneGroups = Object.keys(doneByIso).sort().reverse()

  const commit = () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return
    const date = new Date(`${dateIso}T12:00:00`)
    for (const line of lines) void onAdd(line, date)
    setText('')
  }

  const renderTask = (task: Task) =>
    editingId === task.id ? (
      <TaskEditor
        key={task.id}
        initialHtml={task.text}
        onRegister={onRegisterEditor}
        onSave={(html, openNew) => onEditorSave(task, html, openNew)}
        onCancel={onCancelEdit}
      />
    ) : (
      <TaskRow
        key={task.id}
        task={task}
        linked={linkedSet.has(task.id)}
        edge={edgeSet.has(task.id)}
        onStartEdit={onStartEdit}
        onToggle={onToggle}
        onDelete={onDelete}
        onCheckToggle={onCheckToggle}
        onUpdateStyle={onUpdateStyle}
        onPointerDown={onCardPointerDown}
        allTags={allTags}
        onUpdateTags={onUpdateTags}
        folders={folders}
        onAssignFolder={onAssignFolder}
      />
    )

  return (
    <div className="running-list" ref={containerRef}>
      <div className="rl-section">
        <div className="rl-section-head">Открытые</div>
        {openGroups.length === 0 ? (
          <div className="rl-empty">Нет открытых задач</div>
        ) : (
          openGroups.map((iso) => (
            <div className="rl-day" key={iso}>
              <div className="rl-day-head">{formatDayHeader(new Date(`${iso}T12:00:00`))}</div>
              {openByIso[iso].map(renderTask)}
            </div>
          ))
        )}
      </div>

      <div className="rl-quickadd">
        <textarea
          className="rl-input"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() } }}
          placeholder="Новая задача… (Enter — добавить, Shift+Enter — новая строка)"
        />
        <input type="date" className="rl-date" value={dateIso} onChange={(e) => setDateIso(e.target.value || toISODate(new Date()))} title="Дата задачи" />
        <button className="rl-add-btn" onClick={commit} title="Добавить">+</button>
      </div>

      <div className="rl-section">
        <div className="rl-section-head">Выполненные</div>
        {doneGroups.length === 0 ? (
          <div className="rl-empty">Пока нет выполненных задач</div>
        ) : (
          doneGroups.map((iso) => (
            <div className="rl-day" key={iso}>
              <div className="rl-day-head">{formatDayHeader(new Date(`${iso}T12:00:00`))}</div>
              {doneByIso[iso].map(renderTask)}
            </div>
          ))
        )}
      </div>

      <ArrowsLayer />
    </div>
  )
}
