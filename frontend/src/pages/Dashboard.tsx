import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { MessageSquare, Target, Flame, TrendingUp, BookOpen } from 'lucide-react'

interface Stats {
  total_problems: number
  problems_by_difficulty: { easy: number; medium: number; hard: number }
  patterns: { pattern: string; solved_count: number }[]
  current_streak: number
  longest_streak: number
  weak_patterns: string[]
  strong_patterns: string[]
  reviews_due?: number
  reviews_upcoming?: number
}

const COLORS = ['#22c55e', '#eab308', '#ef4444']

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats')
      const data = await res.json()
      setStats(data)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading stats...</div>
      </div>
    )
  }

  const difficultyData = stats ? [
    { name: 'Easy', value: stats.problems_by_difficulty.easy },
    { name: 'Medium', value: stats.problems_by_difficulty.medium },
    { name: 'Hard', value: stats.problems_by_difficulty.hard },
  ] : []

  const patternData = stats?.patterns.slice(0, 8).map(p => ({
    name: p.pattern.replace('_', ' '),
    count: p.solved_count
  })) || []

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">GrindMate</h1>
        <p className="text-gray-400 mb-8">Your DSA Buddy</p>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <StatCard
            icon={<Target className="w-6 h-6 text-blue-400" />}
            label="Total Solved"
            value={stats?.total_problems || 0}
          />
          <StatCard
            icon={<Flame className="w-6 h-6 text-orange-400" />}
            label="Current Streak"
            value={`${stats?.current_streak || 0} days`}
          />
          <StatCard
            icon={<TrendingUp className="w-6 h-6 text-green-400" />}
            label="Best Streak"
            value={`${stats?.longest_streak || 0} days`}
          />
          <StatCard
            icon={<MessageSquare className="w-6 h-6 text-purple-400" />}
            label="Patterns"
            value={stats?.patterns.length || 0}
          />
          <StatCard
            icon={<BookOpen className="w-6 h-6 text-yellow-400" />}
            label="Reviews Due"
            value={stats?.reviews_due || 0}
            highlight={!!stats?.reviews_due && stats.reviews_due > 0}
          />
        </div>

        {/* Reviews Alert */}
        {stats?.reviews_due && stats.reviews_due > 0 && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 mb-8">
            <div className="flex items-center gap-3">
              <BookOpen className="w-6 h-6 text-yellow-400" />
              <div>
                <h3 className="font-semibold text-yellow-400">
                  {stats.reviews_due} problem{stats.reviews_due > 1 ? 's' : ''} due for review!
                </h3>
                <p className="text-gray-400 text-sm">
                  Go to Chat and say "show my reviews" to see them.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">By Difficulty</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={difficultyData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {difficultyData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Top Patterns</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={patternData} layout="vertical">
                  <XAxis type="number" stroke="#9ca3af" />
                  <YAxis type="category" dataKey="name" stroke="#9ca3af" width={100} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none' }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Weak Areas */}
        {stats?.weak_patterns && stats.weak_patterns.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Needs Practice</h2>
            <div className="flex flex-wrap gap-2">
              {stats.weak_patterns.map((pattern) => (
                <span
                  key={pattern}
                  className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm"
                >
                  {pattern.replace('_', ' ')}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ 
  icon, 
  label, 
  value, 
  highlight 
}: { 
  icon: React.ReactNode
  label: string
  value: string | number
  highlight?: boolean
}) {
  return (
    <div className={`rounded-lg p-4 flex items-center gap-4 ${
      highlight ? 'bg-yellow-900/30 border border-yellow-700' : 'bg-gray-800'
    }`}>
      <div className="p-2 bg-gray-700 rounded-lg">{icon}</div>
      <div>
        <div className={`text-2xl font-bold ${highlight ? 'text-yellow-400' : ''}`}>{value}</div>
        <div className="text-gray-400 text-sm">{label}</div>
      </div>
    </div>
  )
}
