import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async () =>
  json(
    { error: 'gone', message: 'XP is awarded through validated missions, rituals, and game sessions.' },
    { status: 410 }
  );
