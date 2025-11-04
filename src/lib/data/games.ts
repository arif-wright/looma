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
  }
];
