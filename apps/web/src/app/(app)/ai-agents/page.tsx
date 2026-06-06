'use client'
import { useState } from 'react'
import { Zap, Activity, TrendingUp, Settings, Play, Pause } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface Agent {
  id: string
  name: string
  description: string
  icon: string
  color: string
  isActive: boolean
  dailyRuns: number
  avgResponseTime: string
  dailyCost: string
}

const AGENTS: Agent[] = [
  {
    id: 'nova',
    name: 'NOVA',
    description: 'Lead routing & AI scoring. Routes new leads to the right agent using 6 strategies.',
    icon: '⚡',
    color: '#A855F7',
    isActive: true,
    dailyRuns: 247,
    avgResponseTime: '1.2s',
    dailyCost: '$12.40',
  },
  {
    id: 'ario',
    name: 'ARIO',
    description: 'Inventory insights. Recommends price adjustments and identifies slow-moving vehicles.',
    icon: '📊',
    color: '#22D3A0',
    isActive: true,
    dailyRuns: 89,
    avgResponseTime: '0.8s',
    dailyCost: '$4.20',
  },
  {
    id: 'sage',
    name: 'SAGE',
    description: 'Deal analytics. Predicts close probability and identifies at-risk deals.',
    icon: '🎯',
    color: '#3B82F6',
    isActive: false,
    dailyRuns: 156,
    avgResponseTime: '2.1s',
    dailyCost: '$8.90',
  },
  {
    id: 'lucas',
    name: 'LUCAS',
    description: 'Customer lifetime value. Scores customers for long-term value and retention.',
    icon: '💎',
    color: '#E8FF47',
    isActive: true,
    dailyRuns: 312,
    avgResponseTime: '1.5s',
    dailyCost: '$15.60',
  },
]

const ACTIVITY_LOG = [
  { time: '2 min ago', agent: 'NOVA', action: 'Routed lead "John Smith" to Agam Chawla', type: 'route' },
  { time: '5 min ago', agent: 'ARIO', action: 'Flagged 2022 Toyota Camry for price review', type: 'insight' },
  { time: '12 min ago', agent: 'LUCAS', action: 'Scored customer "Jane Doe" at 87/100 CLV', type: 'score' },
  { time: '18 min ago', agent: 'NOVA', action: 'Recalculated score for lead L-042: 72 → 85', type: 'score' },
]

export default function AIAgentsPage() {
  const [agents, setAgents] = useState(AGENTS)

  const toggleAgent = (id: string) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a))
  }

  const activeCount = agents.filter(a => a.isActive).length
  const totalRuns = agents.reduce((sum, a) => sum + a.dailyRuns, 0)
  const totalCost = agents.reduce((sum, a) => sum + parseFloat(a.dailyCost.replace('$', '')), 0)

  // Calculate average response time
  const avgResponseMs = agents.reduce((sum, a) => {
    const ms = parseFloat(a.avgResponseTime.replace('s', '')) * 1000
    return sum + ms
  }, 0) / agents.length
  const avgResponseTime = (avgResponseMs / 1000).toFixed(1) + 's'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">AI Agents</h1>
          <p className="text-sm text-text-muted mt-1">Monitor and control your AI-powered assistants</p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#3B82F620]">
              <Activity className="w-5 h-5 text-[#3B82F6]" />
            </div>
            <div>
              <p className="text-xs text-text-muted">Total Runs Today</p>
              <p className="text-xl font-bold text-text-primary">{totalRuns.toLocaleString()}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#A855F720]">
              <Zap className="w-5 h-5 text-[#A855F7]" />
            </div>
            <div>
              <p className="text-xs text-text-muted">Active Agents</p>
              <p className="text-xl font-bold text-text-primary">{activeCount}/{agents.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#22D3A020]">
              <TrendingUp className="w-5 h-5 text-[#22D3A0]" />
            </div>
            <div>
              <p className="text-xs text-text-muted">Avg Response Time</p>
              <p className="text-xl font-bold text-text-primary">{avgResponseTime}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#E8FF4720]">
              <Settings className="w-5 h-5 text-[#E8FF47]" />
            </div>
            <div>
              <p className="text-xs text-text-muted">Total Cost Today</p>
              <p className="text-xl font-bold text-text-primary">${totalCost.toFixed(2)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Agent Cards */}
      <div className="grid grid-cols-2 gap-4">
        {agents.map(agent => (
          <Card key={agent.id} className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                  style={{
                    backgroundColor: agent.color + '20',
                    boxShadow: agent.isActive ? `0 0 20px ${agent.color}40` : undefined
                  }}
                >
                  {agent.icon}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-text-primary">{agent.name}</h3>
                  <Badge
                    className="mt-1 text-xs"
                    style={{
                      backgroundColor: agent.isActive ? '#22D3A020' : '#6B728020',
                      color: agent.isActive ? '#22D3A0' : '#6B7280'
                    }}
                  >
                    {agent.isActive ? 'Active' : 'Paused'}
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleAgent(agent.id)}
                className="gap-1.5"
              >
                {agent.isActive ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Enable</span>
                  </>
                )}
              </Button>
            </div>

            <p className="text-sm text-text-muted mb-4">{agent.description}</p>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
              <div>
                <p className="text-xs text-text-muted">Runs Today</p>
                <p className="text-sm font-semibold text-text-primary">{agent.dailyRuns}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Avg Response</p>
                <p className="text-sm font-semibold text-text-primary">{agent.avgResponseTime}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Cost Today</p>
                <p className="text-sm font-semibold" style={{ color: agent.color }}>{agent.dailyCost}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Activity Log */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Recent Agent Activity</h3>
        <div className="space-y-3">
          {ACTIVITY_LOG.map((log, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
              <span className="text-xs text-text-muted w-20 flex-shrink-0">{log.time}</span>
              <Badge variant="secondary" className="text-xs w-16 text-center">{log.agent}</Badge>
              <span className="text-sm text-text-primary">{log.action}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
