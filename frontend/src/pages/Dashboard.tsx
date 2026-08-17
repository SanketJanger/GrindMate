import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { MessageSquare, Target, Flame, TrendingUp, BookOpen, CheckCircle2, CircleDot, Circle, X, CheckCircle } from 'lucide-react'

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

interface ReviewDue {
  id: string
  leetcode_id: number | null
  title: string
  difficulty: string
  patterns: string[]
  solved_on: string
  struggled: boolean
  review_number: number
  scheduled_for: string
  completed: boolean
}

interface NeetCodeCategoryProgress {
  category: string
  solved: number
  total: number
  status: 'complete' | 'in_progress' | 'not_started'
}

interface NeetCodeProgress {
  total: number
  solved: number
  categories: NeetCodeCategoryProgress[]
}

interface NeedsPracticeProblem {
  leetcode_id: number
  title: string
  difficulty: string
  slug: string
}

interface NeedsPracticeGroup {
  pattern: string
  problems: NeedsPracticeProblem[]
}

const COLORS = ['#22c55e', '#eab308', '#ef4444']

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [neetcode, setNeetcode] = useState<NeetCodeProgress | null>(null)
  const [needsPractice, setNeedsPractice] = useState<NeedsPracticeGroup[]>([])
  const [loading, setLoading] = useState(true)

  const [showReviews, setShowReviews] = useState(false)
  const [dueReviews, setDueReviews] = useState<ReviewDue[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [reviewsError, setReviewsError] = useState<string | null>(null)

  useEffect(() => {
    fetchStats()
    fetchNeetCodeProgress()
    fetchNeedsPractice()
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

  const fetchNeetCodeProgress = async () => {
    try {
      const res = await fetch('/api/neetcode/progress')
      const data = await res.json()
      setNeetcode(data)
    } catch (err) {
      console.error('Failed to fetch NeetCode progress:', err)
    }
  }

  const fetchNeedsPractice = async () => {
    try {
      const res = await fetch('/api/needs-practice')
      const data = await res.json()
      setNeedsPractice(data.patterns || [])
    } catch (err) {
      console.error('Failed to fetch needs-practice suggestions:', err)
    }
  }

  const openReviews = async () => {
    setShowReviews(true)
    setReviewsError(null)
    setReviewsLoading(true)
    try {
      const res = await fetch('/api/reviews')
      const data = await res.json()
      setDueReviews(data.due || [])
    } catch (err) {
      console.error('Failed to fetch reviews:', err)
      setReviewsError('Failed to load reviews.')
    } finally {
      setReviewsLoading(false)
    }
  }

  const markReviewed = async (id: string) => {
    setCompletingId(id)
    setReviewsError(null)
    try {
      const res = await fetch('/api/reviews/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setReviewsError(data.error || 'Failed to mark review complete.')
        return
      }
      setDueReviews(prev => prev.filter(r => r.id !== id))
      fetchStats()
    } catch (err) {
      console.error('Failed to complete review:', err)
      setReviewsError('Failed to mark review complete.')
    } finally {
      setCompletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="h-full bg-gray-900 flex items-center justify-center">
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
    <div className="h-full bg-gray-900 text-white p-6">
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
            onClick={openReviews}
          />
        </div>

        {/* Reviews Alert */}
        {stats && stats.reviews_due !== undefined && stats.reviews_due > 0 && (
          <button
            onClick={openReviews}
            className="w-full text-left bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 mb-8 hover:bg-yellow-900/40 transition"
          >
            <div className="flex items-center gap-3">
              <BookOpen className="w-6 h-6 text-yellow-400" />
              <div>
                <h3 className="font-semibold text-yellow-400">
                  {stats.reviews_due} problem{stats.reviews_due > 1 ? 's' : ''} due for review!
                </h3>
                <p className="text-gray-400 text-sm">
                  Click here or say "show my reviews" in Chat to see them.
                </p>
              </div>
            </div>
          </button>
        )}

        {showReviews && (
          <ReviewsModal
            reviews={dueReviews}
            loading={reviewsLoading}
            error={reviewsError}
            completingId={completingId}
            onClose={() => setShowReviews(false)}
            onMarkReviewed={markReviewed}
          />
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

        {/* NeetCode 150 Progress */}
        {neetcode && (
          <div className="bg-gray-800 rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">NeetCode 150 Progress</h2>
              <span className="text-gray-400 text-sm">
                {neetcode.solved}/{neetcode.total} solved
              </span>
            </div>

            <div className="w-full h-2 bg-gray-700 rounded-full mb-6 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${neetcode.total > 0 ? (neetcode.solved / neetcode.total) * 100 : 0}%` }}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {neetcode.categories.map((cat) => (
                <NeetCodeCategoryCard key={cat.category} category={cat} />
              ))}
            </div>
          </div>
        )}

        {/* Needs Practice */}
        {needsPractice.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Needs Practice</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {needsPractice.map((group) => (
                <NeedsPracticeCard key={group.pattern} group={group} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const NEETCODE_STATUS_CONFIG = {
  complete: {
    icon: CheckCircle2,
    label: 'Complete',
    iconClass: 'text-green-400',
    barClass: 'bg-green-500',
    badgeClass: 'bg-green-500/20 text-green-400',
  },
  in_progress: {
    icon: CircleDot,
    label: 'In Progress',
    iconClass: 'text-blue-400',
    barClass: 'bg-blue-500',
    badgeClass: 'bg-blue-500/20 text-blue-400',
  },
  not_started: {
    icon: Circle,
    label: 'Not Started',
    iconClass: 'text-gray-500',
    barClass: 'bg-gray-600',
    badgeClass: 'bg-gray-700 text-gray-400',
  },
} as const

const DIFFICULTY_TEXT_CLASS: Record<string, string> = {
  easy: 'text-green-400',
  medium: 'text-yellow-400',
  hard: 'text-red-400',
}

function NeedsPracticeCard({ group }: { group: NeedsPracticeGroup }) {
  return (
    <div className="bg-gray-900/50 rounded-lg p-4">
      <h3 className="font-semibold mb-2">{group.pattern.replace(/_/g, ' ')}</h3>
      <ul className="space-y-1.5">
        {group.problems.map((problem) => (
          <li key={problem.leetcode_id} className="text-sm">
            <span className="text-gray-500 mr-1.5">•</span>
            <a
              href={`https://leetcode.com/problems/${problem.slug}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 hover:underline"
            >
              {problem.title}
            </a>{' '}
            <span className={DIFFICULTY_TEXT_CLASS[problem.difficulty] || 'text-gray-400'}>
              ({problem.difficulty.charAt(0).toUpperCase() + problem.difficulty.slice(1)})
            </span>{' '}
            <span className="text-gray-500">— NeetCode 150</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function NeetCodeCategoryCard({ category }: { category: NeetCodeCategoryProgress }) {
  const config = NEETCODE_STATUS_CONFIG[category.status]
  const Icon = config.icon
  const percent = category.total > 0 ? (category.solved / category.total) * 100 : 0

  return (
    <div className="bg-gray-900/50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${config.iconClass}`} />
          <span className="text-sm font-medium truncate">{category.category}</span>
        </div>
        <span className="text-xs text-gray-400 shrink-0 ml-2">
          {category.solved}/{category.total}
        </span>
      </div>
      <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all ${config.barClass}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${config.badgeClass}`}>
        {config.label}
      </span>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  highlight,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  highlight?: boolean
  onClick?: () => void
}) {
  const className = `rounded-lg p-4 flex items-center gap-4 w-full text-left ${
    highlight ? 'bg-yellow-900/30 border border-yellow-700' : 'bg-gray-800'
  } ${onClick ? 'hover:bg-gray-700 transition cursor-pointer' : ''}`

  const content = (
    <>
      <div className="p-2 bg-gray-700 rounded-lg">{icon}</div>
      <div>
        <div className={`text-2xl font-bold ${highlight ? 'text-yellow-400' : ''}`}>{value}</div>
        <div className="text-gray-400 text-sm">{label}</div>
      </div>
    </>
  )

  if (onClick) {
    return <button onClick={onClick} className={className}>{content}</button>
  }

  return <div className={className}>{content}</div>
}

function ReviewsModal({
  reviews,
  loading,
  error,
  completingId,
  onClose,
  onMarkReviewed,
}: {
  reviews: ReviewDue[]
  loading: boolean
  error: string | null
  completingId: string | null
  onClose: () => void
  onMarkReviewed: (id: string) => void
}) {
  const today = new Date().toISOString().split('T')[0]

  const daysOverdue = (scheduledFor: string) => {
    const scheduledDate = scheduledFor.split('T')[0]
    const diff = Math.round((Date.parse(today) - Date.parse(scheduledDate)) / 86400000)
    return Math.max(0, diff)
  }

  const dueLabel = (scheduledFor: string) => {
    const days = daysOverdue(scheduledFor)
    if (days === 0) return 'Due today'
    if (days === 1) return '1 day overdue'
    return `${days} days overdue`
  }

  // Struggled problems surface first, matching the priority order used in chat.
  const sortedReviews = [...reviews].sort((a, b) => {
    if (a.struggled !== b.struggled) return a.struggled ? -1 : 1
    return a.solved_on.localeCompare(b.solved_on)
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700 sticky top-0 bg-gray-800">
          <h2 className="text-lg font-semibold">Reviews Due</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {loading && <div className="text-gray-400 text-center py-8">Loading reviews...</div>}

          {!loading && error && (
            <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg p-3">{error}</div>
          )}

          {!loading && !error && reviews.length === 0 && (
            <div className="text-gray-400 text-center py-8">No reviews due right now. 🎉</div>
          )}

          {sortedReviews.map((review) => (
            <div key={review.id} className="bg-gray-900/50 rounded-lg p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="font-medium">
                  <span className="mr-1.5" title={review.struggled ? 'Struggled — prioritized' : 'Not struggled'}>
                    {review.struggled ? '🔴' : '🟡'}
                  </span>
                  {review.title}
                  {review.leetcode_id != null && (
                    <span className="text-gray-400 font-normal"> (LC {review.leetcode_id})</span>
                  )}
                </div>
                <div className="text-sm text-gray-400 mt-1 flex flex-wrap gap-x-2 gap-y-1">
                  <span className="capitalize">{review.difficulty}</span>
                  <span>·</span>
                  <span>{dueLabel(review.scheduled_for)}</span>
                  <span>·</span>
                  <span>Review #{review.review_number}</span>
                </div>
                {review.patterns.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {review.patterns.map((p) => (
                      <span key={p} className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded-full text-xs">
                        {p.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => onMarkReviewed(review.id)}
                disabled={completingId === review.id}
                className="shrink-0 flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 px-3 py-2 rounded-lg text-sm transition"
              >
                <CheckCircle className="w-4 h-4" />
                {completingId === review.id ? 'Marking...' : 'Mark Reviewed'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
