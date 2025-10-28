<script lang="ts">
  import type { ProfileSummary } from './types';

  export let profile: ProfileSummary;
</script>

<header class="hero">
  <img class="avatar" src={profile.avatar_url || '/avatar.svg'} alt="" />
  <div>
    <h1>{profile.display_name || profile.handle}</h1>
    <p class="sub">@{profile.handle}</p>
    <div class="stats">
      <div class="tile">
        <span class="k">Level</span>
        <b>{profile.level ?? '—'}</b>
      </div>
      <div class="tile">
        <span class="k">XP</span>
        <b>{profile.xp ?? 0} / {profile.xp_next ?? 0}</b>
      </div>
      <div class="tile">
        <span class="k">Bonded</span>
        <b>{profile.bonded_count ?? 0}</b>
      </div>
    </div>
  </div>
</header>

<style>
  .hero {
    display: flex;
    gap: 16px;
    align-items: center;
    margin-bottom: 8px;
  }

  .avatar {
    width: 64px;
    height: 64px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    object-fit: cover;
    background: rgba(255, 255, 255, 0.05);
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .sub {
    margin: 4px 0 12px;
    opacity: 0.75;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .tile {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
    padding: 10px 12px;
    border-radius: 12px;
  }

  .tile .k {
    font-size: 12px;
    opacity: 0.7;
    display: block;
  }

  @media (max-width: 640px) {
    .hero {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
