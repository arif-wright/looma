<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import ConversationList from '$lib/components/messenger/ConversationList.svelte';
  import ChatThread from '$lib/components/messenger/ChatThread.svelte';
  import MessageComposer from '$lib/components/messenger/MessageComposer.svelte';
  import StartChatModal from '$lib/components/messenger/StartChatModal.svelte';
  import MediaViewerModal from '$lib/components/messenger/MediaViewerModal.svelte';
  import { clampIndex, type MediaViewerItem } from '$lib/components/messenger/useMediaViewer';
  import type {
    MessageReactionSummary,
    ModerationBadgeStatus,
    MessengerConversation,
    MessengerFriendOption,
    MessengerMessage
  } from '$lib/components/messenger/types';

  export let data;

  const currentUserId = (data?.user?.id as string | undefined) ?? null;
  const presenceVisible = data?.preferences?.presence_visible !== false;

  let conversations: MessengerConversation[] = [];
  let activeConversationId: string | null = null;
  let messages: MessengerMessage[] = [];
  let reactionsByMessageId: Record<string, MessageReactionSummary[]> = {};
  let memberProfiles: Record<string, { handle: string | null; display_name: string | null }> = {};
  let conversationType: 'dm' | 'group' = 'dm';
  let seenByPeerAt: string | null = null;

  let moderationByUserId: Record<string, { status: ModerationBadgeStatus; until: string | null }> = {};
  let viewerCanModerate = false;
  let nextCursor: string | null = null;
  let searchQuery = '';

  let loadingConversations = false;
  let loadingMessages = false;
  let sending = false;
  let errorMessage: string | null = null;
  let sendLocked = false;
  let mediaViewerOpen = false;
  let mediaViewerStartIndex = 0;
  let mediaViewerError: string | null = null;

  let showStartModal = false;
  let startModalLoading = false;
  let startModalError: string | null = null;
  let startModalFriends: MessengerFriendOption[] = [];

  let editingMessageId: string | null = null;
  let editingSeed = '';

  let readDebounce: ReturnType<typeof setTimeout> | null = null;
  let typingStopTimer: ReturnType<typeof setTimeout> | null = null;
  let localTypingActive = false;
  let lastTypingTrueAt = 0;
  let typingUsers = new Set<string>();
  let typingUserTimers = new Map<string, ReturnType<typeof setTimeout>>();

  let supabaseClient: ReturnType<typeof supabaseBrowser> | null = null;
  let activeMessagesChannel: RealtimeChannel | null = null;
  let conversationsChannel: RealtimeChannel | null = null;
  let presenceChannel: RealtimeChannel | null = null;

  const byNewest = (a: MessengerConversation, b: MessengerConversation) => {
    const aTime = a.last_message_at ? Date.parse(a.last_message_at) : 0;
    const bTime = b.last_message_at ? Date.parse(b.last_message_at) : 0;
    return bTime - aTime;
  };

  const clearTypingUsers = () => {
    for (const timer of typingUserTimers.values()) {
      clearTimeout(timer);
    }
    typingUserTimers = new Map();
    typingUsers = new Set();
  };

  const setUserTyping = (userId: string, typing: boolean) => {
    if (typing) {
      const next = new Set(typingUsers);
      next.add(userId);
      typingUsers = next;

      const existing = typingUserTimers.get(userId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        const after = new Set(typingUsers);
        after.delete(userId);
        typingUsers = after;
        typingUserTimers.delete(userId);
      }, 3000);
      typingUserTimers.set(userId, timer);
      return;
    }

    const timer = typingUserTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      typingUserTimers.delete(userId);
    }
    const next = new Set(typingUsers);
    next.delete(userId);
    typingUsers = next;
  };

  $: filteredConversations = conversations.filter((conversation) => {
    const key = `${conversation.peer?.display_name ?? ''} ${conversation.peer?.handle ?? ''} ${conversation.preview ?? ''}`.toLowerCase();
    return key.includes(searchQuery.toLowerCase());
  });

  $: activeConversation =
    activeConversationId
      ? conversations.find((conversation) => conversation.conversationId === activeConversationId) ?? null
      : null;

  $: threadTitle =
    activeConversation?.peer?.display_name ??
    (activeConversation?.peer?.handle ? `@${activeConversation.peer.handle}` : activeConversation?.group_name ?? 'Conversation');

  const relativeLastActive = (iso: string) => {
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return null;
    const deltaMs = Math.max(0, Date.now() - ts);
    const minutes = Math.floor(deltaMs / 60_000);
    if (minutes < 1) return 'Active just now';
    if (minutes < 60) return `Active ${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Active ${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `Active ${days}d ago`;
  };

  $: presenceLabel = (() => {
    const presence = activeConversation?.peer?.presence ?? null;
    if (!presence) return null;
    if (presence.status === 'online') return 'Online';
    if (presence.status === 'away') return 'Away';
    return relativeLastActive(presence.last_active_at);
  })();

  $: typingLabel = (() => {
    if (!presenceVisible || typingUsers.size === 0) return null;
    const names = [...typingUsers]
      .map((id) => memberProfiles[id]?.display_name ?? (memberProfiles[id]?.handle ? `@${memberProfiles[id]?.handle}` : id.slice(0, 8)))
      .filter((value) => typeof value === 'string' && value.length > 0);

    if (names.length === 0) return 'Typing…';
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]}, ${names[1]} typing…`;
    return `${names[0]}, ${names[1]} +${names.length - 2} typing…`;
  })();

  $: seenLabel = (() => {
    if (conversationType !== 'dm' || !seenByPeerAt || !currentUserId) return null;
    const lastOwn = [...messages].reverse().find((message) => message.sender_id === currentUserId && !message.deleted_at) ?? null;
    if (!lastOwn) return null;
    const seenAtMs = Date.parse(seenByPeerAt);
    const messageAtMs = Date.parse(lastOwn.created_at);
    if (!Number.isFinite(seenAtMs) || !Number.isFinite(messageAtMs)) return null;
    return seenAtMs >= messageAtMs ? 'Seen' : null;
  })();

  $: galleryItems = (() => {
    const items: MediaViewerItem[] = [];
    for (const message of messages) {
      if (message.deleted_at) continue;
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];
      for (const attachment of attachments) {
        if (attachment.kind !== 'image' && attachment.kind !== 'gif') continue;
        const profile = memberProfiles[message.sender_id];
        items.push({
          messageId: message.id,
          attachmentId: attachment.id,
          kind: attachment.kind,
          url: attachment.view_url ?? attachment.url,
          width: attachment.width ?? null,
          height: attachment.height ?? null,
          mimeType: attachment.mime_type ?? null,
          bytes: attachment.bytes ?? null,
          createdAt: message.created_at,
          senderId: message.sender_id,
          senderHandle: profile?.display_name ?? profile?.handle ?? null
        });
      }
    }
    return items;
  })();

  const loadFriendOptions = async () => {
    const res = await fetch('/api/friends/list', { headers: { 'cache-control': 'no-store' } });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      startModalFriends = [];
      return;
    }

    const items = Array.isArray(payload?.items)
      ? payload.items
      : [];

    startModalFriends = items
      .map((item: { profile?: MessengerFriendOption }) => item.profile)
      .filter((profile: MessengerFriendOption | undefined): profile is MessengerFriendOption => Boolean(profile));
  };

  const markConversationRead = async (conversationId: string) => {
    await fetch('/api/messenger/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId })
    });

    conversations = conversations.map((conversation) =>
      conversation.conversationId === conversationId ? { ...conversation, unreadCount: 0 } : conversation
    );
  };

  const scheduleRead = (conversationId: string) => {
    if (readDebounce) {
      clearTimeout(readDebounce);
    }

    readDebounce = setTimeout(() => {
      readDebounce = null;
      void markConversationRead(conversationId);
    }, 350);
  };

  const syncPeerPresence = (
    userId: string,
    status: 'online' | 'away' | 'offline',
    lastActiveAt: string,
    updatedAt: string
  ) => {
    conversations = conversations.map((conversation) =>
      conversation.peer?.id === userId
        ? {
            ...conversation,
            peer: {
              ...conversation.peer,
              presence: {
                status,
                last_active_at: lastActiveAt,
                updated_at: updatedAt
              }
            }
          }
        : conversation
    );
  };

  const loadConversations = async (preferCurrent = true) => {
    loadingConversations = true;
    errorMessage = null;

    try {
      const res = await fetch('/api/messenger/conversations', { headers: { 'cache-control': 'no-store' } });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorMessage = typeof payload?.message === 'string' ? payload.message : 'Failed to load conversations.';
        return;
      }

      const next = Array.isArray(payload?.items) ? (payload.items as MessengerConversation[]) : [];
      conversations = [...next].sort(byNewest);
      await bindPresenceRealtime();

      if (!next.length) {
        activeConversationId = null;
        messages = [];
        nextCursor = null;
        return;
      }

      const stillExists = preferCurrent && activeConversationId && next.some((item) => item.conversationId === activeConversationId);
      const nextActive = stillExists ? activeConversationId : next[0]?.conversationId ?? null;

      if (nextActive && nextActive !== activeConversationId) {
        activeConversationId = nextActive;
        await loadMessages(nextActive, false);
      }
    } finally {
      loadingConversations = false;
    }
  };

  const normalizeReactionMap = (input: unknown): Record<string, MessageReactionSummary[]> => {
    if (!input || typeof input !== 'object') return {};
    const source = input as Record<string, unknown>;
    const out: Record<string, MessageReactionSummary[]> = {};

    for (const [messageId, reactions] of Object.entries(source)) {
      if (!Array.isArray(reactions)) continue;
      out[messageId] = reactions
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const row = entry as Record<string, unknown>;
          if (row.emoji !== '👍' && row.emoji !== '❤️' && row.emoji !== '😂' && row.emoji !== '😮' && row.emoji !== '😢' && row.emoji !== '🔥') {
            return null;
          }
          const count = Number(row.count ?? 0);
          return {
            emoji: row.emoji,
            count: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0,
            reacted: row.reacted === true
          } satisfies MessageReactionSummary;
        })
        .filter((entry): entry is MessageReactionSummary => Boolean(entry));
    }

    return out;
  };

  const loadMessages = async (conversationId: string, older: boolean) => {
    loadingMessages = !older;

    try {
      const cursorParam = older && nextCursor ? `&cursor=${encodeURIComponent(nextCursor)}` : '';
      const res = await fetch(
        `/api/messenger/messages?conversationId=${encodeURIComponent(conversationId)}&limit=40${cursorParam}`,
        { headers: { 'cache-control': 'no-store' } }
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorMessage = typeof payload?.message === 'string' ? payload.message : 'Failed to load messages.';
        return;
      }

      const items = Array.isArray(payload?.items) ? (payload.items as MessengerMessage[]) : [];
      nextCursor = typeof payload?.nextCursor === 'string' ? payload.nextCursor : null;
      viewerCanModerate = payload?.viewerCanModerate === true;
      moderationByUserId =
        payload?.moderationByUserId && typeof payload.moderationByUserId === 'object'
          ? (payload.moderationByUserId as Record<string, { status: ModerationBadgeStatus; until: string | null }>)
          : {};

      const nextProfiles = payload?.memberProfiles && typeof payload.memberProfiles === 'object'
        ? (payload.memberProfiles as Record<string, { handle: string | null; display_name: string | null }>)
        : {};
      memberProfiles = { ...memberProfiles, ...nextProfiles };

      conversationType = payload?.conversationType === 'group' ? 'group' : 'dm';
      seenByPeerAt = typeof payload?.seenByPeerAt === 'string' ? payload.seenByPeerAt : null;

      const nextReactionMap = normalizeReactionMap(payload?.reactionsByMessageId);
      reactionsByMessageId = older ? { ...nextReactionMap, ...reactionsByMessageId } : nextReactionMap;

      if (older) {
        messages = [...items, ...messages];
      } else {
        messages = items;
      }

      if (!older && conversationId === activeConversationId) {
        const blocked = payload?.blocked === true;
        const peerPresence =
          payload?.peer?.presence &&
          (payload.peer.presence.status === 'online' ||
            payload.peer.presence.status === 'away' ||
            payload.peer.presence.status === 'offline') &&
          typeof payload.peer.presence.last_active_at === 'string' &&
          typeof payload.peer.presence.updated_at === 'string'
            ? payload.peer.presence
            : null;
        conversations = conversations.map((conversation) =>
          conversation.conversationId === conversationId
            ? {
                ...conversation,
                blocked,
                peer: conversation.peer
                  ? {
                      ...conversation.peer,
                      presence: peerPresence
                    }
                  : null
              }
            : conversation
        );
      }
    } finally {
      loadingMessages = false;
    }
  };

  const handleSelectConversation = async (conversationId: string) => {
    if (conversationId === activeConversationId) return;
    activeConversationId = conversationId;
    editingMessageId = null;
    editingSeed = '';
    mediaViewerOpen = false;
    mediaViewerError = null;
    clearTypingUsers();
    sendLocked = false;
    await loadMessages(conversationId, false);
    await markConversationRead(conversationId);
    await bindActiveMessagesRealtime();
  };

  const updateLocalMessage = (messageId: string, patch: Partial<MessengerMessage>) => {
    messages = messages.map((row) => (row.id === messageId ? { ...row, ...patch } : row));
  };

  const handleOpenMedia = (event: CustomEvent<{ messageId: string; attachmentId: string }>) => {
    mediaViewerError = null;
    const index = galleryItems.findIndex((item) => item.attachmentId === event.detail.attachmentId);
    if (index < 0) {
      mediaViewerError = 'This media is no longer available.';
      return;
    }
    mediaViewerStartIndex = index;
    mediaViewerOpen = true;
  };

  const handleSendMessage = async (
    event: CustomEvent<{
      body: string;
      attachments?: Array<{
        kind?: 'image' | 'gif' | 'file' | 'link';
        storagePath?: string;
        url?: string;
        mimeType?: string;
        bytes?: number;
        width?: number;
        height?: number;
        altText?: string | null;
      }>;
    }>
  ) => {
    if (!activeConversationId || !currentUserId) return;
    sending = true;
    errorMessage = null;

    try {
      const body = event.detail.body;
      const attachments = Array.isArray(event.detail.attachments) ? event.detail.attachments : [];

      if (editingMessageId) {
        const res = await fetch('/api/messenger/message/edit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messageId: editingMessageId, body })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          errorMessage = typeof payload?.message === 'string' ? payload.message : 'Failed to edit message.';
          return;
        }

        updateLocalMessage(editingMessageId, {
          body,
          edited_at: typeof payload.editedAt === 'string' ? payload.editedAt : new Date().toISOString()
        });

        editingMessageId = null;
        editingSeed = '';
        if (localTypingActive) {
          void sendTyping(false, true);
        }
        return;
      }

      const clientNonce = crypto.randomUUID();
      const res = await fetch('/api/messenger/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeConversationId,
          body,
          clientNonce,
          attachments
        })
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorMessage = typeof payload?.message === 'string' ? payload.message : 'Failed to send message.';
        if (payload?.error === 'moderation_blocked' || payload?.error === 'trust_restricted') {
          sendLocked = true;
        }
        return;
      }

      const message: MessengerMessage = {
        id: String(payload.messageId),
        conversation_id: activeConversationId,
        sender_id: currentUserId,
        body,
        created_at: typeof payload.createdAt === 'string' ? payload.createdAt : new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        client_nonce: clientNonce,
        has_attachments: attachments.length > 0,
        preview_kind: attachments.some((entry) => entry.kind === 'gif')
          ? 'gif'
          : attachments.length > 0
            ? 'image'
            : 'text',
        attachments: Array.isArray(payload?.attachments) ? payload.attachments : []
      };

      if (!messages.some((row) => row.id === message.id)) {
        messages = [...messages, message];
      }

      conversations = conversations
        .map((conversation) =>
          conversation.conversationId === activeConversationId
            ? {
                ...conversation,
                last_message_at: message.created_at,
                preview: body || (attachments.some((entry) => entry.kind === 'gif') ? 'GIF' : '📷 Photo'),
                unreadCount: 0
              }
            : conversation
        )
        .sort(byNewest);

      scheduleRead(activeConversationId);
      if (localTypingActive) {
        void sendTyping(false, true);
      }
    } finally {
      sending = false;
    }
  };

  const handleReportMessage = async (event: CustomEvent<{ messageId: string }>) => {
    const reason = window.prompt('Reason for report (e.g. harassment, spam, other):', 'other');
    if (!reason) return;

    await fetch('/api/messenger/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageId: event.detail.messageId, reason })
    });
  };

  const handleDeleteMessage = async (event: CustomEvent<{ messageId: string }>) => {
    const res = await fetch('/api/messenger/message/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageId: event.detail.messageId })
    });

    if (!res.ok) return;

    updateLocalMessage(event.detail.messageId, { deleted_at: new Date().toISOString() });

    if (editingMessageId === event.detail.messageId) {
      editingMessageId = null;
      editingSeed = '';
    }

    if (mediaViewerOpen) {
      if (galleryItems.length <= 1) {
        mediaViewerOpen = false;
      } else {
        mediaViewerStartIndex = clampIndex(mediaViewerStartIndex, galleryItems.length - 1);
      }
    }
  };

  const handleEditMessage = (event: CustomEvent<{ messageId: string; body: string }>) => {
    editingMessageId = event.detail.messageId;
    editingSeed = event.detail.body;
  };

  const applyReactionLocally = (
    messageId: string,
    emoji: MessageReactionSummary['emoji'],
    action: 'add' | 'remove'
  ) => {
    const current = reactionsByMessageId[messageId] ?? [];
    const existing = current.find((entry) => entry.emoji === emoji) ?? null;
    let next = current;

    if (action === 'add') {
      if (existing) {
        next = current.map((entry) =>
          entry.emoji === emoji
            ? {
                ...entry,
                count: entry.reacted ? entry.count : entry.count + 1,
                reacted: true
              }
            : entry
        );
      } else {
        next = [...current, { emoji, count: 1, reacted: true }];
      }
    } else {
      if (!existing) return;
      if (existing.count <= 1) {
        next = current.filter((entry) => entry.emoji !== emoji);
      } else {
        next = current.map((entry) =>
          entry.emoji === emoji
            ? {
                ...entry,
                count: Math.max(0, entry.count - (entry.reacted ? 1 : 0)),
                reacted: false
              }
            : entry
        );
      }
    }

    reactionsByMessageId = {
      ...reactionsByMessageId,
      [messageId]: next
    };
  };

  const handleReactMessage = async (
    event: CustomEvent<{ messageId: string; emoji: '👍' | '❤️' | '😂' | '😮' | '😢' | '🔥'; action: 'add' | 'remove' }>
  ) => {
    const { messageId, emoji, action } = event.detail;
    applyReactionLocally(messageId, emoji, action);

    const res = await fetch('/api/messenger/react', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageId, emoji, action })
    });

    if (!res.ok) {
      applyReactionLocally(messageId, emoji, action === 'add' ? 'remove' : 'add');
    }
  };

  const handleBlock = async () => {
    const peerId = activeConversation?.peer?.id;
    if (!peerId || !activeConversationId) return;

    const res = await fetch('/api/messenger/block', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ blockedUserId: peerId })
    });

    if (res.ok) {
      conversations = conversations.map((conversation) =>
        conversation.conversationId === activeConversationId ? { ...conversation, blocked: true } : conversation
      );
    }
  };

  const handleStartChat = async (event: CustomEvent<{ handle: string }>) => {
    startModalLoading = true;
    startModalError = null;

    try {
      const res = await fetch('/api/messenger/dm/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handle: event.detail.handle })
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || typeof payload?.conversationId !== 'string') {
        startModalError =
          payload?.error === 'blocked'
            ? 'You cannot start a chat with this user.'
            : 'Could not start this chat. Confirm the handle and try again.';
        return;
      }

      showStartModal = false;
      await loadConversations(false);
      await handleSelectConversation(payload.conversationId);
    } finally {
      startModalLoading = false;
    }
  };

  const handleStartChatWithFriend = async (event: CustomEvent<{ userId: string }>) => {
    startModalLoading = true;
    startModalError = null;

    try {
      const res = await fetch('/api/messenger/dm/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ otherUserId: event.detail.userId })
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || typeof payload?.conversationId !== 'string') {
        startModalError =
          payload?.error === 'blocked'
            ? 'You cannot start a chat with this user.'
            : 'Could not start this chat right now.';
        return;
      }

      showStartModal = false;
      await loadConversations(false);
      await handleSelectConversation(payload.conversationId);
    } finally {
      startModalLoading = false;
    }
  };

  const sendTyping = async (typing: boolean, force = false) => {
    if (!presenceVisible || !activeMessagesChannel || !activeConversationId || !currentUserId) return;

    if (typing && !force) {
      const now = Date.now();
      if (now - lastTypingTrueAt < 1000) return;
      lastTypingTrueAt = now;
    }

    localTypingActive = typing;
    await activeMessagesChannel
      .send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          conversationId: activeConversationId,
          userId: currentUserId,
          typing
        }
      })
      .catch(() => {});
  };

  const handleComposerTyping = (event: CustomEvent<{ typing: boolean }>) => {
    if (!presenceVisible || !activeConversationId || activeConversation?.blocked) return;

    if (!event.detail.typing) {
      if (typingStopTimer) {
        clearTimeout(typingStopTimer);
        typingStopTimer = null;
      }
      if (localTypingActive) {
        void sendTyping(false, true);
      }
      return;
    }

    void sendTyping(true);

    if (typingStopTimer) {
      clearTimeout(typingStopTimer);
    }

    typingStopTimer = setTimeout(() => {
      typingStopTimer = null;
      if (localTypingActive) {
        void sendTyping(false, true);
      }
    }, 1200);
  };

  const bindConversationsRealtime = async () => {
    if (!supabaseClient) return;

    if (conversationsChannel) {
      await supabaseClient.removeChannel(conversationsChannel);
      conversationsChannel = null;
    }

    conversationsChannel = supabaseClient
      .channel('messenger:conversations')
      .on<RealtimePostgresChangesPayload<Record<string, unknown>>>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        () => {
          void loadConversations(true);
        }
      )
      .subscribe();
  };

  const bindPresenceRealtime = async () => {
    if (!supabaseClient) return;
    if (presenceChannel) {
      await supabaseClient.removeChannel(presenceChannel);
      presenceChannel = null;
    }

    const peerIds = [...new Set(conversations.map((conversation) => conversation.peer?.id).filter((id): id is string => Boolean(id)))];
    if (!peerIds.length) return;

    presenceChannel = supabaseClient
      .channel('messenger:presence')
      .on<RealtimePostgresChangesPayload<Record<string, unknown>>>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_presence' },
        (payload) => {
          const row =
            payload.eventType === 'DELETE'
              ? (payload.old as Record<string, unknown> | null)
              : (payload.new as Record<string, unknown> | null);
          const userId = typeof row?.user_id === 'string' ? row.user_id : null;
          const status = row?.status;
          const lastActiveAt = typeof row?.last_active_at === 'string' ? row.last_active_at : null;
          const updatedAt = typeof row?.updated_at === 'string' ? row.updated_at : null;
          if (!userId || !peerIds.includes(userId)) return;
          if (status !== 'online' && status !== 'away' && status !== 'offline') return;
          if (!lastActiveAt || !updatedAt) return;
          syncPeerPresence(userId, status, lastActiveAt, updatedAt);
        }
      )
      .subscribe();
  };

  const applyReactionRealtime = (
    eventType: 'INSERT' | 'DELETE' | 'UPDATE',
    row: { message_id?: string | null; user_id?: string | null; emoji?: string | null } | null
  ) => {
    if (!row?.message_id || !row?.emoji) return;
    if (!messages.some((message) => message.id === row.message_id)) return;
    if (row.emoji !== '👍' && row.emoji !== '❤️' && row.emoji !== '😂' && row.emoji !== '😮' && row.emoji !== '😢' && row.emoji !== '🔥') {
      return;
    }

    const current = reactionsByMessageId[row.message_id] ?? [];
    const existing = current.find((entry) => entry.emoji === row.emoji) ?? null;

    if (eventType === 'INSERT') {
      if (!existing) {
        reactionsByMessageId = {
          ...reactionsByMessageId,
          [row.message_id]: [
            ...current,
            {
              emoji: row.emoji,
              count: 1,
              reacted: row.user_id === currentUserId
            }
          ]
        };
        return;
      }

      reactionsByMessageId = {
        ...reactionsByMessageId,
        [row.message_id]: current.map((entry) =>
          entry.emoji === row.emoji
            ? {
                ...entry,
                count: entry.count + 1,
                reacted: entry.reacted || row.user_id === currentUserId
              }
            : entry
        )
      };
      return;
    }

    if (!existing) return;

    const next = current
      .map((entry) =>
        entry.emoji === row.emoji
          ? {
              ...entry,
              count: Math.max(0, entry.count - 1),
              reacted: row.user_id === currentUserId ? false : entry.reacted
            }
          : entry
      )
      .filter((entry) => entry.count > 0);

    reactionsByMessageId = {
      ...reactionsByMessageId,
      [row.message_id]: next
    };
  };

  const bindActiveMessagesRealtime = async () => {
    if (!supabaseClient) return;

    if (activeMessagesChannel) {
      if (localTypingActive) {
        void sendTyping(false, true);
      }
      await supabaseClient.removeChannel(activeMessagesChannel);
      activeMessagesChannel = null;
    }

    clearTypingUsers();

    if (!activeConversationId) return;

    const conversationId = activeConversationId;
    activeMessagesChannel = supabaseClient
      .channel(`messenger:messages:${conversationId}`, {
        config: {
          broadcast: { self: false, ack: false }
        }
      })
      .on<RealtimePostgresChangesPayload<MessengerMessage>>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          const incoming = payload.new as unknown as MessengerMessage;
          if (!incoming || typeof incoming.id !== 'string') return;

          if (conversationId === activeConversationId) {
            if (!messages.some((message) => message.id === incoming.id)) {
              messages = [...messages, incoming];
            }

            conversations = conversations
              .map((conversation) =>
                conversation.conversationId === conversationId
                  ? {
                      ...conversation,
                    last_message_at: incoming.created_at,
                    preview: incoming.deleted_at
                      ? 'Message removed'
                      : incoming.body || (incoming.preview_kind === 'gif' ? 'GIF' : incoming.has_attachments ? '📷 Photo' : ''),
                    unreadCount: incoming.sender_id === currentUserId ? 0 : conversation.unreadCount
                  }
                : conversation
              )
              .sort(byNewest);

            if (incoming.has_attachments) {
              void loadMessages(conversationId, false);
            }
            scheduleRead(conversationId);
            return;
          }

          conversations = conversations
            .map((conversation) =>
              conversation.conversationId === conversationId
                ? {
                    ...conversation,
                    last_message_at: incoming.created_at,
                    preview: incoming.deleted_at
                      ? 'Message removed'
                      : incoming.body || (incoming.preview_kind === 'gif' ? 'GIF' : incoming.has_attachments ? '📷 Photo' : ''),
                    unreadCount: incoming.sender_id === currentUserId ? conversation.unreadCount : conversation.unreadCount + 1
                  }
                : conversation
            )
            .sort(byNewest);
        }
      )
      .on<RealtimePostgresChangesPayload<MessengerMessage>>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          const incoming = payload.new as unknown as MessengerMessage;
          if (!incoming || typeof incoming.id !== 'string') return;
          messages = messages.map((message) => (message.id === incoming.id ? { ...message, ...incoming } : message));
        }
      )
      .on<RealtimePostgresChangesPayload<Record<string, unknown>>>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_members',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row) return;
          const userId = typeof row.user_id === 'string' ? row.user_id : null;
          const lastReadAt = typeof row.last_read_at === 'string' ? row.last_read_at : null;
          if (!userId || !lastReadAt || userId === currentUserId) return;
          seenByPeerAt = lastReadAt;
        }
      )
      .on<RealtimePostgresChangesPayload<Record<string, unknown>>>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const row =
            payload.eventType === 'DELETE'
              ? (payload.old as Record<string, unknown> | null)
              : (payload.new as Record<string, unknown> | null);
          applyReactionRealtime(payload.eventType, {
            message_id: typeof row?.message_id === 'string' ? row.message_id : null,
            user_id: typeof row?.user_id === 'string' ? row.user_id : null,
            emoji: typeof row?.emoji === 'string' ? row.emoji : null
          });
        }
      )
      .on('broadcast', { event: 'typing' }, (event) => {
        if (!presenceVisible) return;
        const payload = event.payload as { conversationId?: string; userId?: string; typing?: boolean } | null;
        if (!payload || payload.conversationId !== conversationId) return;
        if (!payload.userId || payload.userId === currentUserId) return;
        setUserTyping(payload.userId, payload.typing === true);
      })
      .subscribe();
  };

  onMount(async () => {
    if (!browser) return;
    supabaseClient = supabaseBrowser();
    const initialConversationHint = new URL(window.location.href).searchParams.get('conversationId');

    await loadConversations(false);
    await loadFriendOptions();
    if (typeof initialConversationHint === 'string' && initialConversationHint.length > 0) {
      await handleSelectConversation(initialConversationHint);
    }
    await bindConversationsRealtime();
    await bindPresenceRealtime();
    await bindActiveMessagesRealtime();

    if (activeConversationId) {
      await markConversationRead(activeConversationId);
    }
  });

  onDestroy(() => {
    if (!supabaseClient) return;
    if (readDebounce) {
      clearTimeout(readDebounce);
      readDebounce = null;
    }
    if (typingStopTimer) {
      clearTimeout(typingStopTimer);
      typingStopTimer = null;
    }
    clearTypingUsers();
    if (activeMessagesChannel) {
      if (localTypingActive) {
        void sendTyping(false, true);
      }
      void supabaseClient.removeChannel(activeMessagesChannel);
      activeMessagesChannel = null;
    }
    if (conversationsChannel) {
      void supabaseClient.removeChannel(conversationsChannel);
      conversationsChannel = null;
    }
    if (presenceChannel) {
      void supabaseClient.removeChannel(presenceChannel);
      presenceChannel = null;
    }
  });
