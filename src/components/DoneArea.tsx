import type { CardStyle, Folder, Task } from '../types'
import { formatDayHeader, toISODate } from '../date'
import { TaskEditor } from './TaskEditor'
import type { EditorApi } from '../editor'
import { TaskRow } from './TaskRow'

interface DoneAreaProps {
  days: Date[]
  tasks: Task[]
  colWidths: number[]
  doneRef?: (el: HTMLDivElement | null) => void
  editingId: string | null
  linkedSet: Set<string>
  edgeSet: Set<string>
  selectedSet: Set<string>
  onToggleSelect: (id: string) => void
  onCardPointerDown: (e: React.PointerEvent, task: Task) => void
  onStartEdit: (task: Task) => void
  onToggle: (task: Task) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCheckToggle: (task: Task, index: number, checked: boolean) => Promise<void>
  onUpdateStyle: (id: string, style: CardStyle | null) => Promise<void>
  allTags: string[]
  onUpdateTags: (id: string, tags: string[]) => void
  folders?: Folder[]
  onAssignFolder?: (id: string, folderId: number | null) => void
  onEditorSave: (task: Task, html: string, openNew: boolean) => void
  onCancelEdit: () => void
  onRegisterEditor: (api: EditorApi | null) => void
}

export function DoneArea({
  days,
  tasks,
  colWidths,
  doneRef,
  editingId,
  linkedSet,
  edgeSet,
  selectedSet,
  onToggleSelect,
  onCardPointerDown,
  onStartEdit,
  onToggle,
  onDelete,
  onCheckToggle,
  onUpdateStyle,
  allTags,
  onUpdateTags,
  folders,
  onAssignFolder,
  onEditorSave,
  onCancelEdit,
  onRegisterEditor,
}: DoneAreaProps) {
  const groups = new Map<string, Task[]>()
  for (const t of tasks) {
    const arr = groups.get(t.date)
    if (arr) arr.push(t)
    else groups.set(t.date, [t])
  }

  const weekIso = days.map((d) => toISODate(d))
  const weekDates = new Set(weekIso)
  const others: { iso: string; tasks: Task[] }[] = []
  for (const [iso, list] of [...groups.entries()].filter(([iso]) => !weekDates.has(iso)).sort((a, b) => b[0].localeCompare(a[0]))) {
    others.push({ iso, tasks: list })
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

  return (
    <div className="done-area" ref={doneRef}>
      {groups.size === 0 ? (
        <div className="done-empty">Выполненные заметки появятся здесь</div>
      ) : (
        <>
          {days.map((d, idx) => {
            const iso = weekIso[idx]
            const list = groups.get(iso)
            return (
              <div key={iso} className="done-col" style={{ flexBasis: `${colWidths[idx]}px` }}>
                <div className="done-col-head">{formatDayHeader(d)}</div>
                {list?.map(renderTask)}
              </div>
            )
          })}
          {others.map(({ iso, tasks: list }) => (
            <div key={iso} className="done-col" style={{ flexBasis: '190px' }}>
              <div className="done-col-head">{formatDayHeader(new Date(`${iso}T12:00:00`))}</div>
              {list.map(renderTask)}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
