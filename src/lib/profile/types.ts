export type ProfileSummary = {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  level: number | null;
  xp: number | null;
  xp_next: number | null;
  bonded_count: number | null;
};
