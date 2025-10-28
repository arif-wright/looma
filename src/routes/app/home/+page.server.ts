import type { PageServerLoad } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import type { PostRow } from '$lib/social/types';

type MissionSummary = {
  id: string;
  title?: string | null;
  summary?: string | null;
  difficulty?: string | null;
  energy_reward?: number | null;
  xp_reward?: number | null;
};

type CreatureMoment = {
  id: string;
  name?: string | null;
  species?: string | null;
  mood?: string | null;
  mood_label?: string | null;
  next_care_at?: string | null;
};

export const load: PageServerLoad = async (event) => {
  const parent = await event.parent();
  const { session } = parent;
  const supabase = supabaseServer(event);

  const stats = await getPlayerStats(event);

  const feedResponse = await event.fetch('/api/posts?limit=10');
  const feedPayload = await feedResponse
    .json()
    .catch(() => ({ items: [] as PostRow[] }));
  const feedItems = Array.isArray(feedPayload?.items) ? (feedPayload.items as PostRow[]) : [];

  let missionSuggestions: MissionSummary[] = [];
  try {
    const { data, error } = await supabase
      .from('missions')
      .select('id, title, summary, difficulty, energy_reward, xp_reward, status, user_id')
      .limit(4);

    if (error) {
      console.info('[home] missions query unavailable', error.message);
    } else if (Array.isArray(data)) {
      missionSuggestions = (data as MissionSummary[]).filter(Boolean).slice(0, 2);
    }
  } catch (err) {
    console.info('[home] missions fetch skipped', err);
  }

  let creatureMoments: CreatureMoment[] = [];
  try {
    const { data, error } = await supabase
      .from('creatures')
      .select('id, name, species, mood, mood_label, next_care_at, owner_id')
      .eq('owner_id', session.user.id)
      .order('next_care_at', { ascending: true })
      .limit(3);

    if (error) {
      console.info('[home] creatures query unavailable', error.message);
    } else if (Array.isArray(data)) {
      creatureMoments = (data as CreatureMoment[]).filter(Boolean);
    }
  } catch (err) {
    console.info('[home] creatures fetch skipped', err);
  }

  const endcap =
    missionSuggestions[0]
      ? {
          title: 'Knock out a mission',
          description: missionSuggestions[0].title ?? 'Pick up where you left off.',
          href: `/app/missions/${missionSuggestions[0].id}`
        }
      : {
          title: 'Check on your companion',
          description: 'Spend a moment with your favourite creature before you go.',
          href: creatureMoments[0] ? `/app/creatures?focus=${creatureMoments[0].id}` : '/app/creatures'
        };

  return {
    stats,
    feed: feedItems,
    missions: missionSuggestions,
    creatures: creatureMoments,
    endcap,
    landingVariant: parent.landingVariant ?? null
  };
};
