import { useState, useEffect } from 'react'
import { LayoutDashboard, MessageSquare, LogIn, LogOut, User, Download, Sparkles, Info } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Import from './pages/Import'

const GUEST_USER_ID = 'guest_demo'

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
        <a
          href="/auth/guest"
          className="flex items-center gap-2 border border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white px-6 py-3 rounded-lg transition mt-3"
        >
          <Sparkles className="w-5 h-5" />
          View Demo (no login required)
        </a>
      </div>
    )
  }

  const isGuest = user === GUEST_USER_ID

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {isGuest && (
        <div className="bg-blue-900/40 border-b border-blue-700 text-blue-200 text-sm px-4 py-2 flex items-center justify-center gap-2 text-center">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            You're viewing a demo. <a href="/auth/login" className="underline font-medium hover:text-white">Login with GitHub</a> to track your own progress.
          </span>
        </div>
      )}

      <div className="flex flex-1 min-h-0 mb-16">
        <div className="hidden md:flex w-16 bg-gray-800 flex-col items-center py-4 gap-4">
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

        <div className="flex-1 overflow-y-auto">
          {page === 'dashboard' && <Dashboard />}
          {page === 'chat' && <Chat />}
          {page === 'import' && <Import />}
        </div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-gray-800 border-t border-gray-700 flex justify-around items-center py-2">
        <button
          onClick={() => setPage('dashboard')}
          className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition ${page === 'dashboard' ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-xs">Dashboard</span>
        </button>
        <button
          onClick={() => setPage('chat')}
          className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition ${page === 'chat' ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-xs">Chat</span>
        </button>
        <button
          onClick={() => setPage('import')}
          className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition ${page === 'import' ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}
        >
          <Download className="w-5 h-5" />
          <span className="text-xs">Import</span>
        </button>
      </nav>
    </div>
  )
}

export default App
