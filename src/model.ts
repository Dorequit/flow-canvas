export type NodeType = 'trigger' | 'prompt' | 'condition' | 'output'

export type FlowNode = {
  id: string
  type: NodeType
  title: string
  description: string
  x: number
  y: number
  config: string
}

export type FlowEdge = {
  id: string
  from: string
  to: string
  label: string
}

export type Workflow = {
  version: 1
  name: string
  description: string
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export type Issue = { nodeId?: string; message: string }

export const sampleWorkflow: Workflow = {
  version: 1,
  name: 'Support request triage',
  description: 'Route customer messages to the right response using a clear, testable flow.',
  nodes: [
    { id: 'start', type: 'trigger', title: 'New message', description: 'Entry point', x: 62, y: 252, config: 'Customer message' },
    { id: 'prepare', type: 'prompt', title: 'Prepare context', description: 'Normalize the request', x: 338, y: 252, config: 'Summarize the customer request in one sentence and preserve the original intent.' },
    { id: 'route', type: 'condition', title: 'Refund related?', description: 'Keyword routing', x: 614, y: 252, config: 'refund, return, cancel, money back' },
    { id: 'refund', type: 'output', title: 'Refund guidance', description: 'Yes branch', x: 918, y: 112, config: 'I can help with your refund request. Please share your order number so our team can review it.' },
    { id: 'general', type: 'output', title: 'General support', description: 'No branch', x: 918, y: 394, config: 'Thanks for reaching out. Tell us a little more about the issue and we will point you in the right direction.' },
  ],
  edges: [
    { id: 'e1', from: 'start', to: 'prepare', label: '' },
    { id: 'e2', from: 'prepare', to: 'route', label: '' },
    { id: 'e3', from: 'route', to: 'refund', label: 'yes' },
    { id: 'e4', from: 'route', to: 'general', label: 'no' },
  ],
}

const STORAGE_KEY = 'flow-canvas-workflow-v1'

export function loadWorkflow(): Workflow {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return parseWorkflow(JSON.parse(raw))
  } catch {
    // A corrupt saved draft falls back to the sample workflow.
  }
  return structuredClone(sampleWorkflow)
}

export function saveWorkflow(workflow: Workflow): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workflow))
}

export function parseWorkflow(value: unknown): Workflow {
  if (!value || typeof value !== 'object') throw new Error('This file is not a workflow.')
  const data = value as Record<string, unknown>
  if (data.version !== 1 || typeof data.name !== 'string' || typeof data.description !== 'string' || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('Unsupported workflow format. Import a Flow Canvas v1 JSON file.')
  }
  if (data.nodes.length > 80 || data.edges.length > 160) throw new Error('This workflow exceeds the editor limits.')
  const types: NodeType[] = ['trigger', 'prompt', 'condition', 'output']
  const nodes: FlowNode[] = data.nodes.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('A step in this file is invalid.')
    const node = item as Record<string, unknown>
    if (typeof node.id !== 'string' || node.id.length > 100 || !types.includes(node.type as NodeType) || typeof node.title !== 'string' || typeof node.description !== 'string' || typeof node.config !== 'string' || typeof node.x !== 'number' || typeof node.y !== 'number' || !Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      throw new Error('A step in this file is invalid.')
    }
    return { id: node.id, type: node.type as NodeType, title: node.title.slice(0, 100), description: node.description.slice(0, 200), config: node.config.slice(0, 5000), x: Math.max(0, Math.min(1400, node.x)), y: Math.max(0, Math.min(1000, node.y)) }
  })
  const edges: FlowEdge[] = data.edges.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('A connection in this file is invalid.')
    const edge = item as Record<string, unknown>
    if (typeof edge.id !== 'string' || typeof edge.from !== 'string' || typeof edge.to !== 'string' || typeof edge.label !== 'string') throw new Error('A connection in this file is invalid.')
    return { id: edge.id.slice(0, 100), from: edge.from.slice(0, 100), to: edge.to.slice(0, 100), label: edge.label.slice(0, 20) }
  })
  return { version: 1, name: data.name.slice(0, 100), description: data.description.slice(0, 300), nodes, edges }
}

export function validate(workflow: Workflow): Issue[] {
  const issues: Issue[] = []
  if (!workflow.name.trim()) issues.push({ message: 'Give this workflow a name.' })
  const idSet = new Set(workflow.nodes.map(node => node.id))
  if (idSet.size !== workflow.nodes.length) issues.push({ message: 'Step IDs must be unique.' })
  const starters = workflow.nodes.filter(node => node.type === 'trigger')
  if (starters.length !== 1) issues.push({ message: 'Add exactly one trigger step.' })
  if (!workflow.nodes.some(node => node.type === 'output')) issues.push({ message: 'Add at least one output step.' })
  for (const node of workflow.nodes) {
    if (!node.title.trim()) issues.push({ nodeId: node.id, message: 'Step needs a title.' })
    if (!node.config.trim()) issues.push({ nodeId: node.id, message: `${node.title || 'Step'} needs configuration.` })
    const outgoing = workflow.edges.filter(edge => edge.from === node.id)
    if (node.type !== 'output' && outgoing.length === 0) issues.push({ nodeId: node.id, message: `${node.title || 'Step'} has no outgoing connection.` })
    if (node.type === 'condition' && (!outgoing.some(edge => edge.label === 'yes') || !outgoing.some(edge => edge.label === 'no'))) {
      issues.push({ nodeId: node.id, message: `${node.title || 'Condition'} needs yes and no connections.` })
    }
  }
  for (const edge of workflow.edges) {
    if (!idSet.has(edge.from) || !idSet.has(edge.to)) issues.push({ message: 'A connection points to a missing step.' })
    if (edge.from === edge.to) issues.push({ nodeId: edge.from, message: 'A step cannot connect to itself.' })
  }
  const visited = new Set<string>()
  const queue = starters.length ? [starters[0].id] : []
  while (queue.length) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    workflow.edges.filter(edge => edge.from === id).forEach(edge => queue.push(edge.to))
  }
  workflow.nodes.filter(node => !visited.has(node.id)).forEach(node => issues.push({ nodeId: node.id, message: `${node.title || 'Step'} cannot be reached from the trigger.` }))
  return issues
}

export function runWorkflow(workflow: Workflow, input: string): { path: string[]; answer: string; outcome: string } {
  const start = workflow.nodes.find(node => node.type === 'trigger')
  if (!start) throw new Error('This workflow needs a trigger.')
  let current: FlowNode | undefined = start
  const path: string[] = []
  const seen = new Set<string>()
  while (current && path.length <= workflow.nodes.length) {
    const active: FlowNode = current
    if (seen.has(active.id)) throw new Error('A loop stopped this test run.')
    seen.add(active.id)
    path.push(active.id)
    if (active.type === 'output') return { path, answer: active.config, outcome: active.title }
    const outgoing: FlowEdge[] = workflow.edges.filter(edge => edge.from === active.id)
    let edge: FlowEdge | undefined
    if (active.type === 'condition') {
      const keywords: string[] = active.config.split(',').map(word => word.trim().toLowerCase()).filter(Boolean)
      const matched: boolean = keywords.some(word => input.toLowerCase().includes(word))
      edge = outgoing.find(item => item.label.toLowerCase() === (matched ? 'yes' : 'no'))
    } else edge = outgoing[0]
    current = workflow.nodes.find(node => node.id === edge?.to)
  }
  throw new Error('This path does not reach an output. Check the connections.')
}
