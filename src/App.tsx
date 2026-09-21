import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowRight, Braces, Check, CheckCircle2, ChevronDown, CircleAlert, Copy, CornerDownRight, Download, Grip, HelpCircle, Layers3, MessageCircle, MoreHorizontal, MousePointer2, Play, Plus, RotateCcw, Save, Settings2, ShieldCheck, Sparkles, Trash2, Upload, WandSparkles, X, Zap } from 'lucide-react'
import { type FlowEdge, type FlowNode, type NodeType, type Workflow, loadWorkflow, parseWorkflow, runWorkflow, sampleWorkflow, saveWorkflow, validate } from './model'

const NODE_WIDTH = 220
const NODE_HEIGHT = 118
const iconForType = { trigger: Zap, prompt: Sparkles, condition: Settings2, output: MessageCircle }
const typeTitle = { trigger: 'Trigger', prompt: 'Prompt', condition: 'Condition', output: 'Output' }
const typeDescription = {
  trigger: 'Start a workflow from an incoming message.',
  prompt: 'Document an instruction or processing step.',
  condition: 'Route by keywords in the input.',
  output: 'Return a final response.',
}
const configLabels = {
  trigger: 'Input name',
  prompt: 'Instructions',
  condition: 'Match any of these keywords',
  output: 'Response text',
}

function createNode(type: NodeType, count: number): FlowNode {
  const defaults = {
    trigger: ['New trigger', 'Entry point', 'Customer message'],
    prompt: ['New prompt', 'Processing step', 'Describe the task this step performs.'],
    condition: ['New condition', 'Branch by keyword', 'pricing, billing'],
    output: ['New output', 'Final response', 'Thanks for your message. We will get back to you soon.'],
  }
  return {
    id: crypto.randomUUID(), type,
    title: defaults[type][0], description: defaults[type][1], config: defaults[type][2],
    x: Math.min(1050, 100 + count * 116), y: 125 + (count % 3) * 145,
  }
}

