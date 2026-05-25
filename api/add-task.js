import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function getMasterName(folderName) {
  return folderName.toLowerCase().startsWith('tm-') ? 'Jobs' : 'General'
}

function parseMessage(message) {
  const text = String(message || '').trim()
  const match = text.match(/^add\s+to\s+(.+?):\s*(.+)$/i)

  if (!match) {
    return { folder: 'Office', title: text }
  }

  return {
    folder: match[1].trim(),
    title: match[2].trim(),
  }
}

async function getOrCreateMaster(name) {
  const found = await supabase
    .from('master_categories')
    .select('*')
    .ilike('name', name)
    .maybeSingle()

  if (found.error) throw found.error
  if (found.data) return found.data

  const created = await supabase
    .from('master_categories')
    .insert({ name })
    .select()
    .single()

  if (created.error) throw created.error
  return created.data
}

async function getOrCreateFolder(name) {
  const found = await supabase
    .from('folders')
    .select('*')
    .ilike('name', name)
    .maybeSingle()

  if (found.error) throw found.error
  if (found.data) return found.data

  const master = await getOrCreateMaster(getMasterName(name))

  const created = await supabase
    .from('folders')
    .insert({
      name,
      master_category_id: master.id,
    })
    .select()
    .single()

  if (created.error) throw created.error
  return created.data
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }

  try {
    const providedSecret = req.headers['x-task-secret'] || req.body?.secret

    if (providedSecret !== process.env.TASK_API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const input = req.body?.message
      ? parseMessage(req.body.message)
      : {
          folder: req.body?.folder,
          title: req.body?.title,
        }

    const folderName = String(input.folder || '').trim()
    const title = String(input.title || '').trim()
    const dueDate = req.body?.due_date || null

    if (!folderName || !title) {
      return res.status(400).json({ error: 'Missing folder or title' })
    }

    const folder = await getOrCreateFolder(folderName)

    const inserted = await supabase
      .from('tasks')
      .insert({
        folder_id: folder.id,
        title,
        due_date: dueDate,
        completed: false,
      })
      .select()
      .single()

    if (inserted.error) throw inserted.error

    return res.status(200).json({
      success: true,
      folder,
      task: inserted.data,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
