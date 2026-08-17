import { useEffect, useRef, useState } from 'react'
import type { CardStyle, Folder, Task } from '../types'
import { toISODate, DAYS_SHORT_RU, MONTHS_RU } from '../date'
import { TaskEditor } from './TaskEditor'
import { NewNoteEditor } from './NewNoteEditor'
import { TaskRow } from './TaskRow'
import { ARROW_COLORS } from '../arrows'
import type { EditorApi } from '../editor'

interface DayColumnProps {
  dayIndex: number
  date: Date
  tasks: Task[]
  doneTasks: Task[]
  spanNotes?: Task[]
  isToday: boolean
  isPast: boolean
  isWeekend: boolean
  isDimmed: boolean
  color: string | null
  dayWidth: number
  selected: boolean
  selectedTaskId: string | null
  newRequest: { dayIndex: number; ts: number } | null
  editingId: string | null
  linkedSet: Set<string>
  edgeSet: Set<string>
  selectedSet: Set<string>
  isDragTarget: boolean
  onToggleSelect: (id: string) => void
  onCardPointerDown: (e: React.PointerEvent, task: Task) => void
  onAdd: (text: string, date: Date, type?: 'task' | 'note') => Promise<void>
  onToggle: (task: Task) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCheckToggle: (task: Task, index: number, checked: boolean) => Promise<void>
  onUpdateStyle: (id: string, style: CardStyle | null) => Promise<void>
  onDropTask: (taskId: string, targetIso: string, index: number) => Promise<void>
  allTags: string[]
  onUpdateTags: (id: string, tags: string[]) => void
  folders?: Folder[]
  onAssignFolder?: (id: string, folderId: number | null) => void
  onFocusDay: (dayIndex: number, taskId: string | null) => void
  onStartEdit: (task: Task) => void
  onCancelEdit: () => void
  onEditorSave: (task: Task, html: string, openNew: boolean) => void
  onRegisterEditor: (api: EditorApi | null) => void
  onNavigateDay: (dayIndex: number, delta: number) => void
  onResize: (width: number) => void
  onPickColor: (color: string | null) => Promise<void>
}

const SORT = (a: Task, b: Task) => a.order - b.order

