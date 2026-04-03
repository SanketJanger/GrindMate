import { useState, useEffect } from 'react'
import { LayoutDashboard, MessageSquare, LogIn, LogOut, User, Download } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Import from './pages/Import'

function App() {
  const [page, setPage] = useState<'dashboard' | 'chat' | 'import'>('dashboard')
  const [user, setUser] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/me')
      const data = await res.json()
      setUser(data.user?.id || null)
    } catch (err) {
      console.error('Auth check failed:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center">
        <h1 className="text-4xl font-bold mb-4">GrindMate</h1>
        <p className="text-gray-400 mb-8">Track your LeetCode progress with AI</p>
        <a
          href="/auth/login"
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-6 py-3 rounded-lg transition"
        >
          <LogIn className="w-5 h-5" />
          Login with GitHub
        </a>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 flex">
      <div className="w-16 bg-gray-800 flex flex-col items-center py-4 gap-4">
        <button
          onClick={() => setPage('dashboard')}
          className={`p-3 rounded-lg transition ${page === 'dashboard' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
          title="Dashboard"
        >
          <LayoutDashboard className="w-6 h-6" />
        </button>
        <button
          onClick={() => setPage('chat')}
          className={`p-3 rounded-lg transition ${page === 'chat' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
          title="Chat"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
        <button
          onClick={() => setPage('import')}
          className={`p-3 rounded-lg transition ${page === 'import' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
          title="Import from LeetCode"
        >
          <Download className="w-6 h-6" />
        </button>
        
        <div className="flex-1" />
        
        <div className="p-2 text-gray-400" title={user}>
          <User className="w-5 h-5" />
        </div>
        
        <a
          href="/auth/logout"
          className="p-3 hover:bg-gray-700 rounded-lg transition text-red-400"
          title="Logout"
        >
          <LogOut className="w-5 h-5" />
        </a>
      </div>

      <div className="flex-1">
        {page === 'dashboard' && <Dashboard />}
        {page === 'chat' && <Chat />}
        {page === 'import' && <Import />}
      </div>
    </div>
  )
}

export default App
