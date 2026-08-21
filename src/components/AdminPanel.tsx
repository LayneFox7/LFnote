import { useEffect, useState } from 'react'
import { fetchAdminStats, type AdminStats } from '../api'

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { fetchAdminStats().then(setStats).catch((e) => setError(String(e))) }, [])

  return (
    <div className="admin-overlay" onClick={onClose}>
      <div className="admin-panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-header">
          <span className="admin-title">Панель управления</span>
          <button className="admin-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="admin-error">{error}</div>}
        {!stats && !error && <div className="admin-loading">Загрузка…</div>}
        {stats && (
          <div className="admin-grid">
            <div className="admin-card"><div className="admin-card-num">{stats.tasks}</div><div className="admin-card-label">Всего задач</div></div>
            <div className="admin-card"><div className="admin-card-num">{stats.doneTasks}</div><div className="admin-card-label">Выполнено</div></div>
            <div className="admin-card"><div className="admin-card-num">{stats.notes}</div><div className="admin-card-label">Заметок</div></div>
            <div className="admin-card"><div className="admin-card-num">{stats.links}</div><div className="admin-card-label">Связей</div></div>
            <div className="admin-card"><div className="admin-card-num">{stats.tags}</div><div className="admin-card-label">Тегов</div></div>
            <div className="admin-card"><div className="admin-card-num">{stats.folders}</div><div className="admin-card-label">Папок</div></div>
            <div className="admin-card"><div className="admin-card-num">{stats.activeSessions}</div><div className="admin-card-label">Активных сессий</div></div>
            <div className="admin-card"><div className="admin-card-num">{stats.createdAt ? new Date(stats.createdAt).toLocaleDateString('ru-RU') : '—'}</div><div className="admin-card-label">Регистрация</div></div>
          </div>
        )}
      </div>
    </div>
  )
}
