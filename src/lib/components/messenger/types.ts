export type MessengerPeer = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  presence: MessengerPresence | null;
};

export type MessengerPresence = {
  status: 'online' | 'away' | 'offline';
  last_active_at: string;
  updated_at: string;
};

export type MessengerConversation = {
  conversationId: string;
  type: 'dm' | 'group';
  group_name?: string | null;
  last_message_at: string | null;
  preview: string | null;
  memberIds: string[];
  unreadCount: number;
  blocked: boolean;
  peer: MessengerPeer | null;
};

export type MessengerMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  client_nonce: string | null;
  has_attachments?: boolean;
  preview_kind?: 'image' | 'gif' | 'text' | null;
  attachments?: MessengerAttachment[];
};

export type MessengerAttachment = {
  id: string;
  message_id: string;
  kind: 'image' | 'gif' | 'file' | 'link';
  url: string;
  view_url: string;
  storage_path: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  alt_text: string | null;
  created_at: string;
};

export type MessageReactionSummary = {
  emoji: '👍' | '❤️' | '😂' | '😮' | '😢' | '🔥';
  count: number;
  reacted: boolean;
};

export type ModerationBadgeStatus = 'active' | 'muted' | 'suspended' | 'banned';

export type MessengerFriendOption = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
};