function downloadJson(workflow: Workflow) {
  const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${workflow.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'workflow'}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function App() {
  const [workflow, setWorkflow] = useState<Workflow>(loadWorkflow)
  const [selectedId, setSelectedId] = useState<string | null>(() => window.innerWidth <= 570 ? 'start' : 'route')
  const [activeTab, setActiveTab] = useState<'editor' | 'validation'>('editor')
  const [showRun, setShowRun] = useState(false)
  const [testInput, setTestInput] = useState('I would like a refund for my order.')
  const [runResult, setRunResult] = useState<ReturnType<typeof runWorkflow> | { error: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const drag = useRef<{ id: string; x: number; y: number; startX: number; startY: number } | null>(null)
  const noticeTimer = useRef<number | null>(null)
  const issues = useMemo(() => validate(workflow), [workflow])
  const selected = workflow.nodes.find(node => node.id === selectedId) ?? null
  const outgoing = selected ? workflow.edges.filter(edge => edge.from === selected.id) : []

  useEffect(() => { saveWorkflow(workflow) }, [workflow])
  useEffect(() => () => { if (noticeTimer.current) window.clearTimeout(noticeTimer.current) }, [])

  function flash(message: string) {
    setNotice(message)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3200)
  }

  function updateWorkflow(fields: Partial<Workflow>) { setWorkflow(current => ({ ...current, ...fields })) }
  function updateNode(id: string, fields: Partial<FlowNode>) {
    setWorkflow(current => ({ ...current, nodes: current.nodes.map(node => node.id === id ? { ...node, ...fields } : node) }))
  }
  function addNode(type: NodeType) {
    const node = createNode(type, workflow.nodes.length)
    setWorkflow(current => ({ ...current, nodes: [...current.nodes, node] }))
    setSelectedId(node.id)
    setActiveTab('editor')
    flash(`${typeTitle[type]} step added`)
  }
  function duplicateNode(node: FlowNode) {
    const duplicate = { ...node, id: crypto.randomUUID(), title: `${node.title} copy`, x: Math.min(node.x + 44, 1120), y: Math.min(node.y + 136, 900) }
    setWorkflow(current => ({ ...current, nodes: [...current.nodes, duplicate] }))
    setSelectedId(duplicate.id)
    flash('Step duplicated')
  }
  function deleteNode(id: string) {
    setWorkflow(current => ({ ...current, nodes: current.nodes.filter(node => node.id !== id), edges: current.edges.filter(edge => edge.from !== id && edge.to !== id) }))
    setSelectedId(null)
    flash('Step removed')
  }
  function addEdge(to: string, label: string) {
    if (!selected || !to || to === selected.id) return
    if (workflow.edges.some(edge => edge.from === selected.id && edge.to === to && edge.label === label)) {
      flash('That connection already exists')
      return
    }
    setWorkflow(current => ({ ...current, edges: [...current.edges, { id: crypto.randomUUID(), from: selected.id, to, label }] }))
    flash('Connection added')
  }
  function updateEdge(id: string, fields: Partial<FlowEdge>) {
    setWorkflow(current => ({ ...current, edges: current.edges.map(edge => edge.id === id ? { ...edge, ...fields } : edge) }))
  }
  function deleteEdge(id: string) { setWorkflow(current => ({ ...current, edges: current.edges.filter(edge => edge.id !== id) })) }
  function resetWorkflow() {
    if (!window.confirm('Replace your current draft with the sample workflow?')) return
    setWorkflow(structuredClone(sampleWorkflow))
    setSelectedId('route')
    setActiveTab('editor')
    flash('Sample workflow restored')
  }
  async function importFile(file: File | undefined) {
    if (!file) return
    try {
      if (file.size > 1_000_000) throw new Error('Choose a JSON file smaller than 1 MB.')
      const parsed = parseWorkflow(JSON.parse(await file.text()))
      setWorkflow(parsed)
      setSelectedId(parsed.nodes[0]?.id ?? null)
      setActiveTab('editor')
      flash('Workflow imported')
    } catch (error) { flash(error instanceof Error ? error.message : 'Could not import this file.') }
    if (fileInput.current) fileInput.current.value = ''
  }
  function startDrag(event: React.PointerEvent<HTMLDivElement>, node: FlowNode) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { id: node.id, x: event.clientX, y: event.clientY, startX: node.x, startY: node.y }
    setSelectedId(node.id)
  }
  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const { id, x, y, startX, startY } = drag.current
    updateNode(id, { x: Math.max(8, Math.min(1260, Math.round((startX + event.clientX - x) / 8) * 8)), y: Math.max(8, Math.min(920, Math.round((startY + event.clientY - y) / 8) * 8)) })
  }
  function endDrag() { drag.current = null }
  function testRun() {
    try { setRunResult(runWorkflow(workflow, testInput)) }
    catch (error) { setRunResult({ error: error instanceof Error ? error.message : 'Could not run this workflow.' }) }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Layers3 size={19} strokeWidth={2.5} /></span><span>flow<span className="brand-light">canvas</span></span><span className="brand-beta">BETA</span></div>
        <div className="top-divider" />
        <div className="breadcrumbs"><span>Workspace</span><ArrowRight size={13} /><strong>Workflow editor</strong></div>
        <div className="top-spacer" />
        <span className="saved"><Check size={14} /> Saved in this browser</span>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={event => void importFile(event.target.files?.[0])} />
        <button className="button ghost top-action" onClick={() => fileInput.current?.click()}><Upload size={15} /> Import</button>
        <button className="button ghost top-action" onClick={() => { downloadJson(workflow); flash('JSON exported') }}><Download size={15} /> Export</button>
        <div className="avatar" title="Local workspace">JG</div>
      </header>

      <main>
        <section className="project-head">
          <div className="project-copy">
            <div className="eyebrow"><span className="live-dot" /> WORKFLOW STUDIO <span className="eyebrow-separator">/</span> LOCAL DRAFT</div>
            <div className="name-line"><input aria-label="Workflow name" className="workflow-name" value={workflow.name} onChange={event => updateWorkflow({ name: event.target.value })} maxLength={100} /><ChevronDown size={19} className="name-chevron" /></div>
            <input aria-label="Workflow description" className="workflow-description" value={workflow.description} onChange={event => updateWorkflow({ description: event.target.value })} maxLength={300} />
          </div>
          <div className="head-actions"><button className="button secondary" onClick={resetWorkflow}><RotateCcw size={15} /> Reset sample</button><button className="button primary" onClick={() => { setShowRun(true); setRunResult(null) }}><Play size={15} fill="currentColor" /> Test workflow</button></div>
        </section>

        <section className="workspace" aria-label="Workflow editor">
          <aside className="left-panel">
            <div className="panel-heading"><span>BUILD YOUR FLOW</span><MoreHorizontal size={18} /></div>
            <div className="step-heading">STEP LIBRARY</div>
            <div className="palette">
              {(['trigger', 'prompt', 'condition', 'output'] as NodeType[]).map(type => {
                const Icon = iconForType[type]
                return <button className="palette-item" key={type} onClick={() => addNode(type)}><span className={`palette-icon ${type}`}><Icon size={17} /></span><span className="palette-copy"><strong>{typeTitle[type]}</strong><small>{typeDescription[type]}</small></span><Plus size={16} className="palette-add" /></button>
              })}
            </div>
            <div className="sidebar-rule" />
            <div className="step-heading">OVERVIEW</div>
            <div className="overview-card"><span className="overview-icon"><Activity size={17} /></span><div><strong>{workflow.nodes.length} steps</strong><small>{workflow.edges.length} connections</small></div><span className="overview-mini"><ArrowRight size={14} /></span></div>
            <button className="sample-link" onClick={resetWorkflow}><WandSparkles size={15} /> Load example workflow <ArrowRight size={14} /></button>
            <div className="sidebar-tip"><div className="tip-icon"><HelpCircle size={17} /></div><strong>Make it your own</strong><p>Drag steps to rearrange them. Select a step to edit its content and connections.</p></div>
          </aside>

          <div className="center-panel">
            <div className="canvas-toolbar"><div className="tabs"><button className={activeTab === 'editor' ? 'tab active' : 'tab'} onClick={() => setActiveTab('editor')}><Grip size={15} /> Canvas</button><button className={activeTab === 'validation' ? 'tab active' : 'tab'} onClick={() => setActiveTab('validation')}><ShieldCheck size={15} /> Validation <span className={issues.length ? 'issue-count' : 'issue-count good'}>{issues.length}</span></button></div><div className="canvas-tools"><span><MousePointer2 size={14} /> Select & drag</span><span className="tool-separator" /><span className="zoom-chip">100%</span></div></div>
            {activeTab === 'editor' ? <div className="canvas-scroll"><div className="canvas-stage" onClick={() => setSelectedId(null)}>
              <div className="canvas-watermark"><Braces size={15} /> WORKFLOW CANVAS <span>·</span> DRAG TO ARRANGE</div>
              <svg className="edges" width="1500" height="1120" aria-hidden="true"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" /></marker></defs>{workflow.edges.map(edge => {
                const from = workflow.nodes.find(node => node.id === edge.from)
                const to = workflow.nodes.find(node => node.id === edge.to)
                if (!from || !to) return null
                const x1 = from.x + NODE_WIDTH, y1 = from.y + NODE_HEIGHT / 2
                const x2 = to.x, y2 = to.y + NODE_HEIGHT / 2
                const distance = Math.max(55, Math.abs(x2 - x1) / 2)
                const path = `M ${x1} ${y1} C ${x1 + distance} ${y1}, ${x2 - distance} ${y2}, ${x2} ${y2}`
                return <g key={edge.id}><path className="edge-path" d={path} markerEnd="url(#arrow)" />{edge.label && <g transform={`translate(${(x1 + x2) / 2 - 16},${(y1 + y2) / 2 - 13})`}><rect className="edge-label-bg" width="36" height="23" rx="7" /><text className="edge-label" x="18" y="16" textAnchor="middle">{edge.label}</text></g>}</g>
              })}</svg>
              {workflow.nodes.map(node => {
                const Icon = iconForType[node.type]
                const nodeIssues = issues.filter(issue => issue.nodeId === node.id).length
                return <div key={node.id} className={`flow-node ${node.type} ${selectedId === node.id ? 'selected' : ''}`} style={{ left: node.x, top: node.y }} onClick={event => { event.stopPropagation(); setSelectedId(node.id) }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(node.id) } }} tabIndex={0} role="button" aria-label={`Edit ${node.title} step`}>
                  <div className="node-drag" onPointerDown={event => startDrag(event, node)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}><span className={`node-icon ${node.type}`}><Icon size={16} strokeWidth={2.4} /></span><span className="node-type">{typeTitle[node.type]}</span><Grip size={15} className="node-grip" /></div>
                  <div className="node-body"><strong>{node.title || 'Untitled step'}</strong><small>{node.description || 'Add a description'}</small></div>
                  <span className="node-input" /><span className="node-output" />{nodeIssues > 0 && <span className="node-warning" title={`${nodeIssues} validation issue(s)`}><CircleAlert size={13} /></span>}
                </div>
              })}
              {workflow.nodes.length === 0 && <div className="empty-canvas"><Layers3 size={30} /><h3>Start with a trigger</h3><p>Add steps from the library to build your workflow.</p><button className="button primary" onClick={event => { event.stopPropagation(); addNode('trigger') }}><Plus size={15} /> Add trigger</button></div>}
              <div className="canvas-corner"><span className="corner-dot" /> Changes save automatically to your browser</div>
            </div></div> : <div className="validation-view"><div className="validation-header"><span className={issues.length ? 'validation-icon warning' : 'validation-icon'}>{issues.length ? <CircleAlert size={21} /> : <CheckCircle2 size={21} />}</span><div><h2>{issues.length ? `${issues.length} things to review` : 'Ready to test'}</h2><p>{issues.length ? 'Review these items before sharing your workflow.' : 'All structural checks passed. Try a test message to explore the path.'}</p></div></div><div className="validation-list">{issues.length ? issues.map((issue, index) => <button key={`${issue.nodeId}-${index}`} className="validation-row" onClick={() => { setSelectedId(issue.nodeId ?? null); setActiveTab('editor') }}><CircleAlert size={17} /><span>{issue.message}</span><ArrowRight size={15} /></button>) : <div className="validation-success"><CheckCircle2 size={18} /> Trigger, connections and outputs are configured.</div>}</div><div className="validation-note"><HelpCircle size={16} /> Checks cover the workflow structure. Test runs show the exact route taken for a sample message.</div></div>}
          </div>

          <aside className="right-panel">
            <div className="inspector-head"><div><span className="panel-heading-text">INSPECTOR</span><small>{selected ? 'Edit step settings' : 'Select a step'}</small></div><button className="icon-button" aria-label="Deselect step" onClick={() => setSelectedId(null)}><X size={17} /></button></div>
            {selected ? <div className="inspector-content"><div className="inspector-step"><span className={`inspector-type-icon ${selected.type}`}>{(() => { const Icon = iconForType[selected.type]; return <Icon size={20} /> })()}</span><div><span className="small-label">SELECTED STEP</span><strong>{selected.title || 'Untitled step'}</strong><small>{typeTitle[selected.type]} step</small></div></div>
              <div className="inspector-section"><div className="section-caption">GENERAL</div><label className="field-label" htmlFor="step-title">Step name</label><input id="step-title" className="field" value={selected.title} onChange={event => updateNode(selected.id, { title: event.target.value })} maxLength={100} /><label className="field-label" htmlFor="step-desc">Description</label><input id="step-desc" className="field" value={selected.description} onChange={event => updateNode(selected.id, { description: event.target.value })} maxLength={200} /></div>
              <div className="inspector-section"><div className="section-caption">CONFIGURATION</div><label className="field-label" htmlFor="step-config">{configLabels[selected.type]}</label>{selected.type === 'trigger' ? <input id="step-config" className="field" value={selected.config} onChange={event => updateNode(selected.id, { config: event.target.value })} /> : <textarea id="step-config" className="field textarea" rows={selected.type === 'output' ? 5 : 4} value={selected.config} onChange={event => updateNode(selected.id, { config: event.target.value })} />}{selected.type === 'condition' && <p className="field-hint">Comma-separated terms. The test run checks whether the input contains any term, ignoring case.</p>}{selected.type === 'prompt' && <p className="field-hint">This step documents the instruction. The local test runner does not call an AI service.</p>}</div>
              {selected.type !== 'output' && <div className="inspector-section connections"><div className="section-caption">CONNECTIONS <span>{outgoing.length}</span></div>{outgoing.map(edge => <div className="connection-row" key={edge.id}><CornerDownRight size={15} /><span className="connection-target">{workflow.nodes.find(node => node.id === edge.to)?.title ?? 'Missing step'}</span>{selected.type === 'condition' ? <select aria-label="Connection branch" value={edge.label} onChange={event => updateEdge(edge.id, { label: event.target.value })}><option value="">—</option><option value="yes">yes</option><option value="no">no</option></select> : null}<button className="subtle-icon" title="Remove connection" aria-label="Remove connection" onClick={() => deleteEdge(edge.id)}><X size={14} /></button></div>)}<div className="add-connection"><select aria-label="Connect to step" defaultValue="" key={selected.id} id="target-step"><option value="" disabled>Connect to step...</option>{workflow.nodes.filter(node => node.id !== selected.id).map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select>{selected.type === 'condition' && <select aria-label="New connection branch" defaultValue="yes" id="branch-label"><option value="yes">yes</option><option value="no">no</option></select>}<button className="add-edge-button" title="Add connection" aria-label="Add connection" onClick={() => { const to = (document.getElementById('target-step') as HTMLSelectElement | null)?.value ?? ''; const label = selected.type === 'condition' ? (document.getElementById('branch-label') as HTMLSelectElement | null)?.value ?? '' : ''; addEdge(to, label) }}><Plus size={16} /></button></div></div>}
              <div className="inspector-bottom"><button onClick={() => duplicateNode(selected)}><Copy size={15} /> Duplicate step</button><button className="delete-action" onClick={() => deleteNode(selected.id)}><Trash2 size={15} /> Delete</button></div>
            </div> : <div className="inspector-empty"><span><MousePointer2 size={23} /></span><h3>Select a step</h3><p>Click any step on the canvas to edit its settings and connections.</p></div>}
          </aside>
        </section>
        <footer className="statusbar"><div><span className="status-green" /> LOCAL WORKSPACE <span className="status-divider">|</span> <Save size={13} /> Autosaved</div><div><span>{workflow.nodes.length} STEPS</span><span>{workflow.edges.length} CONNECTIONS</span><span className={issues.length ? 'footer-warning' : 'footer-good'}>{issues.length ? <CircleAlert size={13} /> : <CheckCircle2 size={13} />}{issues.length ? `${issues.length} ISSUES` : 'READY TO TEST'}</span></div></footer>
      </main>

      {notice && <div role="status" className="toast"><CheckCircle2 size={17} /> {notice}</div>}
      {showRun && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowRun(false) }}><div className="run-modal" role="dialog" aria-modal="true" aria-labelledby="run-title"><div className="modal-head"><div className="modal-symbol"><Play size={19} fill="currentColor" /></div><div><span>LOCAL SIMULATOR</span><h2 id="run-title">Test your workflow</h2></div><button className="icon-button" onClick={() => setShowRun(false)} aria-label="Close test window"><X size={20} /></button></div><div className="modal-body"><label className="field-label" htmlFor="test-input">Customer message</label><textarea id="test-input" className="field test-textarea" value={testInput} onChange={event => { setTestInput(event.target.value); setRunResult(null) }} placeholder="Type a sample message..." rows={4} /><div className="example-row"><span>TRY AN EXAMPLE</span><button onClick={() => { setTestInput('I would like a refund for my order.'); setRunResult(null) }}>Refund request</button><button onClick={() => { setTestInput('Where can I update my shipping address?'); setRunResult(null) }}>General question</button></div><button className="button primary run-button" onClick={testRun}><Play size={15} fill="currentColor" /> Run test <ArrowRight size={16} /></button>{runResult && ('error' in runResult ? <div className="run-error"><CircleAlert size={17} /> {runResult.error}</div> : <div className="run-output"><div className="run-output-head"><CheckCircle2 size={18} /><strong>Response generated</strong><span>{runResult.path.length} steps</span></div><div className="run-path">{runResult.path.map((id, index) => <span key={id}>{workflow.nodes.find(node => node.id === id)?.title ?? id}{index < runResult.path.length - 1 && <ArrowRight size={13} />}</span>)}</div><div className="output-text"><span>FINAL OUTPUT · {runResult.outcome.toUpperCase()}</span><p>{runResult.answer}</p></div></div>)}</div><div className="modal-foot"><ShieldCheck size={15} /> Runs entirely in your browser · No API key required</div></div></div>}
    </div>
  )
}
