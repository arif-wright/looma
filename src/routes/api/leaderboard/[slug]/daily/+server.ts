import type { RequestHandler } from './$types';
import { handleLeaderboardRequest } from '$lib/server/games/leaderboard-api';

export const GET: RequestHandler = (event) => handleLeaderboardRequest(event, 'daily');
