'use client'
import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { FileText, Car } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

interface DealCardProps {
  deal: Deal
  onClick?: () => void
}

export interface Deal {
  id: string
  dealNumber: string
  customer?: {
    id: string
    name: string
    email?: string
    phone?: string
  }
  vehicle?: {
    id: string
    year: number
    make: string
    model: string
    vin?: string
  }
  totalPrice?: number
  status: string
  assignee?: {
    id: string
    name: string
  }
}

function DealCard({ deal, onClick }: DealCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_negotiation': return '#F59E0B'
      case 'down_payment': return '#3B82F6'
      case 'financing': return '#8B5CF6'
      case 'paid_off': return '#10B981'
      default: return '#6B7280'
    }
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        className="p-3 cursor-grab active:cursor-grabbing hover:bg-bg-elevated transition-colors"
        onClick={onClick}
      >
        <div className="flex items-start justify-between mb-2">
          <span className="text-xs font-mono text-text-muted">{deal.dealNumber}</span>
          <Badge
            className="text-[10px]"
            style={{
              backgroundColor: getStatusColor(deal.status) + '20',
              color: getStatusColor(deal.status)
            }}
          >
            {deal.status.replace(/_/g, ' ')}
          </Badge>
        </div>
        <h4 className="text-sm font-medium text-text-primary mb-1 truncate">
          {deal.customer?.name || 'No customer'}
        </h4>
        <div className="flex items-center gap-1 text-xs text-text-muted mb-2">
          <Car className="w-3 h-3" />
          <span className="truncate">
            {deal.vehicle
              ? `${deal.vehicle.year} ${deal.vehicle.make} ${deal.vehicle.model}`
              : 'No vehicle'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[#E8FF47]">
            ${Number(deal.totalPrice || 0).toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <FileText className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-xs text-text-muted truncate max-w-[80px]">
              {deal.assignee?.name || 'Unassigned'}
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}

interface DealKanbanProps {
  deals: Deal[]
  onDealMove: (dealId: string, newStatus: string) => void
  onDealClick: (dealId: string) => void
}

const STAGES = [
  { id: 'in_negotiation', label: 'In Negotiation', color: '#F59E0B' },
  { id: 'down_payment', label: 'Down Payment', color: '#3B82F6' },
  { id: 'financing', label: 'Financing', color: '#8B5CF6' },
  { id: 'paid_off', label: 'Paid Off', color: '#10B981' },
]

export function DealKanban({ deals, onDealMove, onDealClick }: DealKanbanProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  const dealsByStage = STAGES.reduce((acc, stage) => {
    acc[stage.id] = deals.filter(d => d.status === stage.id)
    return acc
  }, {} as Record<string, Deal[]>)

  const activeDeal = activeId ? deals.find(d => d.id === activeId) : null

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string)
  
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    const dealId = active.id as string
    const overId = over.id as string

    // If dropped on a column (stage), move deal to that stage
    const targetStage = STAGES.find(s => s.id === overId)
    if (targetStage) {
      onDealMove(dealId, targetStage.id)
      return
    }

    // If dropped on another deal, find its stage and move there
    const targetDeal = deals.find(d => d.id === overId)
    if (targetDeal) {
      onDealMove(dealId, targetDeal.status)
    }
  }

  const handleDragCancel = () => setActiveId(null)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map(stage => (
          <div key={stage.id} className="flex-shrink-0 w-[300px]">
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
              <span className="text-sm font-medium text-[#E2E8F0]">{stage.label}</span>
              <Badge variant="secondary" className="text-xs">
                {dealsByStage[stage.id]?.length || 0}
              </Badge>
            </div>

            {/* Droppable column */}
            <SortableContext
              items={dealsByStage[stage.id]?.map(d => d.id) || []}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2 min-h-[100px]">
                {dealsByStage[stage.id]?.map(deal => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    onClick={() => onDealClick(deal.id)}
                  />
                ))}
                {(!dealsByStage[stage.id] || dealsByStage[stage.id].length === 0) && (
                  <div className="border border-dashed border-[#1E2229] rounded-lg p-4 text-center text-xs text-[#6B7280]">
                    Drop deals here
                  </div>
                )}
              </div>
            </SortableContext>
          </div>
        ))}
      </div>

      <DragOverlay>
        {activeDeal ? (
          <div className="opacity-90 rotate-3">
            <DealCard deal={activeDeal} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
