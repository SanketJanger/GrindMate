const LEETCODE_GRAPHQL = 'https://leetcode.com/graphql';

interface LeetCodeProblem {
  title: string;
  titleSlug: string;
  difficulty: string;
  topicTags: { name: string }[];
}

interface RecentSubmission {
  title: string;
  titleSlug: string;
  timestamp: string;
  statusDisplay: string;
}

export async function fetchLeetCodeProfile(username: string): Promise<{
  solved: { easy: number; medium: number; hard: number };
  recentSubmissions: RecentSubmission[];
} | null> {
  try {
    const query = `
      query getUserProfile($username: String!) {
        matchedUser(username: $username) {
          submitStats {
            acSubmissionNum {
              difficulty
              count
            }
          }
          recentSubmissionList(limit: 20) {
            title
            titleSlug
            timestamp
            statusDisplay
          }
        }
      }
    `;

    const response = await fetch(LEETCODE_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://leetcode.com',
        'Referer': 'https://leetcode.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        query,
        variables: { username },
      }),
    });

    console.log('LeetCode API response status:', response.status);
    
    if (!response.ok) {
      console.error('LeetCode API error status:', response.status);
      return null;
    }

    const data = await response.json() as any;
    console.log('LeetCode API data:', JSON.stringify(data).slice(0, 200));
    
    if (!data.data?.matchedUser) {
      console.error('No matched user in response');
      return null;
    }

    const user = data.data.matchedUser;
    const stats = user.submitStats.acSubmissionNum;
    
    const solved = {
      easy: stats.find((s: any) => s.difficulty === 'Easy')?.count || 0,
      medium: stats.find((s: any) => s.difficulty === 'Medium')?.count || 0,
      hard: stats.find((s: any) => s.difficulty === 'Hard')?.count || 0,
    };

    const recentSubmissions = user.recentSubmissionList
      .filter((s: any) => s.statusDisplay === 'Accepted')
      .map((s: any) => ({
        title: s.title,
        titleSlug: s.titleSlug,
        timestamp: s.timestamp,
        statusDisplay: s.statusDisplay,
      }));

    return { solved, recentSubmissions };
  } catch (error) {
    console.error('LeetCode API error:', error);
    return null;
  }
}

export async function fetchProblemDetails(titleSlug: string): Promise<LeetCodeProblem | null> {
  try {
    const query = `
      query getProblem($titleSlug: String!) {
        question(titleSlug: $titleSlug) {
          title
          titleSlug
          difficulty
          topicTags {
            name
          }
        }
      }
    `;

    const response = await fetch(LEETCODE_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://leetcode.com',
        'Referer': 'https://leetcode.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        query,
        variables: { titleSlug },
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as any;
    return data.data?.question || null;
  } catch (error) {
    console.error('Problem fetch error:', error);
    return null;
  }
}
