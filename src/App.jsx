import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

const defaultData = [
  { name: 'General', folders: [{ name: 'Office', tasks: [{ title: 'Bring rain sensor indoors to test', due: '', subtasks: ['Find sensor', 'Bring inside', 'Test sensor'] }, { title: 'Order redone custom brackets', due: '', subtasks: [] }] }] },
  { name: 'Jobs', folders: [{ name: 'TM-013', tasks: [{ title: 'Install and connect rain sensor', due: '', subtasks: ['Install sensor', 'Connect wiring'] }, { title: 'Fix LED', due: '', subtasks: [] }] }, { name: 'TM-009', tasks: [{ title: 'Redo custom brackets', due: '', subtasks: [] }] }] },
]

export default function App() {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [masterCategories, setMasterCategories] = useState([])
  const [activeTab, setActiveTab] = useState('inbox')
  const [showSheet, setShowSheet] = useState(false)
  const [sheetMode, setSheetMode] = useState('task')
  const [selectedTask, setSelectedTask] = useState(null)
  const [selectedMasterId, setSelectedMasterId] = useState(null)
  const [taskTitle, setTaskTitle] = useState('')
  const [folderInput, setFolderInput] = useState('')
  const [masterNameInput, setMasterNameInput] = useState('')
  const [folderNameInput, setFolderNameInput] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [notice, setNotice] = useState('')
  const [undoAction, setUndoAction] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [showTaskMenu, setShowTaskMenu] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) loadData()
  }, [session])

  const allFolders = useMemo(() => masterCategories.flatMap((m) => m.folders.map((f) => f.name)), [masterCategories])
  const allTasks = useMemo(() => masterCategories.flatMap((m) => m.folders.flatMap((f) => f.tasks.map((t) => ({ ...t, masterName: m.name, folderName: f.name, folderId: f.id })))), [masterCategories])
  const todayIso = new Date().toISOString().slice(0, 10)
  const search = searchText.trim().toLowerCase()
  const visibleTasks = allTasks.filter((task) => {
    const match = !search || task.title.toLowerCase().includes(search) || task.folderName.toLowerCase().includes(search) || task.masterName.toLowerCase().includes(search) || task.subtasks.some((s) => s.title.toLowerCase().includes(search))
    if (!match) return false
    if (activeTab === 'archive') return task.completed
    if (activeTab === 'today') return !task.completed && task.due === todayIso
    if (activeTab === 'calendar') return !task.completed && task.due
    return !task.completed
  })
  const currentSelectedTask = selectedTask ? allTasks.find((t) => t.id === selectedTask.id) || selectedTask : null

  async function loadData() {
    setLoading(true)
    const [{ data: masters }, { data: folders }, { data: tasks }, { data: subtasks }] = await Promise.all([
      supabase.from('master_categories').select('*').order('id'),
      supabase.from('folders').select('*').order('id'),
      supabase.from('tasks').select('*').order('id'),
      supabase.from('subtasks').select('*').order('id'),
    ])

    if (!masters || masters.length === 0) {
      await seedData()
      return loadData()
    }

    const built = masters.map((m) => ({
      id: m.id,
      name: m.name,
      folders: (folders || []).filter((f) => f.master_category_id === m.id).map((f) => ({
        id: f.id,
        name: f.name,
        tasks: (tasks || []).filter((t) => t.folder_id === f.id).map((t) => ({
          id: t.id,
          title: t.title,
          due: t.due_date || '',
          completed: Boolean(t.completed),
          subtasks: (subtasks || []).filter((s) => s.task_id === t.id).map((s) => ({ id: s.id, title: s.title, completed: Boolean(s.completed) })),
        })),
      })),
    }))
    setMasterCategories(built)
    setLoading(false)
  }

  async function seedData() {
    for (const master of defaultData) {
      const { data: newMaster } = await supabase.from('master_categories').insert({ name: master.name }).select().single()
      for (const folder of master.folders) {
        const { data: newFolder } = await supabase.from('folders').insert({ name: folder.name, master_category_id: newMaster.id }).select().single()
        for (const task of folder.tasks) {
          const { data: newTask } = await supabase.from('tasks').insert({ title: task.title, folder_id: newFolder.id, due_date: task.due || null, completed: false }).select().single()
          if (task.subtasks.length) await supabase.from('subtasks').insert(task.subtasks.map((title) => ({ title, task_id: newTask.id, completed: false })))
        }
      }
    }
  }

  function showNoticeMessage(message) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2500)
  }

  function saveUndo(message, action) {
    setUndoAction({ message, action })
    window.setTimeout(() => setUndoAction(null), 5000)
  }

  async function undoLastAction() {
    if (!undoAction) return
    await undoAction.action?.()
    setUndoAction(null)
    await loadData()
  }

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) showNoticeMessage(error.message)
  }

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) showNoticeMessage(error.message)
    else showNoticeMessage('Account created. You can sign in now.')
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
  }

  function openMasterSheet() { setSheetMode('master'); setMasterNameInput(''); setShowSheet(true) }
  function openFolderSheet(masterId) { setSheetMode('folder'); setSelectedMasterId(masterId); setFolderNameInput(''); setShowSheet(true) }
  function openAddTask(folderName = '') { setSheetMode('task'); setSelectedTask(null); setTaskTitle(''); setFolderInput(folderName); setDueDate(''); setShowSheet(true) }
  function openTask(task) { setSheetMode('detail'); setSelectedTask(task); setSubtaskTitle(''); setShowTaskMenu(false); setShowSheet(true) }

  async function addMasterCategory() {
    const name = masterNameInput.trim()
    if (!name) return
    await supabase.from('master_categories').insert({ name })
    setShowSheet(false)
    await loadData()
  }

  async function addFolder() {
    const name = folderNameInput.trim()
    if (!name || !selectedMasterId) return
    await supabase.from('folders').insert({ name, master_category_id: selectedMasterId })
    setShowSheet(false)
    await loadData()
  }

  function getMasterForFolder(folderName) { return folderName.toLowerCase().startsWith('tm-') ? 'Jobs' : 'General' }

  async function getOrCreateFolder(folderName) {
    const existing = masterCategories.flatMap((m) => m.folders).find((f) => f.name.toLowerCase() === folderName.toLowerCase())
    if (existing) return existing.id
    let master = masterCategories.find((m) => m.name === getMasterForFolder(folderName)) || masterCategories[0]
    if (!master) {
      const { data } = await supabase.from('master_categories').insert({ name: 'General' }).select().single()
      master = data
    }
    const { data: folder } = await supabase.from('folders').insert({ name: folderName, master_category_id: master.id }).select().single()
    return folder.id
  }

  async function addTask() {
    const cleanTitle = taskTitle.trim()
    const cleanFolder = folderInput.trim()
    if (!cleanTitle || !cleanFolder) return
    const folderId = await getOrCreateFolder(cleanFolder)
    await supabase.from('tasks').insert({ title: cleanTitle, folder_id: folderId, due_date: dueDate || null, completed: false })
    setShowSheet(false)
    await loadData()
  }

  function updateTaskTitleLocal(taskId, title) {
    setMasterCategories((prev) => prev.map((m) => ({ ...m, folders: m.folders.map((f) => ({ ...f, tasks: f.tasks.map((t) => t.id === taskId ? { ...t, title } : t) })) })))
  }

  async function saveTaskTitle(taskId, title) { await supabase.from('tasks').update({ title }).eq('id', taskId) }
  async function updateTaskDue(taskId, due) { await supabase.from('tasks').update({ due_date: due || null }).eq('id', taskId); await loadData() }

  async function duplicateTask(taskId) {
    const task = allTasks.find((item) => item.id === taskId)
    if (!task) return
    const { data: newTask } = await supabase.from('tasks').insert({ title: `${task.title} copy`, folder_id: task.folderId, due_date: task.due || null, completed: false }).select().single()
    if (task.subtasks.length) await supabase.from('subtasks').insert(task.subtasks.map((s) => ({ title: s.title, task_id: newTask.id, completed: false })))
    saveUndo(`Duplicated: ${task.title}`, async () => supabase.from('tasks').delete().eq('id', newTask.id))
    setShowTaskMenu(false)
    await loadData()
  }

  async function deleteTask(taskId) {
    const task = allTasks.find((item) => item.id === taskId)
    if (!task) return
    await supabase.from('tasks').delete().eq('id', taskId)
    saveUndo(`Deleted: ${task.title}`, async () => {
      const { data: newTask } = await supabase.from('tasks').insert({ title: task.title, folder_id: task.folderId, due_date: task.due || null, completed: task.completed }).select().single()
      if (task.subtasks.length) await supabase.from('subtasks').insert(task.subtasks.map((s) => ({ title: s.title, task_id: newTask.id, completed: s.completed })))
    })
    setShowSheet(false)
    await loadData()
  }

  async function toggleTask(taskId) {
    const task = allTasks.find((item) => item.id === taskId)
    const hasOpenSubtasks = task?.subtasks?.some((s) => !s.completed)
    if (task && !task.completed && hasOpenSubtasks) return showNoticeMessage('This task still has unfinished subtasks. Finish them first.')
    await supabase.from('tasks').update({ completed: !task.completed }).eq('id', taskId)
    saveUndo(task.completed ? `Reopened: ${task.title}` : `Completed: ${task.title}`, async () => supabase.from('tasks').update({ completed: task.completed }).eq('id', taskId))
    await loadData()
  }

  async function toggleSubtask(taskId, subtaskId) {
    const task = allTasks.find((t) => t.id === taskId)
    const subtask = task?.subtasks.find((s) => s.id === subtaskId)
    if (!subtask) return
    await supabase.from('subtasks').update({ completed: !subtask.completed }).eq('id', subtaskId)
    saveUndo(subtask.completed ? `Reopened: ${subtask.title}` : `Completed: ${subtask.title}`, async () => supabase.from('subtasks').update({ completed: subtask.completed }).eq('id', subtaskId))
    await loadData()
  }

  async function addSubtask() {
    const cleanTitle = subtaskTitle.trim()
    if (!cleanTitle || !currentSelectedTask) return
    await supabase.from('subtasks').insert({ title: cleanTitle, task_id: currentSelectedTask.id, completed: false })
    setSubtaskTitle('')
    await loadData()
  }

  function formatDue(date) { if (!date) return ''; const [y, m, d] = date.split('-'); return `${m}/${d}/${y}` }
  function completedSubtasks(task) { return task.subtasks.filter((s) => s.completed).length }

  const monthName = calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })
  const year = calendarDate.getFullYear()
  const month = calendarDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const calendarCells = Array.from({ length: firstDay + daysInMonth }, (_, i) => i < firstDay ? null : i - firstDay + 1)
  function changeMonth(direction) { setCalendarDate(new Date(year, month + direction, 1)) }
  function tasksForDay(day) { if (!day) return []; const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return visibleTasks.filter((t) => t.due === iso) }

  if (loading) return <div className="app"><div className="page">Loading...</div></div>

  if (!session) {
    return (
      <div className="app">
        {notice && <div className="notice">{notice}</div>}
        <div className="page auth-page">
          <div className="auth-card">
            <h1>Task Manager</h1>
            <p className="muted small">Sign in with email to sync your tasks.</p>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
            <button onClick={signIn} className="primary-button full">Sign In</button>
            <button onClick={signUp} className="outline-button full">Create Account</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {notice && <div className="notice">{notice}</div>}
      {undoAction && <div className="undo-bar"><div className="truncate">{undoAction.message}</div><button onClick={undoLastAction}>Undo</button></div>}
      <div className="page">
        <header className="header">
          <div><h1>Task Manager</h1><button onClick={signOut} className="signout-button">Sign out</button></div>
          <button onClick={openMasterSheet} className="round-add">+</button>
        </header>
        <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search tasks" className="search-input" />
        {activeTab === 'inbox' && <section className="section"><div className="section-label">Master Categories</div>{masterCategories.map((master) => { const taskCount = master.folders.reduce((total, folder) => total + folder.tasks.filter((task) => !task.completed).length, 0); return <div key={master.id} className="master-card"><div className="master-head"><div><div className="master-title">{master.name}</div><div className="muted small">{taskCount} open tasks</div></div><button onClick={() => openFolderSheet(master.id)} className="pill-button">+ Category</button></div><div className="folder-list">{master.folders.map((folder) => <div key={folder.id} className="folder-card"><div className="folder-head"><div><div className="folder-title">{folder.name}</div><div className="muted tiny">{folder.tasks.filter((task) => !task.completed).length} tasks</div></div><button onClick={() => openAddTask(folder.name)} className="pill-button small-button">+ Task</button></div><div className="task-list">{folder.tasks.filter((task) => !task.completed).map((task) => <div key={task.id} className="task-row"><button onClick={() => toggleTask(task.id)} className="check-circle" /><button onClick={() => openTask({ ...task, masterName: master.name, folderName: folder.name, folderId: folder.id })} className="task-main"><div className="task-title">{task.title}</div><div className="muted tiny">{folder.name}{task.subtasks.length > 0 && ` • ${completedSubtasks(task)}/${task.subtasks.length}`}</div></button>{task.due && <div className="due-text">{formatDue(task.due)}</div>}<div className="chevron">›</div></div>)}</div></div>)}</div></div> })}</section>}
        {activeTab === 'today' && <section className="section"><div className="section-label">Today</div>{visibleTasks.length === 0 && <div className="empty-card">No tasks for today.</div>}{visibleTasks.map((task) => <button key={task.id} onClick={() => openTask(task)} className="list-card"><div className="task-title">{task.title}</div><div className="muted small">{task.masterName} / {task.folderName}</div></button>)}</section>}
        {activeTab === 'calendar' && <section className="section"><div className="calendar-head"><button onClick={() => changeMonth(-1)}>‹</button><div>{monthName}</div><button onClick={() => changeMonth(1)}>›</button></div><div className="calendar-weekdays">{['S','M','T','W','T','F','S'].map((day, i) => <div key={`${day}-${i}`}>{day}</div>)}</div><div className="calendar-grid">{calendarCells.map((day, i) => { const dayTasks = tasksForDay(day); return <div key={i} className="calendar-cell">{day && <div className="calendar-day">{day}</div>}{dayTasks.slice(0, 2).map((task) => <button key={task.id} onClick={() => openTask(task)} className="calendar-task">{task.title}</button>)}{dayTasks.length > 2 && <div className="more-tasks">+{dayTasks.length - 2}</div>}</div> })}</div></section>}
        {activeTab === 'archive' && <section className="section"><div className="section-label">Archive</div>{visibleTasks.length === 0 && <div className="empty-card">No completed tasks.</div>}{visibleTasks.map((task) => <div key={task.id} className="archive-card"><div><div className="task-title completed">{task.title}</div><div className="muted small">{task.masterName} / {task.folderName}</div></div><button onClick={() => toggleTask(task.id)}>Unarchive</button></div>)}</section>}
      </div>
      <nav className="bottom-nav">{[['inbox','Inbox','▰'],['today','Today','□'],['calendar','Calendar','▦'],['archive','Archive','▣']].map(([key,label,icon]) => <button key={key} onClick={() => setActiveTab(key)} className={activeTab === key ? 'active' : ''}><span>{icon}</span><small>{label}</small></button>)}</nav>
      {showSheet && <div className="sheet-backdrop" onClick={() => setShowSheet(false)}><div className="sheet" onClick={(e) => e.stopPropagation()}><div className="sheet-handle" />{sheetMode === 'master' && <><h2>Add Master Category</h2><input value={masterNameInput} onChange={(e) => setMasterNameInput(e.target.value)} placeholder="Master category name" /><div className="button-grid"><button onClick={() => setShowSheet(false)} className="outline-button">Cancel</button><button onClick={addMasterCategory} className="primary-button">Add</button></div></>}{sheetMode === 'folder' && <><h2>Add Category</h2><input value={folderNameInput} onChange={(e) => setFolderNameInput(e.target.value)} placeholder="Category name" /><div className="button-grid"><button onClick={() => setShowSheet(false)} className="outline-button">Cancel</button><button onClick={addFolder} className="primary-button">Add</button></div></>}{sheetMode === 'task' && <><h2>Add Task</h2><input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task name" /><input value={folderInput} onChange={(e) => setFolderInput(e.target.value)} list="folder-options" placeholder="Category / job" /><datalist id="folder-options">{allFolders.map((folder) => <option key={folder} value={folder} />)}</datalist><input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" /><div className="button-grid"><button onClick={() => setShowSheet(false)} className="outline-button">Cancel</button><button onClick={addTask} className="primary-button">Add Task</button></div></>}{sheetMode === 'detail' && currentSelectedTask && <><div className="detail-head"><button onClick={() => toggleTask(currentSelectedTask.id)} className="check-circle large" /><div className="detail-content"><div className="task-title-edit-row"><input value={currentSelectedTask.title} onChange={(e) => updateTaskTitleLocal(currentSelectedTask.id, e.target.value)} onBlur={(e) => saveTaskTitle(currentSelectedTask.id, e.target.value)} className="title-input" /><div className="task-menu-wrap"><button onClick={() => setShowTaskMenu((prev) => !prev)} className="menu-button">⋯</button>{showTaskMenu && <div className="task-menu"><button onClick={() => duplicateTask(currentSelectedTask.id)}>Duplicate task</button><button onClick={() => deleteTask(currentSelectedTask.id)} className="danger">Delete task</button></div>}</div></div><div className="muted small">{currentSelectedTask.masterName} / {currentSelectedTask.folderName}</div><input value={currentSelectedTask.due || ''} onChange={(e) => updateTaskDue(currentSelectedTask.id, e.target.value)} type="date" className="date-input" />{currentSelectedTask.subtasks.some((s) => !s.completed) && <div className="warning-text">Finish all subtasks before completing.</div>}</div></div><div className="subtask-section"><div className="subtask-head"><h3>Subtasks</h3><div className="muted small">{completedSubtasks(currentSelectedTask)}/{currentSelectedTask.subtasks.length}</div></div>{currentSelectedTask.subtasks.map((subtask) => <div key={subtask.id} className="subtask-row"><button onClick={() => toggleSubtask(currentSelectedTask.id, subtask.id)} className={subtask.completed ? 'check-circle checked' : 'check-circle'} /><div className={subtask.completed ? 'completed subtask-title' : 'subtask-title'}>{subtask.title}</div></div>)}<div className="add-subtask-row"><input value={subtaskTitle} onChange={(e) => setSubtaskTitle(e.target.value)} placeholder="Add subtask" /><button onClick={addSubtask} className="primary-button compact">Add</button></div></div></>}</div></div>}
    </div>
  )
}
