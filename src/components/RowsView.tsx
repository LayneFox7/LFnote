import { useEffect, useState, type CSSProperties } from 'react'
import type { CardStyle, Folder, Task } from '../types'
import { DAYS_FULL_RU, MONTHS_RU, isToday, toISODate } from '../date'
import type { EditorApi } from '../editor'
import { NewNoteEditor } from './NewNoteEditor'
import { TaskEditor } from './TaskEditor'
import { TaskRow } from './TaskRow'

interface MarqueeRect {
  x: number
  y: number
  w: number
  h: number
}

interface RowsViewProps {
  days: Date[]
  openByIso: Record<string, Task[]>
  doneByIso: Record<string, Task[]>
  colors: Record<string, string>
  marquee?: MarqueeRect | null
  newRequest: { dayIndex: number; ts: number } | null
  editingId: string | null
  linkedSet: Set<string>
  edgeSet: Set<string>
  selectedSet: Set<string>
  onToggleSelect: (id: string) => void
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
  onNavigateDay: (dayIndex: number, delta: number) => void
  containerRef?: (el: HTMLDivElement | null) => void
}

export function RowsView({
  days,
  openByIso,
  doneByIso,
  colors,
  marquee,
  newRequest,
  editingId,
  linkedSet,
  edgeSet,
  selectedSet,
  onToggleSelect,
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
  onNavigateDay,
  containerRef,
}: RowsViewProps) {
  const [editingDay, setEditingDay] = useState<number | null>(null)

  useEffect(() => {
    if (newRequest) setEditingDay(newRequest.dayIndex)
  }, [newRequest])

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
        selected={selectedSet.has(task.id)}
        linked={linkedSet.has(task.id)}
        edge={edgeSet.has(task.id)}
        onStartEdit={onStartEdit}
        onToggle={onToggle}
        onDelete={onDelete}
        onCheckToggle={onCheckToggle}
        onUpdateStyle={onUpdateStyle}
        onPointerDown={onCardPointerDown}
        onToggleSelect={onToggleSelect}
        allTags={allTags}
        onUpdateTags={onUpdateTags}
        folders={folders}
        onAssignFolder={onAssignFolder}
      />
    )

  const marqueeStyle =
    marquee
      ? {
          left: marquee.w >= 0 ? marquee.x : marquee.x + marquee.w,
          top: marquee.h >= 0 ? marquee.y : marquee.y + marquee.h,
          width: Math.abs(marquee.w),
          height: Math.abs(marquee.h),
        }
      : undefined

  return (
    <div className="rows-view" ref={containerRef}>
      {days.map((day, dayIndex) => {
        const iso = toISODate(day)
        const open = openByIso[iso] ?? []
        const done = doneByIso[iso] ?? []
        const today = isToday(iso)
        const weekend = day.getDay() === 0 || day.getDay() === 6
        const color = colors[iso]
        return (
          <div
            key={iso}
            className={`rows-day${today ? ' today' : ''}${weekend ? ' weekend' : ''}${color ? ' colored' : ''}`}
            style={color ? ({ ['--col-color' as string]: color } as CSSProperties) : undefined}
            data-date={iso}
          >
            <div className="rows-day-head">
              <button className="rows-day-add" onClick={() => setEditingDay(dayIndex)} aria-label="Добавить задачу">
                <span className="rows-day-num">{day.getDate()}</span>
                <span className="rows-day-name">{DAYS_FULL_RU[(day.getDay() + 6) % 7]}</span>
                <span className="rows-day-month">{MONTHS_RU[day.getMonth()].toLowerCase()}</span>
              </button>
            </div>
            <div className="rows-day-open">
              {open.map(renderTask)}
              {editingDay === dayIndex ? (
                <NewNoteEditor
                  onRegister={onRegisterEditor}
                  onCreate={(html) => onAdd(html, day)}
                  onClose={() => setEditingDay(null)}
                  onNavAdjacent={(delta) => onNavigateDay(dayIndex, delta)}
                />
              ) : (
                <button className="task-add" onClick={() => setEditingDay(dayIndex)}>
                  + Новая задача
                </button>
              )}
            </div>
            <div className="rows-day-done">
              <div className="rows-done-head">Выполнено</div>
              {done.length > 0 ? (
                done.map(renderTask)
              ) : (
                <div className="rows-done-empty">Пока пусто</div>
              )}
            </div>
          </div>
        )
      })}
      {marquee && <div className="marquee" style={marqueeStyle} />}
    </div>
  )
}
