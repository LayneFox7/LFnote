interface FormatToolbarProps {
  onCommand: (cmd: string, value?: string) => void
  disabled?: boolean
}

const COLORS = ['#d9534f', '#e67e22', '#f1c40f', '#27ae60', '#3498db', '#8e44ad', '#7f8c8d', '#33332f']

export function FormatToolbar({ onCommand, disabled }: FormatToolbarProps) {
  return (
    <div className="toolbar-top" onMouseDown={(e) => e.preventDefault()}>
      <button className="toolbar-btn b" onClick={() => onCommand('bold')} title="Жирный (⌘B)" disabled={disabled}>B</button>
      <button className="toolbar-btn i" onClick={() => onCommand('italic')} title="Курсив (⌘I)" disabled={disabled}>I</button>
      <button className="toolbar-btn u" onClick={() => onCommand('underline')} title="Подчёркнутый (⌘U)" disabled={disabled}>U</button>
      <button className="toolbar-btn s" onClick={() => onCommand('strikeThrough')} title="Зачёркнутый" disabled={disabled}>S</button>
      <span className="toolbar-sep" />
      <button className="toolbar-btn" onClick={() => onCommand('insertUnorderedList')} title="Маркированный список" disabled={disabled}>•≡</button>
      <button className="toolbar-btn" onClick={() => onCommand('insertOrderedList')} title="Нумерованный список" disabled={disabled}>1≡</button>
      <button className="toolbar-btn" onClick={() => onCommand('checkbox')} title="Чекбокс" disabled={disabled}>☑</button>
      <span className="toolbar-sep" />
      {COLORS.map((color) => (
        <button key={color} className="toolbar-color" style={{ background: color }} onClick={() => onCommand('foreColor', color)} title={color} aria-label={`Цвет ${color}`} disabled={disabled} />
      ))}
    </div>
  )
}
