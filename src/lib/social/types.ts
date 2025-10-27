export type PostRow = {
  id: string;
  user_id: string;
  slug?: string | null;
  body: string;
  meta?: Record<string, unknown>;
  is_public?: boolean;
  created_at: string;
  author_name?: string | null;
  author_handle?: string | null;
  author_avatar?: string | null;
  // Legacy fields kept for backwards compatibility with older payloads
  display_name?: string | null;
  handle?: string | null;
  avatar_url?: string | null;
  comment_count?: number;
  reaction_like_count?: number;
  reaction_spark_count?: number;
  reaction_support_count?: number;
  current_user_reaction?: 'like' | 'spark' | 'support' | null;
};

export type PostComment = {
  comment_id: string;
  comment_post_id: string;
  author_id: string;
  comment_user_id: string | null;
  body: string;
  created_at: string;
  parent_id: string | null;
  is_public: boolean;
  thread_root_id: string;
  depth: number;
  author_display_name: string | null;
  author_handle: string | null;
  author_avatar_url: string | null;
  reply_count: number;
};

export type CommentNode = PostComment & {
  replies?: CommentNode[];
  repliesCursor?: string | null;
  repliesVisible?: boolean;
  repliesLoading?: boolean;
  repliesError?: string | null;
  repliesTotal?: number;
  replying?: boolean;
  pending?: boolean;
};

export type MentionOption = {
  id: string;
  author_handle: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
};
