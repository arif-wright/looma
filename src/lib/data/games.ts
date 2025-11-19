export type GameMeta = {
  id: string;
  slug: string;
  name: string;
  tagline?: string;
  cover: {
    alt: string;
    sources: {
      '1280': string;
      '960': string;
      '640': string;
      '512': string;
    };
    square?: string;
  };
};

export const games: GameMeta[] = [
  {
    id: 'tiles-run',
    slug: 'tiles-run',
    name: 'Tiles Run',
    tagline: 'Chase the signal. Find your flow.',
    cover: {
      alt: 'Exploding rainbow tiles with a light-runner streaking forward',
      sources: {
        '1280': '/games/tiles-run/cover-1280.webp',
        '960': '/games/tiles-run/cover-960.webp',
        '640': '/games/tiles-run/cover-640.webp',
        '512': '/games/tiles-run/cover-512.webp'
      },
      square: '/games/tiles-run/cover-512.webp'
    }
  },
  {
    id: 'runner',
    slug: 'runner',
    name: 'Neon Run',
    tagline: 'Endless runner prototype',
    cover: {
      alt: 'Neon character sprinting through glitch shards',
      sources: {
        '1280': '/games/runner/cover-1280.svg',
        '960': '/games/runner/cover-960.svg',
        '640': '/games/runner/cover-640.svg',
        '512': '/games/runner/cover-512.svg'
      },
      square: '/games/runner/cover-512.svg'
    }
  },
  {
    id: 'arpg',
    slug: 'arpg',
    name: 'Looma ARPG',
    tagline: 'Dash through the breach.',
    cover: {
      alt: 'A radiant hero sprinting through a neon rift',
      sources: {
        '1280': '/games/arpg/cover-1280.webp',
        '960': '/games/arpg/cover-960.webp',
        '640': '/games/arpg/cover-640.webp',
        '512': '/games/arpg/cover-512.webp'
      },
      square: '/games/arpg/cover-512.webp'
    }
  },
  {
    id: 'dodge',
    slug: 'dodge',
    name: 'Orbfield',
    tagline: 'Dodge-and-survive canvas sim',
    cover: {
      alt: 'Soft glowing orb protecting a pilot amid shards',
      sources: {
        '1280': '/games/dodge/cover-1280.svg',
        '960': '/games/dodge/cover-960.svg',
        '640': '/games/dodge/cover-640.svg',
        '512': '/games/dodge/cover-512.svg'
      },
      square: '/games/dodge/cover-512.svg'
    }
  }
];
