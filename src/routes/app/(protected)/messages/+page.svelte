<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
  import {
    Bell,
    ImageIcon,
    Menu,
    MessageCircle,
    Mic,
    MicOff,
    MoreHorizontal,
    Pencil,
    Phone,
    PhoneOff,
    Search,
    SlidersHorizontal,
    Video,
    VideoOff
  } from 'lucide-svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import ChatThread from '$lib/components/messenger/ChatThread.svelte';
  import MessageComposer from '$lib/components/messenger/MessageComposer.svelte';
  import StartChatModal from '$lib/components/messenger/StartChatModal.svelte';
  import MediaViewerModal from '$lib/components/messenger/MediaViewerModal.svelte';
  import FantasySidebar from '$lib/components/home/fantasy/FantasySidebar.svelte';
  import MemvoyaBrand from '$lib/components/brand/MemvoyaBrand.svelte';
  import ProtectedTopbar from '$lib/components/layout/ProtectedTopbar.svelte';
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
  let activeInboxFilter: 'all' | 'friends' | 'groups' | 'unread' = 'all';
  let isCompactLayout = false;
  let mobilePanel: 'list' | 'thread' = 'list';

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
  let callOpen = false;
  let callMode: 'voice' | 'video' = 'voice';
  let callStarting = false;
  let callError: string | null = null;
  let localCallStream: MediaStream | null = null;
  let remoteCallStream: MediaStream | null = null;
  let localVideoRef: HTMLVideoElement | null = null;
  let remoteVideoRef: HTMLVideoElement | null = null;
  let remoteAudioRef: HTMLAudioElement | null = null;
  let peerConnection: RTCPeerConnection | null = null;
  let callId: string | null = null;
  let incomingOffer: RTCSessionDescriptionInit | null = null;
  let callPhase: 'idle' | 'incoming' | 'outgoing' | 'connecting' | 'connected' = 'idle';
  let callMicMuted = false;
  let callCameraOff = false;

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
  let teardownCompactLayoutListener: (() => void) | null = null;

  const byNewest = (a: MessengerConversation, b: MessengerConversation) => {
    const aTime = a.last_message_at ? Date.parse(a.last_message_at) : 0;
    const bTime = b.last_message_at ? Date.parse(b.last_message_at) : 0;
    return bTime - aTime;
  };

  const formatInboxTime = (iso: string | null) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const deltaMs = Math.max(0, Date.now() - date.getTime());
    const minutes = Math.floor(deltaMs / 60_000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const conversationTitle = (conversation: MessengerConversation) => {
    if (conversation.type === 'group' && conversation.group_name) return conversation.group_name;
    if (conversation.peer?.display_name) return conversation.peer.display_name;
    if (conversation.peer?.handle) return `@${conversation.peer.handle}`;
    return conversation.peer?.id ? conversation.peer.id.slice(0, 8) : 'Conversation';
  };

  const conversationSubtitle = (conversation: MessengerConversation) => {
    if (conversation.blocked) return 'Blocked';
    return conversation.preview?.trim() || 'No messages yet';
  };

  const conversationInitial = (conversation: MessengerConversation) =>
    conversationTitle(conversation).trim().slice(0, 1).toUpperCase() || 'L';

  const conversationAvatar = (conversation: MessengerConversation) => conversation.peer?.avatar_url ?? null;

  const presenceClass = (conversation: MessengerConversation) => {
    const status = conversation.peer?.presence?.status ?? null;
    if (status === 'online') return 'online';
    if (status === 'away') return 'away';
    if (status === 'offline') return 'offline';
    return 'hidden';
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
    const matchesSearch = key.includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeInboxFilter === 'unread') return conversation.unreadCount > 0;
    if (activeInboxFilter === 'groups') return conversation.type === 'group';
    if (activeInboxFilter === 'friends') return conversation.type !== 'group';
    return true;
  });

  $: activeConversation =
    activeConversationId
      ? conversations.find((conversation) => conversation.conversationId === activeConversationId) ?? null
      : null;
  $: showConversationPanel = !isCompactLayout || mobilePanel === 'list' || !activeConversationId;
  $: showThreadPanel = !isCompactLayout || (mobilePanel === 'thread' && Boolean(activeConversationId));

  $: threadTitle =
    activeConversation?.peer?.display_name ??
    (activeConversation?.peer?.handle ? `@${activeConversation.peer.handle}` : activeConversation?.group_name ?? 'Conversation');
  $: playerName =
    (data as any)?.profile?.display_name ??
    (data as any)?.profile?.username ??
    (data as any)?.user?.user_metadata?.name ??
    (data as any)?.user?.email?.split('@')?.[0] ??
    'Alex';
  $: profileAvatarUrl =
    (data as any)?.profile?.avatar_url ??
    (data as any)?.user?.user_metadata?.avatar_url ??
    (data as any)?.user?.user_metadata?.picture ??
    null;
  $: shardBalance = Math.max(
    0,
    Math.floor((data as any)?.shardBalance ?? (data as any)?.wallet?.shards ?? (data as any)?.wallet?.balance ?? 0)
  );
  $: onlineFriends = conversations
    .filter((conversation) => conversation.peer?.presence?.status === 'online')
    .slice(0, 5);
  $: recentActivity = conversations
    .filter((conversation) => conversation.last_message_at)
    .slice(0, 4);
  $: unreadConversationsCount = conversations.reduce((sum, conversation) => sum + (conversation.unreadCount > 0 ? 1 : 0), 0);
  $: inboxTabs = [
    { key: 'all', label: 'Messages' },
    { key: 'friends', label: 'Friends' },
    { key: 'groups', label: 'Groups' },
    { key: 'unread', label: 'Notifications' }
  ] as const;

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
    if (conversationId === activeConversationId) {
      mobilePanel = 'thread';
      return;
    }
    activeConversationId = conversationId;
    mobilePanel = 'thread';
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

  const returnToInbox = () => {
    mediaViewerOpen = false;
    mediaViewerError = null;
    mobilePanel = 'list';
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

  const syncLocalVideo = () => {
    if (!localVideoRef) return;
    localVideoRef.srcObject = callMode === 'video' ? localCallStream : null;
  };

  const syncRemoteMedia = () => {
    if (remoteVideoRef) remoteVideoRef.srcObject = callMode === 'video' ? remoteCallStream : null;
    if (remoteAudioRef) remoteAudioRef.srcObject = remoteCallStream;
  };

  const sendCallSignal = async (payload: Record<string, unknown>) => {
    if (!activeMessagesChannel || !activeConversationId || !currentUserId) return;
    await activeMessagesChannel
      .send({
        type: 'broadcast',
        event: 'call-signal',
        payload: {
          conversationId: activeConversationId,
          fromUserId: currentUserId,
          ...payload
        }
      })
      .catch(() => {});
  };

  const closePeerConnection = () => {
    if (peerConnection) {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
    }
    peerConnection = null;
    remoteCallStream?.getTracks().forEach((track) => track.stop());
    remoteCallStream = null;
    syncRemoteMedia();
  };

  const stopLocalCallStream = () => {
    if (localCallStream) {
      localCallStream.getTracks().forEach((track) => track.stop());
    }
    localCallStream = null;
    syncLocalVideo();
  };

  const createPeerConnection = () => {
    closePeerConnection();
    const connection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    remoteCallStream = new MediaStream();
    syncRemoteMedia();

    connection.onicecandidate = (event) => {
      if (!event.candidate || !callId) return;
      void sendCallSignal({
        kind: 'candidate',
        callId,
        candidate: event.candidate.toJSON()
      });
    };

    connection.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        remoteCallStream = stream;
      } else {
        const next = remoteCallStream ?? new MediaStream();
        next.addTrack(event.track);
        remoteCallStream = next;
      }
      callPhase = 'connected';
      syncRemoteMedia();
    };

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'connected') callPhase = 'connected';
      if (connection.connectionState === 'failed' || connection.connectionState === 'disconnected') {
        callError = 'The call connection was interrupted.';
      }
    };

    peerConnection = connection;
    return connection;
  };

  const prepareLocalCallStream = async (mode: 'voice' | 'video') => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Calls are not supported in this browser.');
    }

    localCallStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video:
        mode === 'video'
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user'
            }
          : false
    });
    syncLocalVideo();
    return localCallStream;
  };

  const startCall = async (mode: 'voice' | 'video') => {
    if (!browser || !activeConversationId) return;

    callMode = mode;
    callOpen = true;
    callStarting = true;
    callError = null;
    callMicMuted = false;
    callCameraOff = false;
    callPhase = 'outgoing';
    callId = crypto.randomUUID();
    incomingOffer = null;
    closePeerConnection();
    stopLocalCallStream();

    try {
      const stream = await prepareLocalCallStream(mode);
      const connection = createPeerConnection();
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await sendCallSignal({
        kind: 'offer',
        callId,
        mode,
        sdp: offer
      });
    } catch (err) {
      callError =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera or microphone permission was denied.'
          : err instanceof Error
            ? err.message
            : 'Could not start the call. Check your device permissions and try again.';
      callPhase = 'idle';
      stopLocalCallStream();
      closePeerConnection();
    } finally {
      callStarting = false;
    }
  };

  const acceptIncomingCall = async () => {
    if (!browser || !incomingOffer || !callId) return;
    callStarting = true;
    callError = null;
    callPhase = 'connecting';
    stopLocalCallStream();
    closePeerConnection();

    try {
      const stream = await prepareLocalCallStream(callMode);
      const connection = createPeerConnection();
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      await connection.setRemoteDescription(incomingOffer);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await sendCallSignal({
        kind: 'answer',
        callId,
        mode: callMode,
        sdp: answer
      });
      incomingOffer = null;
    } catch (err) {
      callError =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera or microphone permission was denied.'
          : err instanceof Error
            ? err.message
            : 'Could not answer the call.';
      callPhase = 'idle';
      stopLocalCallStream();
      closePeerConnection();
    } finally {
      callStarting = false;
    }
  };

  const endCall = () => {
    if (callId) {
      void sendCallSignal({ kind: 'end', callId });
    }
    callOpen = false;
    callStarting = false;
    callError = null;
    callId = null;
    callPhase = 'idle';
    incomingOffer = null;
    callMicMuted = false;
    callCameraOff = false;
    stopLocalCallStream();
    closePeerConnection();
  };

  const dismissIncomingCall = () => {
    if (callId) {
      void sendCallSignal({ kind: 'decline', callId });
    }
    callOpen = false;
    callStarting = false;
    callError = null;
    callId = null;
    callPhase = 'idle';
    incomingOffer = null;
  };

  const toggleMic = () => {
    callMicMuted = !callMicMuted;
    localCallStream?.getAudioTracks().forEach((track) => {
      track.enabled = !callMicMuted;
    });
  };

  const toggleCamera = () => {
    callCameraOff = !callCameraOff;
    localCallStream?.getVideoTracks().forEach((track) => {
      track.enabled = !callCameraOff;
    });
  };

  const handleCallSignal = async (payload: unknown) => {
    if (!payload || typeof payload !== 'object' || !currentUserId || !activeConversationId) return;
    const signal = payload as Record<string, unknown>;
    if (signal.conversationId !== activeConversationId || signal.fromUserId === currentUserId) return;
    const kind = signal.kind;
    const signalCallId = typeof signal.callId === 'string' ? signal.callId : null;

    if (kind === 'offer') {
      const mode = signal.mode === 'video' ? 'video' : 'voice';
      const sdp = signal.sdp;
      if (!signalCallId || !sdp || typeof sdp !== 'object') return;
      if (callOpen && callPhase !== 'incoming') {
        await sendCallSignal({ kind: 'busy', callId: signalCallId });
        return;
      }
      callId = signalCallId;
      callMode = mode;
      incomingOffer = sdp as RTCSessionDescriptionInit;
      callPhase = 'incoming';
      callOpen = true;
      callStarting = false;
      callError = null;
      return;
    }

    if (!signalCallId || signalCallId !== callId) return;

    if (kind === 'answer') {
      const sdp = signal.sdp;
      if (!peerConnection || !sdp || typeof sdp !== 'object') return;
      await peerConnection.setRemoteDescription(sdp as RTCSessionDescriptionInit).catch(() => {
        callError = 'Could not connect the call.';
      });
      callPhase = 'connecting';
      return;
    }

    if (kind === 'candidate') {
      const candidate = signal.candidate;
      if (!peerConnection || !candidate || typeof candidate !== 'object') return;
      await peerConnection.addIceCandidate(candidate as RTCIceCandidateInit).catch(() => {});
      return;
    }

    if (kind === 'busy') {
      callError = `${threadTitle} is unavailable right now.`;
      return;
    }

    if (kind === 'decline') {
      callError = `${threadTitle} declined the call.`;
      closePeerConnection();
      stopLocalCallStream();
      callPhase = 'idle';
      return;
    }

    if (kind === 'end') {
      callOpen = false;
      callId = null;
      callPhase = 'idle';
      incomingOffer = null;
      stopLocalCallStream();
      closePeerConnection();
    }
  };

  $: if (localVideoRef || localCallStream || callMode) {
    syncLocalVideo();
  }

  $: if (remoteVideoRef || remoteAudioRef || remoteCallStream || callMode) {
    syncRemoteMedia();
  }

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
      .on('broadcast', { event: 'call-signal' }, (event) => {
        void handleCallSignal(event.payload);
      })
      .subscribe();
  };

  onMount(async () => {
    if (!browser) return;
    supabaseClient = supabaseBrowser();
    const initialConversationHint = new URL(window.location.href).searchParams.get('conversationId');
    const mediaQuery = window.matchMedia('(max-width: 720px)');
    const syncCompactLayout = () => {
      isCompactLayout = mediaQuery.matches;
      if (!mediaQuery.matches) {
        mobilePanel = 'thread';
        return;
      }
      mobilePanel = activeConversationId ? 'thread' : 'list';
    };
    syncCompactLayout();
    mediaQuery.addEventListener('change', syncCompactLayout);
    teardownCompactLayoutListener = () => {
      mediaQuery.removeEventListener('change', syncCompactLayout);
    };

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
    if (teardownCompactLayoutListener) {
      teardownCompactLayoutListener();
      teardownCompactLayoutListener = null;
    }
    endCall();
  });
