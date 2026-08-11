import { ARROW_COLORS } from '../arrows'

const COLORS = ['#d9534f', '#e67e22', '#f1c40f', '#27ae60', '#3498db', '#8e44ad', '#7f8c8d', '#33332f']

interface FormatToolbarProps {
  onCommand: (cmd: string, value?: string) => void
  selectionCount?: number
  onApplyScript?: () => void
  onApplyFill?: (color: string) => void
  onToggleDoneSelected?: () => void
  onDeleteSelected?: () => void
  onClearSelection?: () => void
}

export function FormatToolbar({
  onCommand,
  selectionCount = 0,
  onApplyScript,
  onApplyFill,
  onToggleDoneSelected,
  onDeleteSelected,
  onClearSelection,
}: FormatToolbarProps) {
  return (
    <div className="toolbar-top" onMouseDown={(e) => e.preventDefault()}>
      <button className="toolbar-btn b" onClick={() => onCommand('bold')} title="Жирный (⌘B)">
        B
      </button>
      <button className="toolbar-btn i" onClick={() => onCommand('italic')} title="Курсив (⌘I)">
        I
      </button>
      <button className="toolbar-btn u" onClick={() => onCommand('underline')} title="Подчёркнутый (⌘U)">
        U
      </button>
      <button className="toolbar-btn s" onClick={() => onCommand('strikeThrough')} title="Зачёркнутый">
        S
      </button>
      <span className="toolbar-sep" />
      <button className="toolbar-btn" onClick={() => onCommand('insertUnorderedList')} title="Маркированный список">
        •≡
      </button>
      <button className="toolbar-btn" onClick={() => onCommand('insertOrderedList')} title="Нумерованный список">
        1≡
      </button>
      <button className="toolbar-btn" onClick={() => onCommand('checkbox')} title="Чекбокс">
        ☑
      </button>
      <span className="toolbar-sep" />
      {COLORS.map((color) => (
        <button
          key={color}
          className="toolbar-color"
          style={{ background: color }}
          onClick={() => onCommand('foreColor', color)}
          title={color}
          aria-label={`Цвет ${color}`}
        />
      ))}
      {selectionCount > 0 && (
        <>
          <span className="toolbar-sep" />
          <span className="toolbar-bulk-label" data-count={selectionCount}>
            {selectionCount} выбр.
          </span>
          <button
            className={`toolbar-btn script${onApplyScript ? '' : ''}`}
            onClick={onApplyScript}
            title="Рукописный шрифт у выбранных"
            aria-pressed="false"
          >
            Аа
          </button>
          <div className="toolbar-bulk-colors">
            {ARROW_COLORS.map((c) => (
              <button
                key={c}
                className="toolbar-color"
                style={{ background: c }}
                onClick={() => onApplyFill?.(c)}
                title={`Заливка выбранных ${c}`}
                aria-label={`Заливка выбранных ${c}`}
              />
            ))}
          </div>
          <button className="toolbar-btn done" onClick={onToggleDoneSelected} title="Отметить выбранные выполненными">
            ✓
          </button>
          <button className="toolbar-btn del" onClick={onDeleteSelected} title="Удалить выбранные">
            ×
          </button>
          <button className="toolbar-btn" onClick={onClearSelection} title="Снять выделение (Esc)">
            ✕ снять
          </button>
        </>
      )}
    </div>
  )
}
