import { useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'awning-task-manager-data'

const defaultData = [
  {
    id: 1,
    name: 'General',
    folders: [
      {
        id: 101,
        name: 'Office',
        tasks: [
          {
            id: 1001,
            title: 'Bring rain sensor indoors to test',
            due: '',
            completed: false,
            subtasks: [
              { id: 1, title: 'Find sensor', completed: true },
              { id: 2, title: 'Bring inside', completed: false },
              { id: 3, title: 'Test sensor', completed: false },
            ],
          },
          {
            id: 1002,
            title: 'Order redone custom brackets',
            due: '',
            completed: false,
            subtasks: [],
          },
        ],
      },
    ],
  },
  {
    id: 2,
    name: 'Jobs',
    folders: [
      {
        id: 201,
        name: 'TM-013',
        tasks: [
          {
            id: 2001,
            title: 'Install and connect rain sensor',
            due: '',
            completed: false,
            subtasks: [
              { id: 1, title: 'Install sensor', completed: false },
              { id: 2, title: 'Connect wiring', completed: false },
            ],
          },
          { id: 2002, title: 'Fix LED', due: '', completed: false, subtasks: [] },
        ],
      },
      {
        id: 202,
        name: 'TM-009',
        tasks: [{ id: 3001, title: 'Redo custom brackets', due: '', completed: false, subtasks: [] }],
      },
    ],
  },
]

export default function App() {
  const [masterCategories, setMasterCategories] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : defaultData
    } catch {
      return defaultData
    }
  })

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(masterCategories))
  }, [masterCategories])

  const allFolders = useMemo(
    () => masterCategories.flatMap((master) => master.folders.map((folder) => folder.name)),
    [masterCategories]
  )

  const allTasks = useMemo(
    () =>
      masterCategories.flatMap((master) =>
        master.folders.flatMap((folder) =>
          folder.tasks.map((task) => ({ ...task, masterName: master.name, folderName: folder.name }))
        )
      ),
    [masterCategories]
  )

  const todayIso = new Date().toISOString().slice(0, 10)
  const search = searchText.trim().toLowerCase()

  const visibleTasks = allTasks.filter((task) => {
    const matchesSearch =
      !search ||
      task.title.toLowerCase().includes(search) ||
      task.folderName.toLowerCase().includes(search) ||
      task.masterName.toLowerCase().includes(search) ||
      task.subtasks.some((sub) => sub.title.toLowerCase().includes(search))

    if (!matchesSearch) return false
    if (activeTab === 'archive') return task.completed
    if (activeTab === 'today') return !task.completed && task.due === todayIso
    if (activeTab === 'calendar') return !task.completed && task.due
    return !task.completed
  })

  const currentSelectedTask = selectedTask ? allTasks.find((task) => task.id === selectedTask.id) || selectedTask : null

  function showNoticeMessage(message) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2500)
  }

  function saveUndo(message) {
    setUndoAction({ message, snapshot: masterCategories })
    window.setTimeout(() => setUndoAction(null), 5000)
  }

  function undoLastAction() {
    if (!undoAction) return
    setMasterCategories(undoAction.snapshot)
    setUndoAction(null)
  }

  function openMasterSheet() {
    setSheetMode('master')
    setMasterNameInput('')
    setShowSheet(true)
  }

  function openFolderSheet(masterId) {
    setSheetMode('folder')
    setSelectedMasterId(masterId)
    setFolderNameInput('')
    setShowSheet(true)
  }

  function openAddTask(folderName = '') {
    setSheetMode('task')
    setSelectedTask(null)
    setTaskTitle('')
    setFolderInput(folderName)
    setDueDate('')
    setShowSheet(true)
  }

  function openTask(task) {
    setSheetMode('detail')
    setSelectedTask(task)
    setSubtaskTitle('')
    setShowTaskMenu(false)
    setShowSheet(true)
  }

  function addMasterCategory() {
    const name = masterNameInput.trim()
    if (!name) return
    setMasterCategories((prev) => [...prev, { id: Date.now(), name, folders: [] }])
    setShowSheet(false)
  }

  function addFolder() {
    const name = folderNameInput.trim()
    if (!name || !selectedMasterId) return
    setMasterCategories((prev) =>
      prev.map((master) =>
        master.id === selectedMasterId
          ? { ...master, folders: [...master.folders, { id: Date.now(), name, tasks: [] }] }
          : master
      )
    )
    setShowSheet(false)
  }

  function getMasterForFolder(folderName) {
    return folderName.toLowerCase().startsWith('tm-') ? 'Jobs' : 'General'
  }

  function addTask() {
    const cleanTitle = taskTitle.trim()
    const cleanFolder = folderInput.trim()
    if (!cleanTitle || !cleanFolder) return

    setMasterCategories((prev) => {
      let added = false
      const updated = prev.map((master) => ({
        ...master,
        folders: master.folders.map((folder) => {
          if (folder.name.toLowerCase() !== cleanFolder.toLowerCase()) return folder
          added = true
          return {
            ...folder,
            tasks: [...folder.tasks, { id: Date.now(), title: cleanTitle, due: dueDate, completed: false, subtasks: [] }],
          }
        }),
      }))

      if (added) return updated

      return updated.map((master) =>
        master.name === getMasterForFolder(cleanFolder)
          ? {
              ...master,
              folders: [
                ...master.folders,
                {
                  id: Date.now(),
                  name: cleanFolder,
                  tasks: [{ id: Date.now() + 1, title: cleanTitle, due: dueDate, completed: false, subtasks: [] }],
                },
              ],
            }
          : master
      )
    })

    setShowSheet(false)
  }

  function updateTaskTitle(taskId, title) {
    setMasterCategories((prev) =>
      prev.map((master) => ({
        ...master,
        folders: master.folders.map((folder) => ({
          ...folder,
          tasks: folder.tasks.map((task) => (task.id === taskId ? { ...task, title } : task)),
        })),
      }))
    )
  }

  function updateTaskDue(taskId, due) {
    setMasterCategories((prev) =>
      prev.map((master) => ({
        ...master,
        folders: master.folders.map((folder) => ({
          ...folder,
          tasks: folder.tasks.map((task) => (task.id === taskId ? { ...task, due } : task)),
        })),
      }))
    )
  }

  function duplicateTask(taskId) {
    const task = allTasks.find((item) => item.id === taskId)
    if (!task) return
    saveUndo(`Duplicated: ${task.title}`)
    setMasterCategories((prev) =>
      prev.map((master) => ({
        ...master,
        folders: master.folders.map((folder) => ({
          ...folder,
          tasks: folder.tasks.some((item) => item.id === taskId)
            ? [
                ...folder.tasks,
                {
                  ...task,
                  id: Date.now(),
                  title: `${task.title} copy`,
                  completed: false,
                  subtasks: task.subtasks.map((sub) => ({ ...sub, id: Date.now() + Math.random(), completed: false })),
                },
              ]
            : folder.tasks,
        })),
      }))
    )
    setShowTaskMenu(false)
  }

  function deleteTask(taskId) {
    const task = allTasks.find((item) => item.id === taskId)
    saveUndo(`Deleted: ${task?.title || 'Task'}`)
    setMasterCategories((prev) =>
      prev.map((master) => ({
        ...master,
        folders: master.folders.map((folder) => ({ ...folder, tasks: folder.tasks.filter((item) => item.id !== taskId) })),
      }))
    )
    setShowSheet(false)
  }

  function toggleTask(taskId) {
    const task = allTasks.find((item) => item.id === taskId)
    const hasOpenSubtasks = task?.subtasks?.some((sub) => !sub.completed)
    if (task && !task.completed && hasOpenSubtasks) {
      showNoticeMessage('This task still has unfinished subtasks. Finish them first.')
      return
    }

    saveUndo(task?.completed ? `Reopened: ${task.title}` : `Completed: ${task?.title || 'Task'}`)
    setMasterCategories((prev) =>
      prev.map((master) => ({
        ...master,
        folders: master.folders.map((folder) => ({
          ...folder,
          tasks: folder.tasks.map((taskItem) =>
            taskItem.id === taskId ? { ...taskItem, completed: !taskItem.completed } : taskItem
          ),
        })),
      }))
    )
  }

  function toggleSubtask(taskId, subtaskId) {
    const parentTask = allTasks.find((task) => task.id === taskId)
    const subtask = parentTask?.subtasks.find((item) => item.id === subtaskId)
    saveUndo(subtask?.completed ? `Reopened: ${subtask.title}` : `Completed: ${subtask?.title || 'Subtask'}`)

    setMasterCategories((prev) =>
      prev.map((master) => ({
        ...master,
        folders: master.folders.map((folder) => ({
          ...folder,
          tasks: folder.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  subtasks: task.subtasks.map((sub) =>
                    sub.id === subtaskId ? { ...sub, completed: !sub.completed } : sub
                  ),
                }
              : task
          ),
        })),
      }))
    )
  }

  function addSubtask() {
    const cleanTitle = subtaskTitle.trim()
    if (!cleanTitle || !currentSelectedTask) return

    setMasterCategories((prev) =>
      prev.map((master) => ({
        ...master,
        folders: master.folders.map((folder) => ({
          ...folder,
          tasks: folder.tasks.map((task) =>
            task.id === currentSelectedTask.id
              ? { ...task, subtasks: [...task.subtasks, { id: Date.now(), title: cleanTitle, completed: false }] }
              : task
          ),
        })),
      }))
    )
    setSubtaskTitle('')
  }

  function formatDue(date) {
    if (!date) return ''
    const [year, month, day] = date.split('-')
    return `${month}/${day}/${year}`
  }

  function completedSubtasks(task) {
    return task.subtasks.filter((sub) => sub.completed).length
  }

  const monthName = calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })
  const year = calendarDate.getFullYear()
  const month = calendarDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const calendarCells = Array.from({ length: firstDay + daysInMonth }, (_, index) =>
    index < firstDay ? null : index - firstDay + 1
  )

  function changeMonth(direction) {
    setCalendarDate(new Date(year, month + direction, 1))
  }

  function tasksForDay(day) {
    if (!day) return []
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return visibleTasks.filter((task) => task.due === iso)
  }

  return (
    <div className="app">
      {notice && <div className="notice">{notice}</div>}

      {undoAction && (
        <div className="undo-bar">
          <div className="truncate">{undoAction.message}</div>
          <button onClick={undoLastAction}>Undo</button>
        </div>
      )}

      <div className="page">
        <header className="header">
          <h1>Task Manager</h1>
          <button onClick={openMasterSheet} className="round-add">+</button>
        </header>

        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search tasks"
          className="search-input"
        />

        {activeTab === 'inbox' && (
          <section className="section">
            <div className="section-label">Master Categories</div>
            {masterCategories.map((master) => {
              const taskCount = master.folders.reduce(
                (total, folder) => total + folder.tasks.filter((task) => !task.completed).length,
                0
              )

              return (
                <div key={master.id} className="master-card">
                  <div className="master-head">
                    <div>
                      <div className="master-title">{master.name}</div>
                      <div className="muted small">{taskCount} open tasks</div>
                    </div>
                    <button onClick={() => openFolderSheet(master.id)} className="pill-button">+ Category</button>
                  </div>

                  <div className="folder-list">
                    {master.folders.map((folder) => (
                      <div key={folder.id} className="folder-card">
                        <div className="folder-head">
                          <div>
                            <div className="folder-title">{folder.name}</div>
                            <div className="muted tiny">{folder.tasks.filter((task) => !task.completed).length} tasks</div>
                          </div>
                          <button onClick={() => openAddTask(folder.name)} className="pill-button small-button">+ Task</button>
                        </div>

                        <div className="task-list">
                          {folder.tasks.filter((task) => !task.completed).map((task) => (
                            <div key={task.id} className="task-row">
                              <button onClick={() => toggleTask(task.id)} className="check-circle" />
                              <button
                                onClick={() => openTask({ ...task, masterName: master.name, folderName: folder.name })}
                                className="task-main"
                              >
                                <div className="task-title">{task.title}</div>
                                <div className="muted tiny">
                                  {folder.name}
                                  {task.subtasks.length > 0 && ` • ${completedSubtasks(task)}/${task.subtasks.length}`}
                                </div>
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

        {activeTab === 'today' && (
          <section className="section">
            <div className="section-label">Today</div>
            {visibleTasks.length === 0 && <div className="empty-card">No tasks for today.</div>}
            {visibleTasks.map((task) => (
              <button key={task.id} onClick={() => openTask(task)} className="list-card">
                <div className="task-title">{task.title}</div>
                <div className="muted small">{task.masterName} / {task.folderName}</div>
              </button>
            ))}
          </section>
        )}

        {activeTab === 'calendar' && (
          <section className="section">
            <div className="calendar-head">
              <button onClick={() => changeMonth(-1)}>‹</button>
              <div>{monthName}</div>
              <button onClick={() => changeMonth(1)}>›</button>
            </div>
            <div className="calendar-weekdays">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <div key={`${day}-${index}`}>{day}</div>)}
            </div>
            <div className="calendar-grid">
              {calendarCells.map((day, index) => {
                const dayTasks = tasksForDay(day)
                return (
                  <div key={index} className="calendar-cell">
                    {day && <div className="calendar-day">{day}</div>}
                    {dayTasks.slice(0, 2).map((task) => (
                      <button key={task.id} onClick={() => openTask(task)} className="calendar-task">{task.title}</button>
                    ))}
                    {dayTasks.length > 2 && <div className="more-tasks">+{dayTasks.length - 2}</div>}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {activeTab === 'archive' && (
          <section className="section">
            <div className="section-label">Archive</div>
            {visibleTasks.length === 0 && <div className="empty-card">No completed tasks.</div>}
            {visibleTasks.map((task) => (
              <div key={task.id} className="archive-card">
                <div>
                  <div className="task-title completed">{task.title}</div>
                  <div className="muted small">{task.masterName} / {task.folderName}</div>
                </div>
                <button onClick={() => toggleTask(task.id)}>Unarchive</button>
              </div>
            ))}
          </section>
        )}
      </div>

      <nav className="bottom-nav">
        {[
          ['inbox', 'Inbox', '▰'],
          ['today', 'Today', '□'],
          ['calendar', 'Calendar', '▦'],
          ['archive', 'Archive', '▣'],
        ].map(([key, label, icon]) => (
          <button key={key} onClick={() => setActiveTab(key)} className={activeTab === key ? 'active' : ''}>
            <span>{icon}</span>
            <small>{label}</small>
          </button>
        ))}
      </nav>

      {showSheet && (
        <div className="sheet-backdrop" onClick={() => setShowSheet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />

            {sheetMode === 'master' && (
              <>
                <h2>Add Master Category</h2>
                <input value={masterNameInput} onChange={(e) => setMasterNameInput(e.target.value)} placeholder="Master category name" />
                <div className="button-grid">
                  <button onClick={() => setShowSheet(false)} className="outline-button">Cancel</button>
                  <button onClick={addMasterCategory} className="primary-button">Add</button>
                </div>
              </>
            )}

            {sheetMode === 'folder' && (
              <>
                <h2>Add Category</h2>
                <input value={folderNameInput} onChange={(e) => setFolderNameInput(e.target.value)} placeholder="Category name" />
                <div className="button-grid">
                  <button onClick={() => setShowSheet(false)} className="outline-button">Cancel</button>
                  <button onClick={addFolder} className="primary-button">Add</button>
                </div>
              </>
            )}

            {sheetMode === 'task' && (
              <>
                <h2>Add Task</h2>
                <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task name" />
                <input value={folderInput} onChange={(e) => setFolderInput(e.target.value)} list="folder-options" placeholder="Category / job" />
                <datalist id="folder-options">{allFolders.map((folder) => <option key={folder} value={folder} />)}</datalist>
                <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" />
                <div className="button-grid">
                  <button onClick={() => setShowSheet(false)} className="outline-button">Cancel</button>
                  <button onClick={addTask} className="primary-button">Add Task</button>
                </div>
              </>
            )}

            {sheetMode === 'detail' && currentSelectedTask && (
              <>
                <div className="detail-head">
                  <button onClick={() => toggleTask(currentSelectedTask.id)} className="check-circle large" />
                  <div className="detail-content">
                    <div className="task-title-edit-row">
                      <input value={currentSelectedTask.title} onChange={(e) => updateTaskTitle(currentSelectedTask.id, e.target.value)} className="title-input" />
                      <div className="task-menu-wrap">
                        <button onClick={() => setShowTaskMenu((prev) => !prev)} className="menu-button">⋯</button>
                        {showTaskMenu && (
                          <div className="task-menu">
                            <button onClick={() => duplicateTask(currentSelectedTask.id)}>Duplicate task</button>
                            <button onClick={() => deleteTask(currentSelectedTask.id)} className="danger">Delete task</button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="muted small">{currentSelectedTask.masterName} / {currentSelectedTask.folderName}</div>
                    <input value={currentSelectedTask.due || ''} onChange={(e) => updateTaskDue(currentSelectedTask.id, e.target.value)} type="date" className="date-input" />
                    {currentSelectedTask.subtasks.some((sub) => !sub.completed) && (
                      <div className="warning-text">Finish all subtasks before completing.</div>
                    )}
                  </div>
                </div>

                <div className="subtask-section">
                  <div className="subtask-head">
                    <h3>Subtasks</h3>
                    <div className="muted small">{completedSubtasks(currentSelectedTask)}/{currentSelectedTask.subtasks.length}</div>
                  </div>

                  {currentSelectedTask.subtasks.map((subtask) => (
                    <div key={subtask.id} className="subtask-row">
                      <button onClick={() => toggleSubtask(currentSelectedTask.id, subtask.id)} className={subtask.completed ? 'check-circle checked' : 'check-circle'} />
                      <div className={subtask.completed ? 'completed subtask-title' : 'subtask-title'}>{subtask.title}</div>
                    </div>
                  ))}

                  <div className="add-subtask-row">
                    <input value={subtaskTitle} onChange={(e) => setSubtaskTitle(e.target.value)} placeholder="Add subtask" />
                    <button onClick={addSubtask} className="primary-button compact">Add</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