</script>

<div class="messenger-shell">
  <ConversationList
    conversations={filteredConversations}
    {activeConversationId}
    query={searchQuery}
    on:select={(event) => handleSelectConversation(event.detail.conversationId)}
    on:create={() => {
      showStartModal = true;
      startModalError = null;
      void loadFriendOptions();
    }}
    on:query={(event) => {
      searchQuery = event.detail.value;
    }}
  />

  <section class="thread-panel">
    {#if !activeConversationId}
      <div class="thread-empty">
        <p>Pick a conversation to start messaging.</p>
      </div>
    {:else}
      <ChatThread
        messages={messages}
        reactionsByMessageId={reactionsByMessageId}
        {currentUserId}
        {viewerCanModerate}
        {moderationByUserId}
        blocked={activeConversation?.blocked ?? false}
        loading={loadingConversations || loadingMessages}
        title={threadTitle}
        {presenceLabel}
        {typingLabel}
        {seenLabel}
        on:report={handleReportMessage}
        on:react={handleReactMessage}
        on:edit={handleEditMessage}
        on:delete={handleDeleteMessage}
        on:openMedia={handleOpenMedia}
      >
        <svelte:fragment slot="composer">
          {#if activeConversation?.peer?.id}
            <div class="thread-actions">
              <button type="button" on:click={handleBlock} disabled={activeConversation?.blocked}>Block user</button>
            </div>
          {/if}
          <MessageComposer
            conversationId={activeConversationId}
            disabled={(activeConversation?.blocked ?? false) || sendLocked}
            {sending}
            editing={editingMessageId !== null}
            editSeed={editingSeed}
            on:send={handleSendMessage}
            on:typing={handleComposerTyping}
            on:cancelEdit={() => {
              editingMessageId = null;
              editingSeed = '';
            }}
          />
        </svelte:fragment>
      </ChatThread>
    {/if}

    {#if nextCursor && activeConversationId}
      <button
        class="load-older"
        type="button"
        on:click={() => loadMessages(activeConversationId as string, true)}
      >
        Load older messages
      </button>
    {/if}

    {#if errorMessage}
      <p class="surface-error" role="status">{errorMessage}</p>
    {/if}
    {#if mediaViewerError}
      <p class="surface-error" role="status">{mediaViewerError}</p>
    {/if}
  </section>
</div>

<StartChatModal
  open={showStartModal}
  loading={startModalLoading}
  error={startModalError}
  friends={startModalFriends}
  on:close={() => {
    showStartModal = false;
  }}
  on:start={handleStartChat}
  on:startFriend={handleStartChatWithFriend}
/>

<MediaViewerModal
  open={mediaViewerOpen}
  items={galleryItems}
  startIndex={mediaViewerStartIndex}
  onClose={() => {
    mediaViewerOpen = false;
  }}
  on:close={() => {
    mediaViewerOpen = false;
  }}
/>

<style>
  .messenger-shell {
    min-height: calc(100vh - 9rem);
    margin: 1rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 1rem;
    overflow: hidden;
    display: grid;
    grid-template-columns: 340px 1fr;
    background:
      linear-gradient(165deg, rgba(15, 23, 42, 0.72), rgba(2, 6, 23, 0.8)),
      radial-gradient(circle at right top, rgba(8, 145, 178, 0.22), transparent 52%);
  }

  .thread-panel {
    min-height: 0;
    display: grid;
    grid-template-rows: 1fr auto;
    position: relative;
  }

  .thread-empty {
    display: grid;
    place-items: center;
    color: rgba(203, 213, 225, 0.86);
  }

  .thread-actions {
    padding: 0.6rem 0.85rem 0;
    display: flex;
    justify-content: flex-end;
  }

  .thread-actions button,
  .load-older {
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 0.66rem;
    background: rgba(15, 23, 42, 0.62);
    color: #e2e8f0;
    padding: 0.45rem 0.75rem;
    cursor: pointer;
  }

  .load-older {
    justify-self: center;
    margin: 0.3rem 0 0.8rem;
  }

  .surface-error {
    position: absolute;
    left: 1rem;
    bottom: 1rem;
    margin: 0;
    color: #fda4af;
    background: rgba(51, 65, 85, 0.88);
    border: 1px solid rgba(251, 113, 133, 0.35);
    border-radius: 0.6rem;
    padding: 0.45rem 0.65rem;
  }

  @media (max-width: 960px) {
    .messenger-shell {
      margin: 0.5rem 0.5rem 5.2rem;
      min-height: calc(100vh - 7rem);
      grid-template-columns: 1fr;
      grid-template-rows: minmax(16rem, 35vh) 1fr;
    }
  }
</style>
