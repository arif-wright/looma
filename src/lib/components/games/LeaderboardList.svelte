<script lang="ts">
  import type { LeaderboardScope } from '$lib/server/games/leaderboard';

  export type LeaderboardDisplayRow = {
    rank: number;
    user: {
      id: string;
      handle: string | null;
      displayName: string | null;
      avatar: string | null;
    };
    score: number;
    when: string | null;
    isSelf: boolean;
  };

  export let rows: LeaderboardDisplayRow[] = [];
  export let loading = false;
  export let scope: LeaderboardScope = 'alltime';

  const formatWhen = (value: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };
</script>

<div class="leaderboard" data-testid="leaderboard-list" data-scope={scope}>
  {#if loading}
    <div class="leaderboard__loading">Loading leaderboard…</div>
  {:else if rows.length === 0}
    <div class="leaderboard__empty">No scores yet. Be the first to set a record!</div>
  {:else}
    <ul>
      {#each rows as row (row.user.id + '-' + row.rank)}
        <li
          class={`leaderboard__row ${row.isSelf ? 'leaderboard__row--self' : ''}`}
          data-testid="leaderboard-row"
          data-self={row.isSelf ? 'true' : 'false'}
        >
          <span class="row-rank">#{row.rank}</span>
          <span class="row-user">
            {#if row.user.avatar}
              <img src={row.user.avatar} alt={row.user.handle ?? row.user.displayName ?? 'Player avatar'} />
            {:else}
              <span class="avatar-fallback" aria-hidden="true">{row.user.handle?.slice(0, 1)?.toUpperCase() ?? 'P'}</span>
            {/if}
            <span class="user-text">
              <strong>{row.user.handle ?? row.user.displayName ?? 'Anonymous'}</strong>
              {#if formatWhen(row.when)}
                <small>{formatWhen(row.when)}</small>
              {/if}
            </span>
          </span>
          <span class="row-score">{row.score.toLocaleString()}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .leaderboard {
    background: rgba(11, 17, 34, 0.65);
    border-radius: 1.2rem;
    padding: 1rem;
    display: grid;
    gap: 0.75rem;
  }

  .leaderboard__loading,
  .leaderboard__empty {
    padding: 1rem;
    text-align: center;
    color: rgba(214, 224, 255, 0.7);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }

  .leaderboard__row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.9rem;
    padding: 0.65rem 0.9rem;
    border-radius: 0.9rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .leaderboard__row--self {
    border-color: rgba(77, 244, 255, 0.6);
    box-shadow: 0 0 0 1px rgba(77, 244, 255, 0.3);
    background: rgba(77, 244, 255, 0.08);
  }

  .row-rank {
    font-weight: 700;
    font-size: 1rem;
    color: rgba(244, 247, 255, 0.85);
  }

  .row-user {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
  }

  .row-user img,
  .avatar-fallback {
    width: 40px;
    height: 40px;
    border-radius: 999px;
    object-fit: cover;
    background: rgba(255, 255, 255, 0.12);
  }

  .avatar-fallback {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    color: rgba(244, 247, 255, 0.8);
  }

  .user-text {
    display: grid;
    gap: 0.2rem;
  }

  .user-text strong {
    font-size: 0.95rem;
    color: rgba(244, 247, 255, 0.9);
  }

  .user-text small {
    font-size: 0.7rem;
    color: rgba(182, 198, 255, 0.7);
  }

  .row-score {
    font-weight: 700;
    font-size: 1.05rem;
    color: rgba(244, 247, 255, 0.95);
  }

  @media (max-width: 640px) {
    .leaderboard__row {
      grid-template-columns: auto 1fr;
      grid-template-rows: auto auto;
    }

    .row-score {
      grid-column: 2 / span 1;
      justify-self: end;
      font-size: 0.95rem;
    }
  }
</style>
