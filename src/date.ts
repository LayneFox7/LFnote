export const DAYS_SHORT_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
export const DAYS_FULL_RU = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
export const MONTHS_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function mondayOf(d: Date): Date {
  const x = new Date(d)
  const dow = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - dow)
  x.setHours(0, 0, 0, 0)
  return x
}

export function isToday(iso: string): boolean {
  return iso === toISODate(new Date())
}

export function isPast(iso: string): boolean {
  return iso < toISODate(new Date())
}

export function isWeekend(d: Date): boolean {
  const dow = d.getDay()
  return dow === 0 || dow === 6
}

export function isWeekendIso(iso: string): boolean {
  return isWeekend(new Date(`${iso}T12:00:00`))
}

export function dayName(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return DAYS_SHORT_RU[(d.getDay() + 6) % 7]
}

export function formatDayHeader(d: Date): string {
  return `${DAYS_FULL_RU[(d.getDay() + 6) % 7]}, ${d.getDate()} ${MONTHS_RU[d.getMonth()].toLowerCase()}`
}

export function formatWeekLabel(days: Date[]): string {
  const first = days[0]
  const last = days[days.length - 1]
  const y = String(first.getFullYear())
  if (first.getMonth() === last.getMonth()) {
    return `${MONTHS_RU[first.getMonth()]} ${y}`
  }
  if (first.getFullYear() !== last.getFullYear()) {
    return `${MONTHS_RU[first.getMonth()]} ${first.getFullYear()} — ${MONTHS_RU[last.getMonth()]} ${last.getFullYear()}`
  }
  return `${MONTHS_RU[first.getMonth()]} — ${MONTHS_RU[last.getMonth()]} ${y}`
}
