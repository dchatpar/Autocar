'use client'
import { useState } from 'react'
import { Search, Filter, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface LeadFiltersProps {
  onFilterChange: (filters: FilterState) => void
}

interface FilterState {
  search: string
  status: string
  source: string
  priority: string
  assignedToId: string
}

export function LeadFilters({ onFilterChange }: LeadFiltersProps) {
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: 'all',
    source: 'all',
    priority: 'all',
    assignedToId: ''
  })

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => v !== 'all' && v !== '' && k !== 'search').length

  const update = (key: keyof FilterState, value: string) => {
    const next = { ...filters, [key]: value }
    setFilters(next)
    onFilterChange(next)
  }

  const clearAll = () => {
    const reset = { search: '', status: 'all', source: 'all', priority: 'all', assignedToId: '' }
    setFilters(reset)
    onFilterChange(reset)
  }

  const statusLabels: Record<string, string> = {
    all: 'All Statuses',
    not_started: 'Not Started',
    in_progress: 'In Progress',
    contacted: 'Contacted',
    qualified: 'Qualified',
    appointment: 'Appointment',
    negotiating: 'Negotiating',
    converted: 'Converted'
  }

  const sourceLabels: Record<string, string> = {
    all: 'All Sources',
    website: 'Website',
    facebook: 'Facebook',
    phone: 'Phone',
    walk_in: 'Walk In',
    referral: 'Referral',
    google: 'Google',
    craigslist: 'Craigslist'
  }

  const priorityLabels: Record<string, string> = {
    all: 'All Priorities',
    high: 'High',
    medium: 'Medium',
    low: 'Low'
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-[200px] max-w-[320px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <Input
          placeholder="Search leads..."
          value={filters.search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('search', e.target.value)}
          className="pl-9"
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Filter className="w-3.5 h-3.5" />
            Status
            {filters.status !== 'all' && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {Object.entries(statusLabels).map(([value, label]) => (
            <DropdownMenuItem
              key={value}
              onSelect={() => update('status', value)}
              className={filters.status === value ? 'bg-bg-elevated' : ''}
            >
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Source
            {filters.source !== 'all' && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent ml-1.5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {Object.entries(sourceLabels).map(([value, label]) => (
            <DropdownMenuItem
              key={value}
              onSelect={() => update('source', value)}
              className={filters.source === value ? 'bg-bg-elevated' : ''}
            >
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Priority
            {filters.priority !== 'all' && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent ml-1.5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {Object.entries(priorityLabels).map(([value, label]) => (
            <DropdownMenuItem
              key={value}
              onSelect={() => update('priority', value)}
              className={filters.priority === value ? 'bg-bg-elevated' : ''}
            >
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {activeFilterCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1 text-text-muted">
          <X className="w-3.5 h-3.5" />
          Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
        </Button>
      )}
    </div>
  )
}
