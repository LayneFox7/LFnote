export type TaskType = 'task' | 'note'

export interface Task {
  id: string
  text: string
  date: string
  type?: TaskType
  startDate?: string | null
  endDate?: string | null
  parentId?: string | null
  progress?: number
  done: boolean
  createdAt: string
  completedAt: string | null
  order: number
  style?: CardStyle
  tags?: string[]
  folderId?: number | null
}

export type FilterType = 'all' | 'tasks' | 'notes'

export type View = 'week' | 'rows' | 'list' | 'gantt'

export interface User {
  id: number
  login: string
}

export interface Folder {
  id: number
  name: string
  position: number
}

export interface CardStyle {
  bg?: string | null
  hatch?: boolean
  font?: 'script' | null
}

export type ArrowType = 'straight' | 'elbow' | 'rounded' | 'routed' | 'sketch'

export type LinkType = 'dependency' | 'dataflow' | 'sequence' | 'parent' | 'status'

export const LINK_TYPE_LABEL: Record<LinkType, string> = {
  dependency: 'Зависит от',
  dataflow: 'Передает данные',
  sequence: 'Последовательность',
  parent: 'Родитель',
  status: 'Переход статуса',
}

export interface ArrowStyle {
  type?: ArrowType
  color?: string
  width?: number
  dashed?: boolean
  label?: string
  linkType?: LinkType
}

export interface Link {
  id: string
  from: string
  to: string
  createdAt: string
  style?: ArrowStyle
}
