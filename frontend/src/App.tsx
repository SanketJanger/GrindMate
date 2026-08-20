import { useState, useEffect } from 'react'
import { LayoutDashboard, MessageSquare, LogIn, LogOut, User, Download, Sparkles, Info, Target, RotateCw, Mail, Lightbulb } from 'lucide-react'
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
      <div className="min-h-screen bg-gray-900 text-white">
        {/* Hero */}
        <div className="max-w-3xl mx-auto px-6 pt-24 pb-16 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-5 leading-tight">
            GrindMate - Track your DSA progress automatically
          </h1>
          <p className="text-lg text-gray-400 max-w-xl mx-auto">
            Solve problems on LeetCode. Log them here in one line. We handle reviews, reminders, and recommendations.
          </p>
        </div>

        {/* How it works */}
        <div className="max-w-4xl mx-auto px-6 py-16 border-t border-gray-800">
          <h2 className="text-2xl font-bold text-center mb-10">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <HowItWorksStep number={1}>
              Solve a problem on LeetCode or NeetCode
            </HowItWorksStep>
            <HowItWorksStep number={2}>
              Type <code className="bg-gray-800 text-green-400 rounded px-2 py-0.5 text-sm">"solved two sum"</code> in chat box
            </HowItWorksStep>
            <HowItWorksStep number={3}>
              Get daily email reminders for spaced repetition reviews
            </HowItWorksStep>
          </div>
        </div>

        {/* Features */}
        <div className="max-w-5xl mx-auto px-6 py-16 border-t border-gray-800">
          <h2 className="text-2xl font-bold text-center mb-10">Everything you need to actually retain it</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FeatureCard
              icon={<Target className="w-6 h-6 text-blue-400" />}
              title="NeetCode 150 Progress Tracker"
              description="See exactly which of the 150 problems you've cleared, by category."
            />
            <FeatureCard
              icon={<RotateCw className="w-6 h-6 text-green-400" />}
              title="Spaced Repetition Reviews"
              description="Every problem you log comes back at 1, 3, and 7 days automatically."
            />
            <FeatureCard
              icon={<Mail className="w-6 h-6 text-yellow-400" />}
              title="Daily Email Reminders"
              description="A daily nudge for whatever's due today, so nothing slips."
            />
            <FeatureCard
              icon={<Lightbulb className="w-6 h-6 text-purple-400" />}
              title="AI Pattern Recommendations"
              description="Get your next problems to practice based on your weak patterns."
            />
          </div>
        </div>

        {/* CTA */}
        <div className="max-w-3xl mx-auto px-6 py-16 border-t border-gray-800 text-center">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="/auth/guest"
              className="flex items-center gap-2 border border-gray-700 text-gray-200 hover:bg-gray-800 px-6 py-3 rounded-lg transition font-medium"
            >
              <Sparkles className="w-5 h-5" />
              View Demo - no login needed
            </a>
            <a
              href="/auth/login"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg transition font-medium"
            >
              <LogIn className="w-5 h-5" />
              Login with GitHub
            </a>
          </div>
        </div>
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
          {page === 'dashboard' && <Dashboard onNavigateToChat={() => setPage('chat')} />}
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

function HowItWorksStep({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <div className="text-center">
      <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center mx-auto mb-4">
        {number}
      </div>
      <p className="text-gray-300">{children}</p>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-5">
      <div className="mb-3">{icon}</div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
  )
}

export default App
