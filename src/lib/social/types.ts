export type PostRow = {
  id: string;
  user_id: string;
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
