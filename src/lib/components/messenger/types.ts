export type MessengerPeer = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type MessengerConversation = {
  conversationId: string;
  type: 'dm' | 'group';
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
};
