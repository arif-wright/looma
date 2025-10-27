export type DbUser = {
  id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
};

export type Comment = {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  author: DbUser;
  reply_count: number;
  children?: Comment[];
};

export type Thread = {
  id: string;
  slug: string | null;
  title: string | null;
  body: string;
  created_at: string;
  comment_count: number;
  author: DbUser;
};