</script>

<svelte:head>
  <title>Memvoya | Messages</title>
</svelte:head>

<div class="messages-app">
  <FantasySidebar
    activePath="/app/messages"
    {playerName}
  />

  <main class="messages-workspace" aria-label="Messages">
    <header class="mobile-chrome" aria-label="Messages header">
      <MemvoyaBrand href="/app/home" size="sm" showMark={false} ariaLabel="Memvoya home" />
      <div class="mobile-chrome__actions">
        <button type="button" aria-label="Open notifications">
          <Bell size={24} />
          {#if unreadConversationsCount > 0}
            <span aria-hidden="true"></span>
          {/if}
        </button>
        <button type="button" aria-label="Open menu"><Menu size={27} /></button>
      </div>
    </header>

    <ProtectedTopbar
      searchValue={searchQuery}
      searchPlaceholder="Search messages or users..."
      searchAriaLabel="Search messages or users"
      localSearch
      onSearch={(search) => (searchQuery = search)}
      {shardBalance}
      notifications={(data as any)?.notifications ?? []}
      profileDisplayName={playerName}
      {profileAvatarUrl}
    />

    <div class="messages-grid">
      <section class="messages-heading">
        <div>
          <h1>Messages <span aria-hidden="true">✦</span></h1>
          <p>Keep close human conversations and group threads easy to reach.</p>
        </div>
        <div class="heading-actions">
          <button
            class="new-message"
            type="button"
            on:click={() => {
              showStartModal = true;
              startModalError = null;
              void loadFriendOptions();
            }}
          >
            <Pencil size={17} />
            <span>New Message</span>
          </button>
          <button class="filter-button" type="button" aria-label="Filter messages">
            <SlidersHorizontal size={18} />
          </button>
        </div>
      </section>

      {#if showConversationPanel}
        <section class="inbox-panel" aria-label="Conversation list">
          <nav class="inbox-tabs" aria-label="Message filters">
            {#each inboxTabs as tab}
              <button
                type="button"
                class:mobile-tab-hidden={tab.key === 'friends' || tab.key === 'groups'}
                class:is-active={activeInboxFilter === tab.key}
                on:click={() => (activeInboxFilter = tab.key)}
              >
                {tab.label}
                {#if tab.key === 'unread' && unreadConversationsCount > 0}
                  <span>{unreadConversationsCount > 9 ? '9+' : unreadConversationsCount}</span>
                {/if}
              </button>
            {/each}
          </nav>

          <div class="mobile-search-row">
            <label class="global-search" aria-label="Search messages or users">
              <Search size={24} />
              <input
                type="search"
                placeholder="Search messages..."
                value={searchQuery}
                on:input={(event) => (searchQuery = (event.currentTarget as HTMLInputElement).value)}
              />
            </label>
            <button class="filter-button" type="button" aria-label="Filter messages">
              <SlidersHorizontal size={22} />
            </button>
          </div>

          <div class="conversation-list" role="listbox" aria-label="Messages">
            {#if loadingConversations && filteredConversations.length === 0}
              <p class="empty-state">Loading messages...</p>
            {:else if filteredConversations.length === 0}
              <p class="empty-state">No messages found.</p>
            {:else}
              {#each filteredConversations as conversation (conversation.conversationId)}
                <button
                  type="button"
                  role="option"
                  aria-selected={conversation.conversationId === activeConversationId}
                  class="conversation-row"
                  class:is-active={conversation.conversationId === activeConversationId}
                  on:click={() => handleSelectConversation(conversation.conversationId)}
                >
                  <span class="avatar-wrap">
                    {#if conversationAvatar(conversation)}
                      <img src={conversationAvatar(conversation)} alt="" loading="lazy" />
                    {:else}
                      <span>{conversationInitial(conversation)}</span>
                    {/if}
                    <i class={`presence-dot ${presenceClass(conversation)}`} aria-hidden="true"></i>
                  </span>
                  <span class="conversation-copy">
                    <span class="conversation-title">
                      <strong>{conversationTitle(conversation)}</strong>
                      <em>{conversation.type === 'group' ? 'Group' : 'Message'}</em>
                      <time datetime={conversation.last_message_at ?? undefined}>{formatInboxTime(conversation.last_message_at)}</time>
                    </span>
                    <span class="conversation-preview">{conversationSubtitle(conversation)}</span>
                  </span>
                  {#if conversation.unreadCount > 0}
                    <span class="unread-badge">{conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}</span>
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        </section>
      {/if}

      {#if showThreadPanel}
        <section class="chat-panel" aria-label="Active conversation">
          {#if isCompactLayout && activeConversationId}
            <div class="mobile-thread-bar">
              <button type="button" class="mobile-thread-bar__back" on:click={returnToInbox}>Back</button>
              <div class="mobile-thread-bar__body">
                <strong>{threadTitle}</strong>
                <span>{typingLabel ?? presenceLabel ?? 'Conversation'}</span>
              </div>
            </div>
          {/if}

          <div class="chat-header">
            <div class="chat-person">
              <span class="avatar-wrap avatar-wrap--large">
                {#if activeConversation && conversationAvatar(activeConversation)}
                  <img src={conversationAvatar(activeConversation)} alt="" loading="lazy" />
                {:else}
                  <span>{activeConversation ? conversationInitial(activeConversation) : 'M'}</span>
                {/if}
                {#if activeConversation}
                  <i class={`presence-dot ${presenceClass(activeConversation)}`} aria-hidden="true"></i>
                {/if}
              </span>
              <div>
                <h2>{threadTitle}</h2>
                <p>{presenceLabel ?? 'Human conversation'}</p>
              </div>
            </div>
            <div class="chat-actions">
              <button type="button" aria-label="Start voice call" on:click={() => startCall('voice')} disabled={!activeConversationId}>
                <Phone size={18} />
              </button>
              <button type="button" aria-label="Start video call" on:click={() => startCall('video')} disabled={!activeConversationId}>
                <Video size={18} />
              </button>
              <button type="button" aria-label="More actions"><MoreHorizontal size={18} /></button>
            </div>
          </div>

          {#if !activeConversationId}
            <div class="thread-empty">
              <p>Pick a close thread when you are ready to speak with care.</p>
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
            <button class="load-older" type="button" on:click={() => loadMessages(activeConversationId as string, true)}>
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
      {/if}

      <aside class="right-rail" aria-label="Message details">
        <section class="rail-card">
          <header class="rail-card__header">
            <h2>Active Friends <span>• {onlineFriends.length} Online</span></h2>
            <a href="/app/friends">View All</a>
          </header>
          <div class="friend-list">
            {#each onlineFriends as conversation}
              <a href={`/app/messages?conversationId=${conversation.conversationId}`} class="friend-row">
                <span class="avatar-wrap">
                  {#if conversationAvatar(conversation)}
                    <img src={conversationAvatar(conversation)} alt="" loading="lazy" />
                  {:else}
                    <span>{conversationInitial(conversation)}</span>
                  {/if}
                  <i class="presence-dot online" aria-hidden="true"></i>
                </span>
                <span>
                  <strong>{conversationTitle(conversation)}</strong>
                  <small>{presenceLabel ?? 'In Looma Prime'}</small>
                </span>
                <MessageCircle size={17} />
              </a>
            {:else}
              <p class="empty-state">No friends online yet.</p>
            {/each}
          </div>
        </section>

        <section class="rail-card">
          <header class="rail-card__header">
            <h2>Recent Activity</h2>
            <a href="/app/notifications">View All</a>
          </header>
          <div class="activity-list">
            {#each recentActivity as conversation}
              <a href={`/app/messages?conversationId=${conversation.conversationId}`} class="activity-row">
                <span class="activity-icon"><ImageIcon size={16} /></span>
                <span>{conversationTitle(conversation)} sent a message</span>
                <time datetime={conversation.last_message_at ?? undefined}>{formatInboxTime(conversation.last_message_at)}</time>
              </a>
            {:else}
              <p class="empty-state">No recent message activity.</p>
            {/each}
          </div>
          <a class="rail-primary" href="/app/notifications">See All Activity</a>
        </section>
      </aside>
    </div>
  </main>

  {#if callOpen}
    <div class="call-overlay" role="dialog" aria-modal="true" aria-label={`${callMode === 'video' ? 'Video' : 'Voice'} call`}>
      <div class="call-card">
        <header class="call-card__header">
          <div class="call-peer">
            <span class="avatar-wrap avatar-wrap--large">
              {#if activeConversation && conversationAvatar(activeConversation)}
                <img src={conversationAvatar(activeConversation)} alt="" />
              {:else}
                <span>{activeConversation ? conversationInitial(activeConversation) : 'M'}</span>
              {/if}
            </span>
            <div>
              <p>{callMode === 'video' ? 'Video Call' : 'Voice Call'}</p>
              <h2>{threadTitle}</h2>
              <span>
                {#if callPhase === 'incoming'}
                  Incoming {callMode === 'video' ? 'video' : 'voice'} call
                {:else if callStarting}
                  Connecting devices...
                {:else if callError}
                  Needs attention
                {:else if callPhase === 'connected'}
                  Connected
                {:else}
                  Waiting for {threadTitle} to join
                {/if}
              </span>
            </div>
          </div>
          <button type="button" class="call-close" on:click={endCall} aria-label="Close call"><PhoneOff size={19} /></button>
        </header>

        <div class="call-stage" class:call-stage--voice={callMode === 'voice'}>
          {#if callMode === 'video' && remoteCallStream && callPhase === 'connected'}
            <video bind:this={remoteVideoRef} autoplay muted playsinline></video>
          {:else if callMode === 'video' && localCallStream && !callCameraOff}
            <video bind:this={localVideoRef} class="call-local-video--full" autoplay muted playsinline></video>
          {:else}
            <div class="call-orb" aria-hidden="true">
              <span>{threadTitle.slice(0, 1).toUpperCase()}</span>
            </div>
          {/if}
          <audio bind:this={remoteAudioRef} autoplay></audio>
          {#if callMode === 'video' && remoteCallStream && localCallStream && !callCameraOff}
            <video class="call-local-preview" bind:this={localVideoRef} autoplay muted playsinline></video>
          {/if}

          <div class="call-status">
            {#if callError}
              <strong>{callError}</strong>
              <span>Use the controls below to close the call and try again.</span>
            {:else if callPhase === 'incoming'}
              <strong>{threadTitle} is calling</strong>
              <span>Accept to share your {callMode === 'video' ? 'camera and microphone' : 'microphone'}.</span>
            {:else if callStarting}
              <strong>Starting {callMode === 'video' ? 'camera' : 'voice'} chat...</strong>
              <span>Your browser may ask for permission.</span>
            {:else if callPhase === 'connected'}
              <strong>{callMode === 'video' ? 'Video connected' : 'Voice connected'}</strong>
              <span>Your conversation is live.</span>
            {:else}
              <strong>{callMode === 'video' ? 'Camera ready' : 'Voice ready'}</strong>
              <span>Waiting for {threadTitle} to answer.</span>
            {/if}
          </div>
        </div>

        <footer class="call-controls">
          {#if callPhase === 'incoming'}
            <button type="button" class="accept-call" on:click={acceptIncomingCall} disabled={callStarting}>
              {#if callMode === 'video'}
                <Video size={20} />
              {:else}
                <Phone size={20} />
              {/if}
              <span>Accept</span>
            </button>
            <button type="button" class="end-call" on:click={dismissIncomingCall}>
              <PhoneOff size={20} />
              <span>Decline</span>
            </button>
          {:else}
            <button type="button" class:muted={callMicMuted} on:click={toggleMic} disabled={!localCallStream || Boolean(callError)}>
              {#if callMicMuted}
                <MicOff size={20} />
              {:else}
                <Mic size={20} />
              {/if}
              <span>{callMicMuted ? 'Unmute' : 'Mute'}</span>
            </button>
            {#if callMode === 'video'}
              <button type="button" class:muted={callCameraOff} on:click={toggleCamera} disabled={!localCallStream || Boolean(callError)}>
                {#if callCameraOff}
                  <VideoOff size={20} />
                {:else}
                  <Video size={20} />
                {/if}
                <span>{callCameraOff ? 'Camera On' : 'Camera Off'}</span>
              </button>
            {/if}
            <button type="button" class="end-call" on:click={endCall}>
              <PhoneOff size={20} />
              <span>End</span>
            </button>
          {/if}
        </footer>
      </div>
    </div>
  {/if}
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
  :global(body) {
    background: #050714;
  }

  :global(.app-shell:has(.messages-app)) {
    background: #050714;
  }

  .messages-app {
    display: grid;
    grid-template-columns: 14.5rem minmax(0, 1fr);
    min-height: 100vh;
    overflow: hidden;
    background:
      radial-gradient(circle at 78% 10%, rgba(88, 70, 205, 0.2), transparent 34rem),
      radial-gradient(circle at 45% 92%, rgba(37, 103, 191, 0.12), transparent 34rem),
      linear-gradient(180deg, #07091a 0%, #050714 100%);
    color: rgba(248, 246, 255, 0.94);
  }

  .messages-workspace {
    min-width: 0;
    height: 100vh;
    overflow: hidden;
    padding: 1.25rem 1.1rem 1rem 1.6rem;
  }

  .mobile-chrome,
  .mobile-chrome__actions,
  .messages-heading,
  .heading-actions,
  .chat-header,
  .chat-person,
  .chat-actions,
  .rail-card__header,
  .friend-row,
  .activity-row {
    display: flex;
    align-items: center;
  }

  .mobile-chrome,
  .mobile-search-row {
    display: none;
  }

  .global-search {
    display: flex;
    width: min(100%, 27.5rem);
    min-height: 2.95rem;
    align-items: center;
    gap: 0.78rem;
    border: 1px solid rgba(153, 130, 236, 0.18);
    border-radius: 1.05rem;
    background: rgba(8, 10, 29, 0.74);
    padding: 0 0.95rem;
    color: rgba(203, 200, 232, 0.72);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .global-search input {
    min-width: 0;
    flex: 1;
    border: 0;
    background: transparent;
    color: white;
    outline: 0;
  }

  .global-search input::placeholder {
    color: rgba(210, 205, 235, 0.55);
  }

  .messages-heading {
    grid-column: 1 / 3;
    grid-row: 1;
    justify-content: space-between;
    align-self: start;
    gap: 1rem;
    margin: 0;
  }

  .messages-heading h1 {
    margin: 0;
    color: white;
    font-size: clamp(1.75rem, 2.2vw, 2.2rem);
    line-height: 1.05;
    letter-spacing: 0;
  }

  .messages-heading h1 span {
    color: #d66dff;
    text-shadow: 0 0 22px rgba(194, 92, 255, 0.8);
  }

  .messages-heading p {
    margin: 0.48rem 0 0;
    color: rgba(213, 209, 236, 0.72);
  }

  .heading-actions {
    gap: 0.7rem;
  }

  .new-message,
  .filter-button,
  .chat-actions button {
    min-height: 2.75rem;
    border: 1px solid rgba(153, 130, 236, 0.2);
    border-radius: 0.78rem;
    color: white;
    cursor: pointer;
  }

  .new-message {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0 1.1rem;
    background: linear-gradient(135deg, rgba(96, 57, 184, 0.98), rgba(126, 59, 215, 0.94));
    box-shadow: 0 0 28px rgba(125, 63, 222, 0.32);
    font-weight: 800;
  }

  .filter-button,
  .chat-actions button {
    width: 2.75rem;
    display: grid;
    place-items: center;
    background: rgba(9, 11, 31, 0.82);
  }

  .messages-grid {
    display: grid;
    grid-template-columns: minmax(18rem, 30rem) minmax(27rem, 1fr) minmax(18rem, 23rem);
    grid-template-rows: auto minmax(0, 1fr);
    gap: 1rem;
    height: calc(100vh - 4.95rem);
    min-height: 0;
  }

  .inbox-panel {
    grid-column: 1;
    grid-row: 2;
  }

  .chat-panel {
    grid-column: 2;
    grid-row: 2;
  }

  .inbox-panel,
  .chat-panel,
  .rail-card {
    border: 1px solid rgba(153, 130, 236, 0.17);
    background:
      radial-gradient(circle at 70% 0%, rgba(126, 92, 255, 0.12), transparent 28rem),
      rgba(7, 10, 28, 0.82);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.045),
      0 22px 70px rgba(0, 0, 0, 0.18);
    backdrop-filter: blur(20px);
  }

  .inbox-panel {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border-radius: 0.95rem;
  }

  .inbox-tabs {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.3rem;
    padding: 0.58rem 0.58rem 0.45rem;
  }

  .inbox-tabs button {
    min-height: 2.25rem;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    color: rgba(219, 215, 239, 0.72);
    font-size: 0.84rem;
    cursor: pointer;
  }

  .inbox-tabs button.is-active,
  .inbox-tabs button:hover,
  .inbox-tabs button:focus-visible {
    border-color: rgba(167, 92, 255, 0.3);
    background: rgba(24, 20, 52, 0.88);
    color: white;
    outline: none;
  }

  .conversation-list {
    height: calc(100% - 3.2rem);
    overflow: auto;
    padding-bottom: 0.5rem;
  }

  .conversation-row {
    position: relative;
    display: grid;
    width: 100%;
    min-height: 5rem;
    grid-template-columns: 3.4rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.8rem;
    border: 0;
    border-top: 1px solid rgba(153, 130, 236, 0.1);
    background: transparent;
    color: inherit;
    padding: 0.72rem 0.9rem;
    text-align: left;
    cursor: pointer;
  }

  .conversation-row:hover,
  .conversation-row:focus-visible,
  .conversation-row.is-active {
    background:
      linear-gradient(90deg, rgba(124, 58, 237, 0.34), rgba(37, 21, 83, 0.62)),
      rgba(14, 13, 38, 0.88);
    outline: none;
  }

  .avatar-wrap {
    position: relative;
    display: grid;
    width: 3rem;
    height: 3rem;
    place-items: center;
    border-radius: 999px;
    background:
      radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.55), transparent 18%),
      linear-gradient(135deg, #a75cff, #24356f);
    color: white;
    font-weight: 900;
    box-shadow: 0 0 18px rgba(126, 92, 255, 0.38);
  }

  .avatar-wrap img {
    width: 100%;
    height: 100%;
    border-radius: inherit;
    object-fit: cover;
    display: block;
  }

  .avatar-wrap--large {
    width: 4.05rem;
    height: 4.05rem;
    font-size: 1.18rem;
  }

  .presence-dot {
    position: absolute;
    right: 0.12rem;
    bottom: 0.1rem;
    width: 0.62rem;
    height: 0.62rem;
    border: 2px solid #07091a;
    border-radius: 999px;
    background: #64748b;
  }

  .presence-dot.online {
    background: #64d95f;
  }

  .presence-dot.away {
    background: #f6c453;
  }

  .presence-dot.hidden {
    display: none;
  }

  .conversation-copy,
  .conversation-title {
    min-width: 0;
  }

  .conversation-title {
    display: flex;
    justify-content: space-between;
    gap: 0.55rem;
    align-items: baseline;
  }

  .conversation-title strong,
  .friend-row strong {
    overflow: hidden;
    color: white;
    font-size: 0.95rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .conversation-title em {
    flex: 0 0 auto;
    border-radius: 0.45rem;
    background: rgba(126, 60, 198, 0.26);
    color: #d8a3ff;
    font-size: 0.68rem;
    font-style: normal;
    line-height: 1;
    padding: 0.28rem 0.44rem;
  }

  .conversation-title time,
  .activity-row time {
    flex: 0 0 auto;
    color: rgba(202, 197, 229, 0.56);
    font-size: 0.72rem;
  }

  .conversation-preview {
    display: block;
    overflow: hidden;
    color: rgba(216, 211, 236, 0.72);
    font-size: 0.82rem;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: 0.24rem;
  }

  .unread-badge {
    min-width: 1.35rem;
    height: 1.35rem;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, #a75cff, #7c3aed);
    color: white;
    font-size: 0.72rem;
    font-weight: 900;
    box-shadow: 0 0 18px rgba(167, 92, 255, 0.6);
  }

  .chat-panel {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto 1fr;
    border-radius: 0.95rem;
  }

  .chat-header {
    justify-content: space-between;
    gap: 1rem;
    min-height: 5.45rem;
    border-bottom: 1px solid rgba(153, 130, 236, 0.14);
    background:
      radial-gradient(circle at 66% 0%, rgba(167, 92, 255, 0.24), transparent 15rem),
      linear-gradient(90deg, rgba(13, 17, 45, 0.96), rgba(17, 18, 48, 0.86));
    padding: 0.8rem 1rem;
  }

  .chat-person {
    min-width: 0;
    gap: 0.82rem;
  }

  .chat-person h2 {
    margin: 0;
    color: white;
    font-size: 1.1rem;
  }

  .chat-person p {
    margin: 0.22rem 0 0;
    color: rgba(211, 207, 236, 0.7);
    font-size: 0.82rem;
  }

  .chat-actions {
    gap: 0.55rem;
  }

  .thread-empty,
  .empty-state {
    margin: 0;
    color: rgba(211, 207, 236, 0.68);
  }

  .thread-empty {
    display: grid;
    place-items: center;
  }

  .right-rail {
    grid-column: 3;
    grid-row: 1 / 3;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    display: grid;
    align-content: start;
    gap: 0.82rem;
  }

  .rail-card {
    border-radius: 0.95rem;
    padding: 1rem;
  }

  .rail-card h2 {
    margin: 0;
    color: white;
  }

  .rail-card h2 {
    font-size: 0.95rem;
  }

  .rail-card__header {
    justify-content: space-between;
    gap: 0.8rem;
    margin-bottom: 0.9rem;
  }

  .rail-card__header h2 span {
    color: rgba(214, 208, 239, 0.58);
    font-weight: 500;
  }

  .rail-card__header a {
    color: rgba(211, 185, 255, 0.76);
    font-size: 0.78rem;
    text-decoration: none;
  }

  .rail-primary {
    display: flex;
    min-height: 2.55rem;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(186, 153, 255, 0.28);
    border-radius: 0.55rem;
    background: linear-gradient(135deg, rgba(74, 36, 151, 0.9), rgba(91, 40, 160, 0.86));
    color: white;
    font-weight: 800;
    text-decoration: none;
  }

  .friend-list,
  .activity-list {
    display: grid;
    gap: 0.72rem;
  }

  .friend-row {
    gap: 0.72rem;
    color: inherit;
    text-decoration: none;
  }

  .friend-row .avatar-wrap {
    width: 2.55rem;
    height: 2.55rem;
  }

  .friend-row span:nth-child(2) {
    min-width: 0;
    flex: 1;
    display: grid;
  }

  .friend-row small {
    overflow: hidden;
    color: #74db78;
    font-size: 0.78rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .friend-row > :global(svg) {
    color: rgba(214, 208, 239, 0.78);
  }

  .activity-row {
    gap: 0.64rem;
    color: rgba(232, 228, 248, 0.84);
    font-size: 0.82rem;
    text-decoration: none;
  }

  .activity-row span:nth-child(2) {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .activity-icon {
    display: grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.5rem;
    background: linear-gradient(135deg, rgba(167, 92, 255, 0.38), rgba(98, 232, 255, 0.16));
    color: white;
  }

  .load-older {
    position: absolute;
    top: 5.8rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
    border: 1px solid rgba(153, 130, 236, 0.24);
    border-radius: 999px;
    background: rgba(9, 11, 31, 0.88);
    color: white;
    padding: 0.45rem 0.85rem;
  }

  .surface-error {
    position: absolute;
    left: 1rem;
    right: 1rem;
    bottom: 5.2rem;
    z-index: 5;
    margin: 0;
    border: 1px solid rgba(251, 113, 133, 0.35);
    border-radius: 0.65rem;
    background: rgba(43, 16, 31, 0.92);
    color: #fda4af;
    padding: 0.55rem 0.7rem;
    text-align: center;
  }

  .call-overlay {
    position: fixed;
    inset: 0;
    z-index: 9200;
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at 50% 38%, rgba(126, 92, 255, 0.24), transparent 24rem),
      rgba(3, 5, 18, 0.82);
    padding: 1.25rem;
    backdrop-filter: blur(18px);
  }

  .call-card {
    width: min(44rem, 100%);
    overflow: hidden;
    border: 1px solid rgba(186, 153, 255, 0.26);
    border-radius: 1.15rem;
    background:
      radial-gradient(circle at 72% 14%, rgba(167, 92, 255, 0.28), transparent 18rem),
      linear-gradient(180deg, rgba(11, 14, 38, 0.98), rgba(5, 8, 24, 0.98));
    color: white;
    box-shadow:
      0 34px 100px rgba(0, 0, 0, 0.58),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  .call-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid rgba(153, 130, 236, 0.14);
    padding: 1rem;
  }

  .call-peer {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }

  .call-peer p,
  .call-peer h2,
  .call-peer span {
    margin: 0;
  }

  .call-peer p {
    color: #d7a8ff;
    font-size: 0.76rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .call-peer h2 {
    margin-top: 0.18rem;
    font-size: 1.35rem;
  }

  .call-peer span {
    display: block;
    margin-top: 0.2rem;
    color: rgba(220, 215, 242, 0.68);
    font-size: 0.85rem;
  }

  .call-close,
  .call-controls button {
    border: 1px solid rgba(186, 153, 255, 0.22);
    color: white;
    cursor: pointer;
  }

  .call-close {
    display: grid;
    width: 2.75rem;
    height: 2.75rem;
    place-items: center;
    border-radius: 999px;
    background: rgba(255, 84, 117, 0.12);
  }

  .call-stage {
    position: relative;
    display: grid;
    min-height: min(55vh, 27rem);
    place-items: center;
    background:
      radial-gradient(circle at 50% 42%, rgba(98, 232, 255, 0.1), transparent 15rem),
      rgba(2, 5, 18, 0.68);
  }

  .call-stage video {
    width: 100%;
    height: min(55vh, 27rem);
    display: block;
    object-fit: cover;
    background: #050714;
  }

  .call-stage audio {
    display: none;
  }

  .call-local-preview {
    position: absolute;
    right: 1rem;
    top: 1rem;
    width: min(11rem, 32vw) !important;
    height: min(7rem, 20vw) !important;
    border: 1px solid rgba(186, 153, 255, 0.32);
    border-radius: 0.8rem;
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.4);
  }

  .call-stage--voice {
    min-height: 22rem;
  }

  .call-orb {
    display: grid;
    width: 9rem;
    height: 9rem;
    place-items: center;
    border-radius: 999px;
    background:
      radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.56), transparent 16%),
      linear-gradient(135deg, #a75cff, #2f1f7a);
    box-shadow:
      0 0 34px rgba(167, 92, 255, 0.62),
      0 0 90px rgba(98, 232, 255, 0.16);
    font-size: 3rem;
    font-weight: 900;
  }

  .call-status {
    position: absolute;
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
    display: grid;
    gap: 0.2rem;
    border: 1px solid rgba(186, 153, 255, 0.18);
    border-radius: 0.8rem;
    background: rgba(4, 7, 22, 0.72);
    padding: 0.75rem 0.9rem;
    text-align: center;
    backdrop-filter: blur(14px);
  }

  .call-status strong {
    color: white;
  }

  .call-status span {
    color: rgba(220, 215, 242, 0.68);
    font-size: 0.82rem;
  }

  .call-controls {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.65rem;
    border-top: 1px solid rgba(153, 130, 236, 0.14);
    padding: 1rem;
  }

  .call-controls button {
    display: inline-flex;
    min-height: 2.85rem;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border-radius: 999px;
    background: rgba(14, 18, 47, 0.9);
    padding: 0 1rem;
    font-weight: 800;
  }

  .call-controls button.muted {
    background: rgba(255, 184, 77, 0.14);
    border-color: rgba(255, 184, 77, 0.34);
  }

  .call-controls .accept-call {
    background: linear-gradient(135deg, #34d399, #178a58);
    border-color: rgba(116, 255, 190, 0.42);
  }

  .call-controls .end-call {
    background: linear-gradient(135deg, #ef4444, #a21d3a);
    border-color: rgba(255, 142, 160, 0.42);
  }

  .chat-actions button:disabled,
  .call-controls button:disabled {
    opacity: 0.48;
    cursor: default;
  }

  :global(.chat-panel .thread) {
    min-height: 0;
    background: transparent;
    grid-template-rows: 1fr auto auto;
  }

  :global(.chat-panel .thread > header) {
    display: none;
  }

  :global(.chat-panel .thread__messages) {
    padding: 1.1rem 1rem;
    gap: 0.9rem;
    background:
      radial-gradient(circle at 62% 18%, rgba(70, 40, 145, 0.12), transparent 22rem),
      linear-gradient(180deg, rgba(3, 7, 23, 0.4), rgba(2, 6, 20, 0.54));
  }

  :global(.chat-panel .bubble) {
    max-width: min(74%, 30rem);
    border: 1px solid rgba(153, 130, 236, 0.17);
    border-radius: 0.78rem;
    background: rgba(15, 18, 47, 0.92);
    color: rgba(248, 246, 255, 0.95);
    box-shadow: 0 12px 30px rgba(2, 4, 16, 0.22);
  }

  :global(.chat-panel .bubble--own) {
    border-color: rgba(167, 92, 255, 0.34);
    background: linear-gradient(135deg, rgba(60, 31, 132, 0.96), rgba(76, 25, 151, 0.94));
  }

  :global(.chat-panel .reaction-strip) {
    display: none;
  }

  :global(.chat-panel .reaction-summary) {
    margin-top: 0.56rem;
  }

  :global(.chat-panel .attachment-card) {
    border-radius: 0.85rem;
    border-color: rgba(153, 130, 236, 0.18);
    max-width: min(28rem, 100%);
  }

  :global(.chat-panel .seen) {
    color: rgba(202, 197, 229, 0.62);
    padding-right: 1rem;
  }

  :global(.chat-panel .composer) {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.62rem;
    border-top: 1px solid rgba(153, 130, 236, 0.12);
    background: rgba(4, 8, 24, 0.82);
    padding: 0.8rem;
  }

  :global(.chat-panel .composer .input-wrap) {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    border: 1px solid rgba(153, 130, 236, 0.16);
    border-radius: 999px;
    background: rgba(12, 15, 38, 0.92);
    padding: 0.35rem 0.5rem;
  }

  :global(.chat-panel .composer .toolbar) {
    display: flex;
    gap: 0.25rem;
    order: 1;
  }

  :global(.chat-panel .composer textarea) {
    order: 2;
    min-height: 2.45rem;
    max-height: 5rem;
    border: 0;
    background: transparent;
    padding: 0.62rem 0.72rem;
    color: white;
    outline: none;
  }

  :global(.chat-panel .composer .tool) {
    width: 2.1rem;
    height: 2.1rem;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: rgba(222, 216, 242, 0.8);
    padding: 0;
  }

  :global(.chat-panel .composer > button) {
    width: 2.9rem;
    min-height: 2.9rem;
    border-radius: 999px;
    background: linear-gradient(135deg, #8b5cf6, #5b21b6);
    color: white;
    font-size: 0;
    box-shadow: 0 0 24px rgba(126, 92, 255, 0.45);
  }

  :global(.chat-panel .composer > button)::after {
    content: '➤';
    font-size: 1rem;
  }

  :global(.chat-panel .emoji-picker),
  :global(.chat-panel .gif-picker),
  :global(.chat-panel .attachment-preview),
  :global(.chat-panel .inline-error),
  :global(.chat-panel .edit-row) {
    grid-column: 1 / -1;
    order: 3;
  }

  .mobile-thread-bar {
    display: none;
  }

  @media (max-width: 1280px) {
    .messages-grid {
      grid-template-columns: minmax(18rem, 24rem) minmax(27rem, 1fr);
    }

    .right-rail {
      display: none;
    }
  }

  @media (max-width: 1020px) {
    .messages-app {
      grid-template-columns: 1fr;
    }

    .messages-app :global(.fantasy-sidebar) {
      display: none;
    }

    .messages-workspace {
      padding: 1rem;
    }
  }

  @media (max-width: 760px) {
    :global(.app-main--messages) {
      overflow: auto;
    }

    .messages-workspace {
      height: auto;
      min-height: 100vh;
      overflow: visible;
      padding: max(1.35rem, calc(env(safe-area-inset-top) + 0.85rem)) 1.05rem calc(7.5rem + env(safe-area-inset-bottom));
    }

    .messages-app {
      min-height: 100svh;
      overflow: visible;
      background:
        radial-gradient(circle at 78% 9%, rgba(129, 60, 255, 0.23), transparent 15rem),
        radial-gradient(circle at 16% 28%, rgba(93, 42, 168, 0.2), transparent 16rem),
        linear-gradient(180deg, #040512 0%, #070719 52%, #050714 100%);
    }

    .mobile-chrome {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 2.65rem;
    }

    .mobile-chrome__actions {
      display: flex;
      gap: 1rem;
    }

    .mobile-chrome__actions button {
      position: relative;
      display: grid;
      width: 2.55rem;
      min-height: 2.55rem;
      place-items: center;
      border: 0;
      background: transparent;
      color: #fff3cf;
      padding: 0;
    }

    .mobile-chrome__actions button span {
      position: absolute;
      right: 0.12rem;
      top: 0.1rem;
      width: 0.72rem;
      height: 0.72rem;
      border-radius: 999px;
      background: #a55cff;
      box-shadow: 0 0 16px rgba(165, 92, 255, 0.86);
    }

    .messages-heading {
      align-items: stretch;
      flex-direction: row;
      margin-bottom: 1.8rem;
    }

    .messages-heading h1 {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: clamp(2.65rem, 10vw, 3.25rem);
      font-weight: 700;
      letter-spacing: 0;
    }

    .messages-heading h1 span {
      display: none;
    }

    .messages-heading p {
      max-width: 18rem;
      margin-top: 0.8rem;
      color: rgba(232, 228, 248, 0.76);
      font-size: clamp(1.08rem, 4.6vw, 1.45rem);
      line-height: 1.42;
    }

    .heading-actions {
      align-self: start;
      flex: 0 0 auto;
      padding-top: 1.5rem;
    }

    .new-message {
      min-height: 4.1rem;
      border-radius: 1.35rem;
      padding: 0 1.55rem;
      font-size: clamp(1rem, 4vw, 1.25rem);
    }

    .heading-actions > .filter-button {
      display: none;
    }

    .messages-grid {
      grid-template-columns: 1fr;
      height: auto;
      min-height: calc(100vh - 12rem);
    }

    .messages-heading,
    .inbox-panel,
    .chat-panel {
      grid-column: 1;
      grid-row: auto;
    }

    .inbox-panel,
    .chat-panel {
      min-height: 0;
      border: 0;
      background: transparent;
      box-shadow: none;
      backdrop-filter: none;
    }

    .inbox-tabs {
      display: flex;
      gap: 1.85rem;
      overflow-x: auto;
      border-bottom: 1px solid rgba(153, 130, 236, 0.18);
      padding: 0 0 0.02rem;
    }

    .inbox-tabs button {
      position: relative;
      min-height: 3.2rem;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: rgba(232, 228, 248, 0.66);
      font-size: clamp(1.08rem, 4.3vw, 1.35rem);
      padding: 0 0 0.8rem;
      white-space: nowrap;
    }

    .inbox-tabs button.mobile-tab-hidden {
      display: none;
    }

    .inbox-tabs button.is-active,
    .inbox-tabs button:hover,
    .inbox-tabs button:focus-visible {
      border-color: transparent;
      background: transparent;
      color: white;
    }

    .inbox-tabs button.is-active::after {
      content: '';
      position: absolute;
      left: 0;
      right: -1.2rem;
      bottom: -1px;
      height: 0.18rem;
      border-radius: 999px;
      background: linear-gradient(90deg, #d35cff, rgba(167, 92, 255, 0.28));
      box-shadow: 0 0 16px rgba(195, 92, 255, 0.62);
    }

    .inbox-tabs button span {
      display: inline-grid;
      min-width: 1.55rem;
      height: 1.55rem;
      place-items: center;
      border-radius: 0.58rem;
      background: rgba(126, 60, 198, 0.62);
      color: white;
      font-size: 0.82rem;
      margin-left: 0.42rem;
      vertical-align: middle;
    }

    .mobile-search-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 4.05rem;
      gap: 1rem;
      margin: 1.55rem 0 1.2rem;
    }

    .mobile-search-row .global-search {
      display: flex;
      width: auto;
      min-height: 4.05rem;
      border-color: rgba(153, 80, 240, 0.22);
      border-radius: 1.8rem;
      background: rgba(10, 9, 29, 0.72);
      padding: 0 1.25rem;
      color: rgba(231, 228, 248, 0.62);
      backdrop-filter: blur(18px);
    }

    .mobile-search-row input {
      font-size: clamp(1rem, 4.5vw, 1.25rem);
    }

    .mobile-search-row .filter-button {
      display: grid;
      width: 4.05rem;
      min-height: 4.05rem;
      border-radius: 1.35rem;
      border-color: rgba(153, 80, 240, 0.22);
      background: rgba(10, 9, 29, 0.72);
      color: rgba(232, 228, 248, 0.78);
    }

    .conversation-list {
      height: auto;
      display: grid;
      gap: 0.75rem;
      overflow: visible;
      padding-bottom: 0;
    }

    .conversation-row {
      min-height: 8.55rem;
      grid-template-columns: 5.8rem minmax(0, 1fr) auto;
      align-items: center;
      gap: 1rem;
      border: 1px solid rgba(153, 80, 240, 0.2);
      border-radius: 1.25rem;
      background:
        radial-gradient(circle at 12% 0%, rgba(146, 70, 255, 0.16), transparent 42%),
        rgba(8, 10, 29, 0.62);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.06),
        0 18px 42px rgba(0, 0, 0, 0.24);
      padding: 0.82rem 1rem;
      backdrop-filter: blur(18px);
    }

    .conversation-row:hover,
    .conversation-row:focus-visible,
    .conversation-row.is-active {
      background:
        radial-gradient(circle at 12% 0%, rgba(146, 70, 255, 0.22), transparent 42%),
        rgba(12, 12, 36, 0.8);
    }

    .avatar-wrap {
      width: 5.25rem;
      height: 5.25rem;
      box-shadow: 0 0 0 1px rgba(167, 92, 255, 0.48), 0 0 24px rgba(126, 92, 255, 0.42);
    }

    .presence-dot {
      left: -0.1rem;
      right: auto;
      bottom: 2.3rem;
      width: 1rem;
      height: 1rem;
      border-width: 0;
      background: #8b3cff;
      box-shadow: 0 0 14px rgba(139, 60, 255, 0.84);
    }

    .conversation-title {
      display: grid;
      grid-template-columns: minmax(0, auto) auto minmax(max-content, 1fr);
      justify-content: start;
      gap: 0.55rem;
      align-items: center;
    }

    .conversation-title strong {
      font-size: clamp(1.26rem, 5vw, 1.55rem);
    }

    .conversation-title em {
      border-radius: 0.48rem;
      background: rgba(126, 60, 198, 0.36);
      color: #d8a3ff;
      font-size: clamp(0.72rem, 3vw, 0.9rem);
      padding: 0.32rem 0.5rem;
    }

    .conversation-title time {
      justify-self: end;
      color: rgba(232, 228, 248, 0.72);
      font-size: clamp(0.9rem, 3.8vw, 1.16rem);
    }

    .conversation-preview {
      display: -webkit-box;
      white-space: normal;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      color: rgba(232, 228, 248, 0.72);
      font-size: clamp(1rem, 4.4vw, 1.25rem);
      line-height: 1.36;
      margin-top: 0.62rem;
    }

    .unread-badge {
      min-width: 2.7rem;
      height: 2.7rem;
      font-size: 1.15rem;
    }

    .chat-header {
      display: none;
    }

    .mobile-thread-bar {
      display: flex;
      align-items: center;
      gap: 0.72rem;
      border-bottom: 1px solid rgba(153, 130, 236, 0.14);
      background: rgba(7, 10, 28, 0.96);
      padding: 0.8rem;
    }

    .mobile-thread-bar__back {
      min-height: 2.3rem;
      border: 1px solid rgba(153, 130, 236, 0.24);
      border-radius: 999px;
      background: rgba(167, 92, 255, 0.1);
      color: white;
      padding: 0 0.8rem;
    }

    .mobile-thread-bar__body {
      min-width: 0;
      display: grid;
      gap: 0.1rem;
    }

    .mobile-thread-bar__body strong,
    .mobile-thread-bar__body span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :global(.chat-panel .bubble) {
      max-width: 88%;
    }
  }

  @media (max-width: 430px) {
    .messages-heading {
      flex-direction: column;
      gap: 1rem;
    }

    .heading-actions {
      align-self: stretch;
      padding-top: 0;
    }

    .new-message {
      width: 100%;
      justify-content: center;
    }

    .conversation-row {
      grid-template-columns: 4.85rem minmax(0, 1fr) auto;
      min-height: 7.8rem;
      padding: 0.72rem;
    }

    .avatar-wrap {
      width: 4.45rem;
      height: 4.45rem;
    }

    .conversation-title {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .conversation-title em {
      display: none;
    }

    .conversation-title time {
      font-size: 0.9rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .conversation-row,
    .new-message,
    .filter-button,
    .chat-actions button {
      transition: none;
    }
  }
</style>
