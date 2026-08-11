import { useEffect, useRef, useState } from 'react'
import type { CardStyle, Folder, Task } from '../types'
import { useArrows, ARROW_COLORS } from '../arrows'

interface TaskRowProps {
  task: Task
  selected?: boolean
  linked?: boolean
  edge?: boolean
  onStartEdit: (task: Task) => void
  onToggle: (task: Task) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCheckToggle: (task: Task, index: number, checked: boolean) => Promise<void>
  onUpdateStyle?: (id: string, style: CardStyle | null) => Promise<void>
  onDragStart?: (e: React.DragEvent, taskId: string) => void
  onPointerDown?: (e: React.PointerEvent, task: Task) => void
  onToggleSelect?: (id: string) => void
  allTags?: string[]
  onUpdateTags?: (id: string, tags: string[]) => void
  folders?: Folder[]
  onAssignFolder?: (id: string, folderId: number | null) => void
}

export function TaskRow({
  task,
  selected = false,
  linked = false,
  edge = false,
  onStartEdit,
  onToggle,
  onDelete,
  onCheckToggle,
  onUpdateStyle,
  onDragStart,
  onPointerDown,
  onToggleSelect,
  allTags = [],
  onUpdateTags,
  folders = [],
  onAssignFolder,
}: TaskRowProps) {
  const textRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const { registerEl, startConnection } = useArrows()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    registerEl(task.id, rootRef.current)
    return () => registerEl(task.id, null)
  }, [task.id, registerEl])

  useEffect(() => {
    const el = textRef.current
    if (!el) return
    const inputs = el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    inputs.forEach((input, idx) => {
      input.addEventListener('click', (e) => e.stopPropagation())
      input.addEventListener('change', (e) => {
        e.stopPropagation()
        void onCheckToggle(task, idx, (e.target as HTMLInputElement).checked)
      })
    })
  }, [task.text, onCheckToggle, task])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  const style = task.style
  const patch = (p: Partial<CardStyle>) => onUpdateStyle?.(task.id, { ...style, ...p })
  const muted = (c: string) => `color-mix(in srgb, ${c} 30%, transparent)`
  const rootStyle: React.CSSProperties | undefined = style?.hatch
    ? style?.bg
      ? ({ ['--hatch-color' as string]: style.bg } as React.CSSProperties)
      : undefined
    : style?.bg
      ? { backgroundColor: muted(style.bg) }
      : undefined

  const isScript = style?.font === 'script'
  const taskTags = task.tags ?? []
  const toggleTag = (tg: string) => {
    const next = taskTags.includes(tg) ? taskTags.filter((t) => t !== tg) : [...taskTags, tg]
    onUpdateTags?.(task.id, next)
  }
  const addTag = (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const value = newTag.trim()
    if (!value) return
    if (!taskTags.includes(value)) onUpdateTags?.(task.id, [...taskTags, value])
    setNewTag('')
  }
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.stopPropagation()
      onToggleSelect?.(task.id)
      return
    }
    onPointerDown?.(e, task)
  }

  return (
    <div
      ref={rootRef}
      data-task-id={task.id}
      className={`task${task.done ? ' done' : ''}${selected ? ' nav-selected' : ''}${linked ? ' linked' : ''}${edge ? ' edge' : ''}${style?.hatch ? ' hatch' : ''}${isScript ? ' script' : ''}`}
      style={rootStyle}
      draggable={!task.done}
      onPointerDown={handlePointerDown}
      onClickCapture={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onDragStart={!task.done && onDragStart ? (e) => onDragStart(e, task.id) : undefined}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      <div className="conn-handle left" onMouseDown={(e) => startConnection(task.id, 'left', e)} title="Соединить стрелкой" />
      <div className="conn-handle right" onMouseDown={(e) => startConnection(task.id, 'right', e)} title="Соединить стрелкой" />
      <button
        className={`task-check${task.done ? ' checked' : ''}`}
        onClick={() => void onToggle(task)}
        aria-label={task.done ? 'Вернуть в активные' : 'Отметить выполненной'}
        title={task.done ? 'Вернуть в активные' : 'Отметить выполненной'}
      />
      <div
        ref={textRef}
        className="task-text"
        onClick={() => onStartEdit(task)}
        title="Нажмите, чтобы изменить"
        dangerouslySetInnerHTML={{ __html: task.text }}
      />
      <button
        className="task-del"
        aria-label="Удалить"
        onClick={(e) => {
          e.stopPropagation()
          void onDelete(task.id)
        }}
      >
        ×
      </button>
      {menu && onUpdateStyle && (
        <div className="card-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          <div className="menu-label">Заливка карточки</div>
          <div className="menu-row">
            {ARROW_COLORS.map((c) => (
              <button
                key={c}
                className={`menu-color${style?.bg === c ? ' on' : ''}`}
                style={{ background: c }}
                onClick={() => patch({ bg: c })}
                aria-label={`Заливка ${c}`}
              />
            ))}
          </div>
          <button className={`arrow-menu-btn${!style?.bg ? ' on' : ''}`} onClick={() => patch({ bg: null })}>
            Без заливки
          </button>
          <button
            className={`arrow-menu-btn${style?.hatch ? ' on' : ''}`}
            onClick={() => patch({ hatch: !style?.hatch })}
          >
            Штриховка
          </button>
          <button
            className={`arrow-menu-btn${isScript ? ' on' : ''}`}
            onClick={() => patch({ font: isScript ? null : 'script' })}
          >
            Рукописный шрифт
          </button>
          {task.done && (
            <button className="arrow-menu-btn reopen" onClick={() => void onToggle(task)}>
              ↺ Вернуть в активные
            </button>
          )}
          <button className="arrow-menu-btn" onClick={() => void onUpdateStyle(task.id, null)}>
            Сбросить стиль
          </button>
          {onUpdateTags && (
            <>
              <div className="menu-label">Теги</div>
              {allTags.length > 0 && (
                <div className="menu-row tag-row">
                  {allTags.map((tg) => (
                    <button
                      key={tg}
                      className={`menu-chip${taskTags.includes(tg) ? ' on' : ''}`}
                      onClick={() => toggleTag(tg)}
                    >
                      {tg}
                    </button>
                  ))}
                </div>
              )}
              <form className="tag-add-row" onSubmit={addTag}>
                <input
                  className="tag-add-input"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Новый тег…"
                  maxLength={40}
                  onClick={(e) => e.stopPropagation()}
                />
                <button type="submit" className="arrow-menu-btn">
                  ＋
                </button>
              </form>
            </>
          )}
          {onAssignFolder && (
            <>
              <div className="menu-label">Папка</div>
              <div className="menu-row tag-row">
                <button
                  className={`menu-chip${!task.folderId ? ' on' : ''}`}
                  onClick={() => onAssignFolder(task.id, null)}
                  title="Убрать из папок"
                >
                  Без папки
                </button>
                {folders.map((f) => (
                  <button
                    key={f.id}
                    className={`menu-chip${task.folderId === f.id ? ' on' : ''}`}
                    onClick={() => onAssignFolder(task.id, f.id)}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
