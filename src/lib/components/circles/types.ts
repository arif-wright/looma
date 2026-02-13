export type CircleSummary = {
  circleId: string;
  ownerId: string;
  name: string;
  description: string | null;
  privacy: 'public' | 'invite';
  createdAt: string;
  updatedAt: string;
  conversationId: string | null;
  role: 'owner' | 'admin' | 'member';
  memberCount: number;
  inviteCode: string | null;
};

export type CircleMember = {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  moderationStatus?: 'active' | 'muted' | 'suspended' | 'banned';
  profile: {
    id: string;
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
};

export type CircleAnnouncement = {
  id: string;
  authorId: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
};

export type CircleEventSummary = {
  eventId: string;
  circleId: string;
  creatorId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  isRecurring: boolean;
  rrule: string | null;
  createdAt: string;
  updatedAt: string;
  phase: 'upcoming' | 'past';
  myRsvp: 'going' | 'interested' | 'not_going' | null;
  counts: { going: number; interested: number; notGoing: number };
};

export type CircleDetailPayload = {
  circle: CircleSummary & { myRole: 'owner' | 'admin' | 'member' };
  members: CircleMember[];
  pinnedAnnouncement: CircleAnnouncement | null;
};
