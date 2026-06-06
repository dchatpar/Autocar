'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Plus,
  Filter,
  MoreHorizontal,
  Calendar,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'

interface Task {
  id: string
  title: string
  description?: string
  status: 'todo' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  dueDate?: string
  assignee?: {
    name: string
    avatar?: string
  }
  tags?: string[]
}

const mockTasks: Task[] = [
  {
    id: '1',
    title: 'Follow up with Sarah Johnson',
    description: 'Sent initial email on Monday, no response yet',
    status: 'todo',
    priority: 'high',
    dueDate: 'Today',
    assignee: { name: 'Marcus Chen' },
    tags: ['lead', 'follow-up'],
  },
  {
    id: '2',
    title: 'Prepare inventory report',
    description: 'Compile monthly inventory status for management',
    status: 'in_progress',
    priority: 'medium',
    dueDate: 'Tomorrow',
    assignee: { name: 'Marcus Chen' },
    tags: ['report'],
  },
  {
    id: '3',
    title: 'Review campaign performance',
    status: 'todo',
    priority: 'low',
    dueDate: 'Friday',
    assignee: { name: 'Alex Rivera' },
    tags: ['campaign'],
  },
  {
    id: '4',
    title: 'Send contracts to legal',
    status: 'done',
    priority: 'high',
    assignee: { name: 'Marcus Chen' },
  },
  {
    id: '5',
    title: 'Schedule test drive for new prospect',
    status: 'todo',
    priority: 'medium',
    dueDate: 'Today',
    tags: ['test-drive'],
  },
]

const priorityColors = {
  low: 'muted',
  medium: 'warning',
  high: 'danger',
} as const

const statusIcons = {
  todo: Circle,
  in_progress: Clock,
  done: CheckCircle2,
}

const statusLabels = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
}

export default function TasksPage() {
  const [tasks, setTasks] = useState(mockTasks)
  const [filter, setFilter] = useState<'all' | 'todo' | 'in_progress' | 'done'>('all')

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'all') return true
    return task.status === filter
  })

  const toggleTaskStatus = (taskId: string) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === taskId) {
          const newStatus = task.status === 'done' ? 'todo' : 'done'
          return { ...task, status: newStatus }
        }
        return task
      })
    )
  }

  const todoCount = tasks.filter((t) => t.status === 'todo').length
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length
  const doneCount = tasks.filter((t) => t.status === 'done').length

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">Tasks</h1>
          <p className="text-sm text-muted mt-1">
            {todoCount} to do, {inProgressCount} in progress, {doneCount} completed
          </p>
        </div>
        <Button variant="primary" size="md">
          <Plus className="h-4 w-4" />
          <span>Add Task</span>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6">
        <Filter className="h-4 w-4 text-muted" />
        {(['all', 'todo', 'in_progress', 'done'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
              filter === status
                ? 'bg-elevated text-accent'
                : 'text-muted hover:text-primary hover:bg-elevated'
            )}
          >
            {status === 'all' ? 'All' : statusLabels[status]}
            {status !== 'all' && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-border rounded-full">
                {status === 'todo'
                  ? todoCount
                  : status === 'in_progress'
                  ? inProgressCount
                  : doneCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tasks List */}
      <div className="space-y-3">
        {filteredTasks.map((task) => {
          const StatusIcon = statusIcons[task.status]
          return (
            <Card
              key={task.id}
              className={cn(
                'hover:border-border-active transition-all cursor-pointer',
                task.status === 'done' && 'opacity-60'
              )}
            >
              <CardContent className="py-4 px-4">
                <div className="flex items-start gap-4">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleTaskStatus(task.id)}
                    className={cn(
                      'mt-0.5 flex-shrink-0 transition-colors',
                      task.status === 'done'
                        ? 'text-success'
                        : task.priority === 'high'
                        ? 'text-danger hover:text-danger/80'
                        : 'text-muted hover:text-primary'
                    )}
                    aria-label={task.status === 'done' ? 'Mark as incomplete' : 'Mark as complete'}
                  >
                    <StatusIcon className="h-5 w-5" />
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3
                        className={cn(
                          'font-medium text-primary',
                          task.status === 'done' && 'line-through text-muted'
                        )}
                      >
                        {task.title}
                      </h3>
                      <Badge variant={priorityColors[task.priority]} className="text-xs">
                        {task.priority}
                      </Badge>
                    </div>

                    {task.description && (
                      <p className="text-sm text-muted mb-2 line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-muted">
                      {task.dueDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {task.dueDate}
                        </span>
                      )}
                      {task.assignee && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {task.assignee.name}
                        </span>
                      )}
                      {task.tags && (
                        <div className="flex items-center gap-1">
                          {task.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 bg-elevated rounded text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <button
                    className="p-1 rounded hover:bg-elevated text-muted hover:text-primary transition-colors"
                    aria-label="More options"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          )
        })}

        {filteredTasks.length === 0 && (
          <div className="text-center py-12 text-muted">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No tasks found</p>
          </div>
        )}
      </div>
    </>
  )
}
