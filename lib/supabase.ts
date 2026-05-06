import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xhjqxrgmjakkwzngertl.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoanF4cmdtamFra3d6bmdlcnRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMjcyNzMsImV4cCI6MjA5MjkwMzI3M30.9qpKNsjCnDwJAXl9dsU-A06qfFnkW3obfYrFGkUxyQI'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)