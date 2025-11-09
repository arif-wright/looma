import { ImageResponse } from '@vercel/og';
import type { RequestHandler } from './$types';
import { getProfileOgData } from '$lib/server/profile/og';

const width = 1200;
const height = 630;
const fallbackAvatar =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="200" fill="%2305162f"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="160" font-family="Inter, Arial">👤</text></svg>';

let interBold: ArrayBuffer | null = null;

async function loadFont() {
  if (interBold) return interBold;
  const res = await fetch('https://fonts.gstatic.com/s/inter/v12/UcC73Fwr-uh3Peo8n7PVZF0.woff');
  interBold = await res.arrayBuffer();
  return interBold;
}

type OgElement = Parameters<typeof ImageResponse>[0];

const h = (type: string, props: Record<string, unknown> = {}, children: any = []): OgElement => ({
  type,
  props: { ...props, children }
});

const createPrivateElement = (): OgElement =>
  h(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #050716, #0e1330)',
        color: '#fff',
        fontFamily: 'Inter'
      }
    },
    [
      h(
        'div',
        { style: { textAlign: 'center' } },
        [
          h('p', { style: { fontSize: 48, margin: 0 } }, 'Private profile'),
          h(
            'p',
            { style: { fontSize: 24, margin: '12px 0 0', opacity: 0.7 } },
            'Sign in to view this explorer'
          )
        ]
      )
    ]
  );

const createProfileElement = (profile: NonNullable<Awaited<ReturnType<typeof getProfileOgData>>>, metaBio: string): OgElement => {
  const background = profile.bannerUrl
    ? `url(${profile.bannerUrl})`
    : 'radial-gradient(circle at 20% 20%, rgba(0,234,255,0.4), transparent 45%), radial-gradient(circle at 80% 30%, rgba(255,0,255,0.35), transparent 50%), #050716';

  const chipStyle = {
    borderRadius: 999,
    padding: '10px 20px',
    background: 'rgba(255,255,255,0.12)',
    fontSize: 24
  } as const;

  const chips: OgElement[] = [];
  if (profile.level !== null && profile.level !== undefined) {
    chips.push(h('div', { style: chipStyle }, `Level ${profile.level ?? '—'}`));
  }
  if (profile.bonded !== null && profile.bonded !== undefined) {
    chips.push(h('div', { style: chipStyle }, `Bonded ${profile.bonded ?? 0}`));
  }
  if (profile.joinedLabel) {
    chips.push(
      h('div', { style: { ...chipStyle, background: 'rgba(255,255,255,0.08)' } }, `Joined ${profile.joinedLabel}`)
    );
  }

  return h(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        fontFamily: 'Inter',
        color: '#fff'
      }
    },
    [
      h('div', {
        style: {
          position: 'absolute',
          inset: '-40px',
          backgroundImage: background,
          backgroundSize: 'cover',
          filter: 'blur(45px) saturate(1.15)',
          transform: 'scale(1.05)'
        }
      }),
      h('div', {
        style: {
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(5,7,22,0.2) 0%, rgba(5,7,22,0.75) 60%, rgba(5,7,22,0.95) 100%)'
        }
      }),
      h(
        'div',
        { style: { position: 'relative', display: 'flex', gap: 32, padding: '60px 80px 70px' } },
        [
          h(
            'div',
            {
              style: {
                width: 200,
                height: 200,
                borderRadius: '999px',
                background:
                  'conic-gradient(from 0deg, rgba(0,234,255,0.9), rgba(255,0,255,0.85), rgba(168,85,247,0.9), rgba(0,234,255,0.9))',
                padding: 8,
                filter: 'drop-shadow(0 0 30px rgba(0,234,255,0.35))'
              }
            },
            [
              h('img', {
                src: profile.avatarUrl ?? fallbackAvatar,
                width: 184,
                height: 184,
                style: { borderRadius: '999px', objectFit: 'cover', width: '100%', height: '100%' }
              })
            ]
          ),
          h(
            'div',
            { style: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 } },
            [
              h('div', {}, [
                h('p', { style: { fontSize: 48, margin: 0 } }, profile.displayName ?? profile.handle),
                h('p', { style: { fontSize: 28, margin: '6px 0 0', color: 'rgba(255,255,255,0.8)' } }, `@${profile.handle}`)
              ]),
              h('p', { style: { fontSize: 24, margin: 0, opacity: 0.9 } }, metaBio),
              h('div', { style: { display: 'flex', gap: 16, marginTop: 8 } }, chips)
            ]
          )
        ]
      ),
      h('div', {
        style: {
          position: 'absolute',
          right: 40,
          bottom: 30,
          fontSize: 22,
          letterSpacing: 4,
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.8)'
        },
        children: 'looma.gg'
      })
    ]
  );
};

export const GET: RequestHandler = async (event) => {
  const handle = event.url.searchParams.get('handle');
  if (!handle) {
    return new Response('Missing handle', { status: 400 });
  }

  const profile = await getProfileOgData(event, handle);
  if (!profile) {
    return new Response('Profile not found', { status: 404 });
  }

  const fontData = await loadFont();

  const element = profile.isPrivate
    ? createPrivateElement()
    : createProfileElement(profile, profile.bio?.slice(0, 160) ?? 'View this explorer on Looma');

  return new ImageResponse(element, {
    width,
    height,
    fonts: [
      {
        name: 'Inter',
        data: fontData,
        weight: 600,
        style: 'normal'
      }
    ]
  });
};
