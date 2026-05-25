import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

export default function App() {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [masterCategories, setMasterCategories] = useState([])
  const [activeTab, setActiveTab] = useState('inbox')
  const [sheet, setSheet] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [newName, setNewName] = useState('')
  const [newTask, setNewTask] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [subtaskText, setSubtaskText] = useState('')
  const [notice, setNotice] = useState('')
  const [undo, setUndo] = useState(null)
  const [calendarDate, setCalendarDate] = useState(new Date())

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) loadData()
  }, [session])

  const allTasks = useMemo(() => {
    return masterCategories.flatMap((master) =>
      master.categories.flatMap((category) =>
        category.tasks.map((task) => ({
          ...task,
          masterId: master.id,
          masterName: master.name,
          categoryId: category.id,
          categoryName: category.name,
        }))
      )
    )
  }, [masterCategories])

  const todayIso = new Date().toISOString().slice(0, 10)
  const search = searchText.trim().toLowerCase()

  const visibleTasks = allTasks.filter((task) => {
    const matchesSearch =
      !search ||
      task.title.toLowerCase().includes(search) ||
      task.categoryName.toLowerCase().includes(search) ||
      task.masterName.toLowerCase().includes(search) ||
      task.subtasks.some((subtask) => subtask.title.toLowerCase().includes(search))

    if (!matchesSearch) return false
    if (activeTab === 'archive') return task.completed
    if (activeTab === 'today') return !task.completed && task.due === todayIso
    if (activeTab === 'calendar') return !task.completed && task.due
    return !task.completed
  })

  const selectedMaster = sheet?.masterId
    ? masterCategories.find((master) => master.id === sheet.masterId)
    : null

  const selectedCategory = sheet?.categoryId
    ? masterCategories
        .flatMap((master) =>
          master.categories.map((category) => ({
            ...category,
            masterId: master.id,
            masterName: master.name,
          }))
        )
        .find((category) => category.id === sheet.categoryId)
    : null

  const selectedTask = sheet?.taskId ? allTasks.find((task) => task.id === sheet.taskId) : null

  async function loadData() {
    setLoading(true)

    const [{ data: masters }, { data: folders }, { data: tasks }, { data: subtasks }] = await Promise.all([
      supabase.from('master_categories').select('*').order('id'),
      supabase.from('folders').select('*').order('id'),
      supabase.from('tasks').select('*').order('id'),
      supabase.from('subtasks').select('*').order('id'),
    ])

    const built = (masters || []).map((master) => ({
      id: master.id,
      name: master.name,
      categories: (folders || [])
        .filter((folder) => folder.master_category_id === master.id)
        .map((folder) => ({
          id: folder.id,
          name: folder.name,
          tasks: (tasks || [])
            .filter((task) => task.folder_id === folder.id)
            .map((task) => ({
              id: task.id,
              title: task.title,
              due: task.due_date || '',
              completed: Boolean(task.completed),
              subtasks: (subtasks || [])
                .filter((subtask) => subtask.task_id === task.id)
                .map((subtask) => ({
                  id: subtask.id,
                  title: subtask.title,
                  completed: Boolean(subtask.completed),
                })),
            })),
        })),
    }))

    setMasterCategories(built)
    setLoading(false)
  }

  function showNotice(message) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2500)
  }

  function saveUndo(message, action) {
    setUndo({ message, action })
    window.setTimeout(() => setUndo(null), 5000)
  }

  async function restoreUndo() {
    if (!undo) return
    await undo.action?.()
    setUndo(null)
    await loadData()
  }

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) showNotice(error.message)
  }

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) showNotice(error.message)
    else showNotice('Account created. You can sign in now.')
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
  }

  async function addMasterCategory() {
    const name = newName.trim()
    if (!name) return

    const { data, error } = await supabase.from('master_categories').insert({ name }).select().single()
    if (error) return showNotice(error.message)

    saveUndo(`Added ${name}`, async () => supabase.from('master_categories').delete().eq('id', data.id))
    setNewName('')
    setSheet(null)
    await loadData()
  }

  async function addCategory(masterId) {
    const name = newName.trim()
    if (!name) return

    const { data, error } = await supabase
      .from('folders')
      .insert({ name, master_category_id: masterId })
      .select()
      .single()

    if (error) return showNotice(error.message)

    saveUndo(`Added ${name}`, async () => supabase.from('folders').delete().eq('id', data.id))
    setNewName('')
    setSheet({ type: 'master', masterId })
    await loadData()
  }

  async function addTaskToCategory(categoryId) {
    const title = newTask.trim()
    if (!title) return

    const { data, error } = await supabase
      .from('tasks')
      .insert({ folder_id: categoryId, title, due_date: newDueDate || null, completed: false })
      .select()
      .single()

    if (error) return showNotice(error.message)

    saveUndo(`Added ${title}`, async () => supabase.from('tasks').delete().eq('id', data.id))
    setNewTask('')
    setNewDueDate('')
    setSheet({ type: 'category', categoryId })
    await loadData()
  }

  async function toggleTask(taskId) {
    const task = allTasks.find((item) => item.id === taskId)
    if (!task) return

    const hasOpenSubtasks = task.subtasks.some((subtask) => !subtask.completed)
    if (!task.completed && hasOpenSubtasks) {
      showNotice('Finish all subtasks before completing this task.')
      return
    }

    const { error } = await supabase.from('tasks').update({ completed: !task.completed }).eq('id', taskId)
    if (error) return showNotice(error.message)

    saveUndo(task.completed ? `Reopened ${task.title}` : `Completed ${task.title}`, async () =>
      supabase.from('tasks').update({ completed: task.completed }).eq('id', taskId)
    )
    await loadData()
  }

  async function toggleSubtask(taskId, subtaskId) {
    const task = allTasks.find((item) => item.id === taskId)
    const subtask = task?.subtasks.find((item) => item.id === subtaskId)
    if (!subtask) return

    const { error } = await supabase.from('subtasks').update({ completed: !subtask.completed }).eq('id', subtaskId)
    if (error) return showNotice(error.message)

    saveUndo('Updated subtask', async () =>
      supabase.from('subtasks').update({ completed: subtask.completed }).eq('id', subtaskId)
    )
    await loadData()
  }

  async function addSubtask() {
    const title = subtaskText.trim()
    if (!title || !selectedTask) return

    const { data, error } = await supabase
      .from('subtasks')
      .insert({ task_id: selectedTask.id, title, completed: false })
      .select()
      .single()

    if (error) return showNotice(error.message)

    saveUndo(`Added ${title}`, async () => supabase.from('subtasks').delete().eq('id', data.id))
    setSubtaskText('')
    await loadData()
  }

  async function updateTaskTitle(taskId, title) {
    setMasterCategories((prev) =>
      prev.map((master) => ({
        ...master,
        categories: master.categories.map((category) => ({
          ...category,
          tasks: category.tasks.map((task) => (task.id === taskId ? { ...task, title } : task)),
        })),
      }))
    )
    await supabase.from('tasks').update({ title }).eq('id', taskId)
  }

  async function updateTaskDue(taskId, due) {
    await supabase.from('tasks').update({ due_date: due || null }).eq('id', taskId)
    await loadData()
  }

  async function updateMasterName(masterId, name) {
    setMasterCategories((prev) =>
      prev.map((master) => (master.id === masterId ? { ...master, name } : master))
    )
    await supabase.from('master_categories').update({ name }).eq('id', masterId)
  }

  async function updateCategoryName(categoryId, name) {
    setMasterCategories((prev) =>
      prev.map((master) => ({
        ...master,
        categories: master.categories.map((category) =>
          category.id === categoryId ? { ...category, name } : category
        ),
      }))
    )
    await supabase.from('folders').update({ name }).eq('id', categoryId)
  }

  function completedSubtasks(task) {
    return task.subtasks.filter((subtask) => subtask.completed).length
  }

  function formatDue(date) {
    if (!date) return ''
    const [year, month, day] = date.split('-')
    return `${month}/${day}/${year}`
  }

  const year = calendarDate.getFullYear()
  const month = calendarDate.getMonth()
  const monthName = calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const calendarCells = Array.from({ length: firstDay + daysInMonth }, (_, index) =>
    index < firstDay ? null : index - firstDay + 1
  )

  function tasksForDay(day) {
    if (!day) return []
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return visibleTasks.filter((task) => task.due === iso)
  }

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
      {undo && <div className="undo-bar"><div className="truncate">{undo.message}</div><button onClick={restoreUndo}>Undo</button></div>}

      <div className="page">
        <header className="header">
          <div><h1>Task Manager</h1><button onClick={signOut} className="signout-button">Sign out</button></div>
          <button onClick={() => { setNewName(''); setSheet({ type: 'addMaster' }) }} className="round-add">+</button>
        </header>

        <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search tasks" className="search-input" />

        {activeTab === 'inbox' && (
          <section className="section">
            <div className="section-label">Master Categories</div>
            {masterCategories.length === 0 && <div className="empty-card">No categories yet. Press + to create your first master category.</div>}
            {masterCategories.map((master) => {
              const taskCount = master.categories.reduce((total, category) => total + category.tasks.filter((task) => !task.completed).length, 0)
              return (
                <div key={master.id} className="master-card">
                  <div onClick={() => setSheet({ type: 'master', masterId: master.id })} className="master-head clickable-head">
                    <div><div className="master-title">{master.name}</div><div className="muted small">{taskCount} open tasks</div></div>
                    <button onClick={(e) => { e.stopPropagation(); setNewName(''); setSheet({ type: 'addCategory', masterId: master.id }) }} className="pill-button">+ Category</button>
                  </div>

                  <div className="folder-list">
                    {master.categories.map((category) => (
                      <div key={category.id} className="folder-card">
                        <div onClick={() => setSheet({ type: 'category', categoryId: category.id })} className="folder-head clickable-head">
                          <div><div className="folder-title">{category.name}</div><div className="muted tiny">{category.tasks.filter((task) => !task.completed).length} tasks</div></div>
                          <button onClick={(e) => { e.stopPropagation(); setNewTask(''); setNewDueDate(''); setSheet({ type: 'addTask', categoryId: category.id }) }} className="pill-button small-button">+ Task</button>
                        </div>
                        <div className="task-list">
                          {category.tasks.filter((task) => !task.completed).map((task) => (
                            <div key={task.id} className="task-row">
                              <button onClick={() => toggleTask(task.id)} className="check-circle" />
                              <button onClick={() => setSheet({ type: 'task', taskId: task.id })} className="task-main">
                                <div className="task-title">{task.title}</div>
                                <div className="muted tiny">{category.name}{task.subtasks.length > 0 && ` • ${completedSubtasks(task)}/${task.subtasks.length}`}</div>
                              </button>
                              {task.due && <div className="due-text">{formatDue(task.due)}</div>}
                              <div className="chevron">›</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {activeTab === 'today' && <section className="section"><div className="section-label">Today</div>{visibleTasks.length === 0 && <div className="empty-card">No tasks for today.</div>}{visibleTasks.map((task) => <button key={task.id} onClick={() => setSheet({ type: 'task', taskId: task.id })} className="list-card"><div className="task-title">{task.title}</div><div className="muted small">{task.masterName} / {task.categoryName}</div></button>)}</section>}

        {activeTab === 'calendar' && <section className="section"><div className="calendar-head"><button onClick={() => setCalendarDate(new Date(year, month - 1, 1))}>‹</button><div>{monthName}</div><button onClick={() => setCalendarDate(new Date(year, month + 1, 1))}>›</button></div><div className="calendar-weekdays">{['S','M','T','W','T','F','S'].map((day, i) => <div key={`${day}-${i}`}>{day}</div>)}</div><div className="calendar-grid">{calendarCells.map((day, i) => { const dayTasks = tasksForDay(day); return <div key={i} className="calendar-cell">{day && <div className="calendar-day">{day}</div>}{dayTasks.slice(0, 2).map((task) => <button key={task.id} onClick={() => setSheet({ type: 'task', taskId: task.id })} className="calendar-task">{task.title}</button>)}</div> })}</div></section>}

        {activeTab === 'archive' && <section className="section"><div className="section-label">Archive</div>{visibleTasks.length === 0 && <div className="empty-card">No completed tasks.</div>}{visibleTasks.map((task) => <div key={task.id} className="archive-card"><div><div className="task-title completed">{task.title}</div><div className="muted small">{task.masterName} / {task.categoryName}</div></div><button onClick={() => toggleTask(task.id)}>Unarchive</button></div>)}</section>}
      </div>

      <nav className="bottom-nav">{[['inbox','Inbox','▰'],['today','Today','□'],['calendar','Calendar','▦'],['archive','Archive','▣']].map(([key,label,icon]) => <button key={key} onClick={() => setActiveTab(key)} className={activeTab === key ? 'active' : ''}><span>{icon}</span><small>{label}</small></button>)}</nav>

      {sheet && (
        <div className="sheet-backdrop sheet-top" onClick={() => setSheet(null)}>
          <div className="sheet sheet-approved" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />

            {sheet.type === 'addMaster' && <><h2>Add Master Category</h2><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Master category name" /><button onClick={addMasterCategory} className="primary-button full">Add</button></>}

            {sheet.type === 'addCategory' && selectedMaster && <><h2>Add Category</h2><div className="muted small">Under {selectedMaster.name}</div><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Category name" /><button onClick={() => addCategory(selectedMaster.id)} className="primary-button full">Add</button></>}

            {sheet.type === 'addTask' && selectedCategory && <><h2>Add Task</h2><div className="muted small">{selectedCategory.masterName} / {selectedCategory.name}</div><input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Task name" /><input value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} type="date" /><button onClick={() => addTaskToCategory(selectedCategory.id)} className="primary-button full">Add Task</button></>}

            {sheet.type === 'master' && selectedMaster && <><div className="detail-title-row"><input value={selectedMaster.name} onChange={(e) => updateMasterName(selectedMaster.id, e.target.value)} className="title-input" /><button onClick={() => { setNewName(''); setSheet({ type: 'addCategory', masterId: selectedMaster.id }) }} className="pill-button">+ Category</button></div><div className="muted small">Master category</div><div className="detail-list">{selectedMaster.categories.length === 0 && <div className="empty-card">No categories yet.</div>}{selectedMaster.categories.map((category) => <button key={category.id} onClick={() => setSheet({ type: 'category', categoryId: category.id })} className="detail-list-row"><div><div className="folder-title">{category.name}</div><div className="muted tiny">{category.tasks.filter((task) => !task.completed).length} tasks</div></div><span>›</span></button>)}</div></>}

            {sheet.type === 'category' && selectedCategory && <><div className="detail-title-row"><input value={selectedCategory.name} onChange={(e) => updateCategoryName(selectedCategory.id, e.target.value)} className="title-input" /><button onClick={() => { setNewTask(''); setNewDueDate(''); setSheet({ type: 'addTask', categoryId: selectedCategory.id }) }} className="pill-button">+ Task</button></div><div className="muted small">{selectedCategory.masterName}</div><div className="detail-list">{selectedCategory.tasks.filter((task) => !task.completed).length === 0 && <div className="empty-card">No tasks yet.</div>}{selectedCategory.tasks.filter((task) => !task.completed).map((task) => <div key={task.id} className="task-row detail-task-row"><button onClick={() => toggleTask(task.id)} className="check-circle" /><button onClick={() => setSheet({ type: 'task', taskId: task.id })} className="task-main"><div className="task-title">{task.title}</div><div className="muted tiny">{task.subtasks.length > 0 && `${completedSubtasks(task)}/${task.subtasks.length}`}</div></button>{task.due && <div className="due-text">{formatDue(task.due)}</div>}<div className="chevron">›</div></div>)}</div></>}

            {sheet.type === 'task' && selectedTask && <><div className="detail-head"><button onClick={() => toggleTask(selectedTask.id)} className="check-circle large" /><div className="detail-content"><input value={selectedTask.title} onChange={(e) => updateTaskTitle(selectedTask.id, e.target.value)} className="title-input" /><div className="muted small">{selectedTask.masterName} / {selectedTask.categoryName}</div><input value={selectedTask.due || ''} onChange={(e) => updateTaskDue(selectedTask.id, e.target.value)} type="date" className="date-input" />{selectedTask.subtasks.some((s) => !s.completed) && <div className="warning-text">Finish all subtasks before completing.</div>}</div></div><div className="subtask-section"><div className="subtask-head"><h3>Subtasks</h3><div className="muted small">{completedSubtasks(selectedTask)}/{selectedTask.subtasks.length}</div></div>{selectedTask.subtasks.map((subtask) => <div key={subtask.id} className="subtask-row approved-subtask-row"><button onClick={() => toggleSubtask(selectedTask.id, subtask.id)} className={subtask.completed ? 'check-circle checked' : 'check-circle'} /><div className={subtask.completed ? 'completed subtask-title' : 'subtask-title'}>{subtask.title}</div></div>)}<div className="add-subtask-row"><input value={subtaskText} onChange={(e) => setSubtaskText(e.target.value)} placeholder="Add subtask" /><button onClick={addSubtask} className="primary-button compact">Add</button></div></div></>}
          </div>
        </div>
      )}
    </div>
  )
}
