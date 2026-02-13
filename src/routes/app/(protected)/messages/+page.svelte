<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import ConversationList from '$lib/components/messenger/ConversationList.svelte';
  import ChatThread from '$lib/components/messenger/ChatThread.svelte';
  import MessageComposer from '$lib/components/messenger/MessageComposer.svelte';
  import StartChatModal from '$lib/components/messenger/StartChatModal.svelte';
  import type {
    MessengerConversation,
    MessengerFriendOption,
    MessengerMessage
  } from '$lib/components/messenger/types';

  export let data;

  const currentUserId = (data?.user?.id as string | undefined) ?? null;

  let conversations: MessengerConversation[] = [];
  let activeConversationId: string | null = null;
  let messages: MessengerMessage[] = [];
  let nextCursor: string | null = null;
  let searchQuery = '';

  let loadingConversations = false;
  let loadingMessages = false;
  let sending = false;
  let errorMessage: string | null = null;

  let showStartModal = false;
  let startModalLoading = false;
  let startModalError: string | null = null;
  let startModalFriends: MessengerFriendOption[] = [];

  let readDebounce: ReturnType<typeof setTimeout> | null = null;
  let supabaseClient: ReturnType<typeof supabaseBrowser> | null = null;
  let activeMessagesChannel: RealtimeChannel | null = null;
  let conversationsChannel: RealtimeChannel | null = null;

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
    (activeConversation?.peer?.handle ? `@${activeConversation.peer.handle}` : 'Conversation');

  const byNewest = (a: MessengerConversation, b: MessengerConversation) => {
    const aTime = a.last_message_at ? Date.parse(a.last_message_at) : 0;
    const bTime = b.last_message_at ? Date.parse(b.last_message_at) : 0;
    return bTime - aTime;
  };

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

      if (older) {
        messages = [...items, ...messages];
      } else {
        messages = items;
      }

      if (!older && conversationId === activeConversationId) {
        const blocked = payload?.blocked === true;
        conversations = conversations.map((conversation) =>
          conversation.conversationId === conversationId ? { ...conversation, blocked } : conversation
        );
      }
    } finally {
      loadingMessages = false;
    }
  };

  const handleSelectConversation = async (conversationId: string) => {
    if (conversationId === activeConversationId) return;
    activeConversationId = conversationId;
    await loadMessages(conversationId, false);
    await markConversationRead(conversationId);
    await bindActiveMessagesRealtime();
  };

  const handleSendMessage = async (event: CustomEvent<{ body: string }>) => {
    if (!activeConversationId || !currentUserId) return;
    sending = true;
    errorMessage = null;

    try {
      const clientNonce = crypto.randomUUID();
      const body = event.detail.body;

      const res = await fetch('/api/messenger/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeConversationId,
          body,
          clientNonce
        })
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorMessage = typeof payload?.message === 'string' ? payload.message : 'Failed to send message.';
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
        client_nonce: clientNonce
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
                preview: body,
                unreadCount: 0
              }
            : conversation
        )
        .sort(byNewest);

      scheduleRead(activeConversationId);
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

  const bindActiveMessagesRealtime = async () => {
    if (!supabaseClient) return;

    if (activeMessagesChannel) {
      await supabaseClient.removeChannel(activeMessagesChannel);
      activeMessagesChannel = null;
    }

    if (!activeConversationId) return;

    const conversationId = activeConversationId;
    activeMessagesChannel = supabaseClient
      .channel(`messenger:messages:${conversationId}`)
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
                      preview: incoming.body,
                      unreadCount: incoming.sender_id === currentUserId ? 0 : conversation.unreadCount
                    }
                  : conversation
              )
              .sort(byNewest);

            scheduleRead(conversationId);
            return;
          }

          conversations = conversations
            .map((conversation) =>
              conversation.conversationId === conversationId
                ? {
                    ...conversation,
                    last_message_at: incoming.created_at,
                    preview: incoming.body,
                    unreadCount: incoming.sender_id === currentUserId ? conversation.unreadCount : conversation.unreadCount + 1
                  }
                : conversation
            )
            .sort(byNewest);
        }
      )
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
    if (activeMessagesChannel) {
      void supabaseClient.removeChannel(activeMessagesChannel);
      activeMessagesChannel = null;
    }
    if (conversationsChannel) {
      void supabaseClient.removeChannel(conversationsChannel);
      conversationsChannel = null;
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
        {currentUserId}
        blocked={activeConversation?.blocked ?? false}
        loading={loadingConversations || loadingMessages}
        title={threadTitle}
        on:report={handleReportMessage}
      >
        <svelte:fragment slot="composer">
          {#if activeConversation?.peer?.id}
            <div class="thread-actions">
              <button type="button" on:click={handleBlock} disabled={activeConversation?.blocked}>Block user</button>
            </div>
          {/if}
          <MessageComposer disabled={activeConversation?.blocked ?? false} {sending} on:send={handleSendMessage} />
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
    padding: 0.5rem 0.7rem;
    max-width: 28rem;
  }

  @media (max-width: 960px) {
    .messenger-shell {
      margin: 0.5rem 0.5rem 5.4rem;
      min-height: calc(100vh - 7rem);
      grid-template-columns: 1fr;
      grid-template-rows: minmax(16rem, 34vh) 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .messenger-shell,
    .thread-actions button,
    .load-older {
      transition: none;
    }
  }
</style>
