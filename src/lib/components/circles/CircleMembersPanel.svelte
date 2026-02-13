<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CircleMember } from './types';

  export let members: CircleMember[] = [];
  export let myRole: 'owner' | 'admin' | 'member' = 'member';
  export let myUserId: string | null = null;

  const dispatch = createEventDispatcher<{
    role: { userId: string; role: 'admin' | 'member' };
    kick: { userId: string };
  }>();

  const canManage = myRole === 'owner' || myRole === 'admin';

  const labelFor = (member: CircleMember) => {
    if (member.profile.display_name) return member.profile.display_name;
    if (member.profile.handle) return `@${member.profile.handle}`;
    return member.userId.slice(0, 8);
  };
</script>

<section class="members" aria-label="Circle members">
  <h3>Members</h3>
  <ul>
    {#each members as member (member.userId)}
      <li>
        <div>
          <strong>{labelFor(member)}</strong>
          <span>{member.role}</span>
          {#if member.moderationStatus && member.moderationStatus !== 'active'}
            <span class={`moderation moderation-${member.moderationStatus}`}>{member.moderationStatus}</span>
          {/if}
        </div>
        {#if canManage && member.userId !== myUserId && member.role !== 'owner'}
          <div class="actions">
            {#if myRole === 'owner'}
              <button type="button" class="ghost" on:click={() => dispatch('role', { userId: member.userId, role: member.role === 'admin' ? 'member' : 'admin' })}>
                {member.role === 'admin' ? 'Set Member' : 'Set Admin'}
              </button>
            {/if}
            <button type="button" class="ghost" on:click={() => dispatch('kick', { userId: member.userId })}>Kick</button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  .members { border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 0.8rem; padding: 0.8rem; background: rgba(15, 23, 42, 0.35); }
  h3 { margin: 0 0 0.55rem; font-size: 0.92rem; letter-spacing: 0.04em; text-transform: uppercase; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.45rem; }
  li { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; }
  strong { display: block; }
  span { font-size: 0.78rem; color: rgba(186, 230, 253, 0.88); text-transform: capitalize; }
  .moderation {
    margin-left: 0.4rem;
    color: rgba(254, 226, 226, 0.95);
    background: rgba(127, 29, 29, 0.32);
    border: 1px solid rgba(248, 113, 113, 0.5);
    border-radius: 999px;
    padding: 0.02rem 0.38rem;
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .actions { display: inline-flex; gap: 0.45rem; }
  button { border: none; border-radius: 0.62rem; padding: 0.35rem 0.65rem; background: rgba(148, 163, 184, 0.2); color: #e2e8f0; cursor: pointer; }
</style>