export function DayColumn({
  dayIndex,
  date,
  tasks,
  doneTasks,
  spanNotes = [],
  isToday,
  isPast,
  isWeekend,
  isDimmed,
  color,
  dayWidth,
  selected,
  selectedTaskId,
  newRequest,
  editingId,
  linkedSet,
  edgeSet,
  selectedSet,
  isDragTarget,
  onToggleSelect,
  onCardPointerDown,
  onAdd,
  onToggle,
  onDelete,
  onCheckToggle,
  onUpdateStyle,
  onDropTask,
  allTags,
  onUpdateTags,
  folders,
  onAssignFolder,
  onFocusDay,
  onStartEdit,
  onCancelEdit,
  onEditorSave,
  onRegisterEditor,
  onNavigateDay,
  onResize,
  onPickColor,
}: DayColumnProps) {
  const [editing, setEditing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'task' | 'note'>('task')
  const bodyRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null)

  const iso = toISODate(date)
  const sorted = [...tasks].sort(SORT)
  const openTasks = sorted.filter((t) => t.type !== 'note')
  const openNotes = sorted.filter((t) => t.type === 'note')
  const doneSorted = [...doneTasks].sort(SORT)

  useEffect(() => {
    if (newRequest && newRequest.dayIndex === dayIndex) setEditing(true)
  }, [newRequest, dayIndex])

  useEffect(() => {
    if (!colorOpen) return
    const close = () => setColorOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [colorOpen])

  const startEditing = () => {
    setEditing(true)
    onFocusDay(dayIndex, null)
  }

  const handleStartEdit = (task: Task) => {
    setEditing(false)
    onStartEdit(task)
  }

  const onDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    if (!bodyRef.current?.contains(e.relatedTarget as Node)) setDragOver(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const taskId = e.dataTransfer.getData('text/plain')
    if (!taskId || !bodyRef.current) return
    const rows = Array.from(bodyRef.current.querySelectorAll<HTMLElement>('.task:not(.done)'))
    let index = rows.length
    const y = e.clientY
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect()
      if (y < r.top + r.height / 2) {
        index = i
        break
      }
    }
    void onDropTask(taskId, iso, index)
  }

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startW = bodyRef.current ? bodyRef.current.parentElement!.getBoundingClientRect().width : 190
    resizeRef.current = { startX: e.clientX, startW }
    const onMove = (ev: MouseEvent) => {
      const r = resizeRef.current
      if (r) onResize(r.startW + (ev.clientX - r.startX))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizeRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
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
        selected={selectedSet.has(task.id) || (selected && selectedTaskId === task.id)}
        linked={linkedSet.has(task.id)}
        edge={edgeSet.has(task.id)}
        onStartEdit={handleStartEdit}
        onToggle={onToggle}
        onDelete={onDelete}
        onCheckToggle={onCheckToggle}
        onUpdateStyle={onUpdateStyle}
        onDragStart={onDragStart}
        onPointerDown={onCardPointerDown}
        onToggleSelect={onToggleSelect}
        allTags={allTags}
        onUpdateTags={onUpdateTags}
        folders={folders}
        onAssignFolder={onAssignFolder}
      />
    )

  return (
    <div
      className={`day${isToday ? ' today' : ''}${isPast ? ' past' : ''}${isWeekend ? ' weekend' : ''}${isDimmed ? ' dimmed' : ''}${selected ? ' selected' : ''}${color ? ' colored' : ''}${isDragTarget ? ' drag-target' : ''}`}
      data-date={iso}
      style={{ minWidth: dayWidth, ...((color ? { ['--col-color' as string]: color } : {}) as React.CSSProperties) }}
    >
      <div className="day-head">
        <button className="day-header" onClick={startEditing} aria-label="Добавить задачу">
          <span className="day-num">{date.getDate()}</span>
        </button>
        <div className="day-head-info">
          <span className="day-weekday">{DAYS_SHORT_RU[(date.getDay() + 6) % 7]}</span>
          <span className="day-month">{MONTHS_RU[date.getMonth()].toLowerCase()}</span>
        </div>
        <button
          className="day-color-btn"
          onClick={(e) => {
            e.stopPropagation()
            setColorOpen((o) => !o)
          }}
          aria-label="Цвет колонки"
          title="Цвет колонки"
          style={color ? { background: color, borderColor: color } : undefined}
        />
        {colorOpen && (
          <div className="day-color-pop" onMouseDown={(e) => e.stopPropagation()}>
            <div className="menu-label">Цвет колонки</div>
            <div className="menu-row">
              {ARROW_COLORS.map((c) => (
                <button
                  key={c}
                  className={`menu-color${color === c ? ' on' : ''}`}
                  style={{ background: c }}
                  onClick={() => void onPickColor(c)}
                  aria-label={`Цвет ${c}`}
                />
              ))}
            </div>
            <button className="arrow-menu-btn" onClick={() => void onPickColor(null)}>
              Сбросить
            </button>
          </div>
        )}
      </div>

      <div
        ref={bodyRef}
        className={`day-body${dragOver ? ' drag-over' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {openTasks.map(renderTask)}

        {editing ? (
          <NewNoteEditor
            onRegister={onRegisterEditor}
            onCreate={(html, type) => onAdd(html, date, type)}
            onClose={() => setEditing(false)}
            onNavAdjacent={(delta) => onNavigateDay(dayIndex, delta)}
            mode={editorMode}
            onModeChange={setEditorMode}
          />
        ) : (
          <button className="task-add" onClick={startEditing}>
            + Новая задача
          </button>
        )}

        {doneSorted.length > 0 && (
          <>
            <div className="done-sep" />
            {doneSorted.map(renderTask)}
          </>
        )}

        {(openNotes.length > 0 || spanNotes.length > 0) && (
          <div className="span-notes">
            {openNotes.map((note) => (
              <div key={note.id} className="note-span solo" title={note.text}>
                <span className="note-span-label">📝 {note.text}</span>
              </div>
            ))}
            {spanNotes.map((note) => {
              const isStart = note.startDate === iso
              const isEnd = note.endDate === iso
              const cls = isStart && isEnd ? 'solo' : isStart ? 'first' : isEnd ? 'last' : 'middle'
              return (
                <div key={note.id} className={`note-span ${cls}`} title={isStart ? note.text : undefined}>
                  {isStart && <span className="note-span-label">📝 {note.text}</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="col-resizer" onMouseDown={startResize} title="Изменить ширину" />
    </div>
  )
}
