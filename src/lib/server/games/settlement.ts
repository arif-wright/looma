import { error } from '@sveltejs/kit';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

const amount = z.number().int().nonnegative().safe();
const multiplier = z.number().finite().positive();
const ritual = z.object({
  key: z.enum(['care_once', 'play_game_with_companion', 'post_with_companion']),
  title: z.string(), description: z.string(), progressMax: amount,
  xpReward: amount, shardReward: amount, affectionReward: amount, trustReward: amount,
  progress: amount, status: z.enum(['pending', 'in_progress', 'completed']),
  completedAt: z.string().nullable()
});
const receiptSchema = z.object({
  settlementVersion: z.literal(1), sessionId: z.string().uuid(),
  xpDelta: amount, baseXpDelta: amount, xpMultiplier: multiplier,
  baseXp: amount, finalXp: amount, xpFromCompanion: amount, xpFromStreak: amount,
  currencyDelta: amount, baseCurrencyDelta: amount, currencyMultiplier: multiplier,
  companionBonus: z.object({companionId:z.string().uuid(),name:z.string().nullable(),bondLevel:amount,xpMultiplier:multiplier}).nullable(),
  rewardsGranted:z.object({xpGained:amount,shardsGained:amount,xpMultiplier:multiplier,currencyMultiplier:multiplier}),
  rituals:z.object({list:z.array(ritual),completed:z.array(ritual)}).nullable(),
  achievements:z.array(z.object({achievementId:z.string().uuid(),key:z.string(),name:z.string(),icon:z.string(),
    rarity:z.enum(['common','rare','epic','legendary']),points:amount,shards:amount,meta:z.record(z.unknown()),unlocked:z.literal(true)}))
});
const requestSchema = z.object({score:amount.max(2147483647),durationMs:amount.positive().max(2147483647),
  nonce:z.string().min(1).max(256),clientVersion:z.string().max(128).nullable(),success:z.boolean().nullable(),stats:z.record(z.unknown()).nullable()});
export type GameSubmission = z.infer<typeof requestSchema>;
export type GameSettlementReceipt = z.infer<typeof receiptSchema>;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function parseGameSubmission(body: unknown): { sessionId: string; signature: string; submission: GameSubmission } {
  if (!record(body)) throw error(400,{code:'bad_request',message:'Invalid request.'});
  const results = record(body.results) ? body.results : body;
  // Keep floor normalization for numeric game engines; never coerce strings/booleans.
  const normalize = (n:unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : n;
  const parsed=requestSchema.safeParse({score:normalize(results.score ?? body.score),durationMs:normalize(results.durationMs ?? body.durationMs),
    nonce:body.nonce,clientVersion:body.clientVersion ?? null,success:results.success ?? body.success ?? null,stats:results.stats ?? body.stats ?? null});
  if (!parsed.success || !z.string().uuid().safeParse(body.sessionId).success ||
      JSON.stringify(parsed.success ? parsed.data.stats : null).length > 16384) {
    throw error(400,{code:'bad_request',message:'Invalid game result.'});
  }
  return {sessionId:body.sessionId as string,signature:typeof body.signature==='string'?body.signature:'',submission:parsed.data};
}
const stable = (value:unknown):string => Array.isArray(value) ? `[${value.map(stable).join(',')}]`
  : record(value) ? `{${Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')}}` : JSON.stringify(value);
export function assertSameSubmission(saved: GameSubmission, submitted: GameSubmission, signing=false) {
  const fields: Array<keyof GameSubmission> = signing ? ['score','durationMs','nonce','clientVersion']
    : ['score','durationMs','nonce','clientVersion','success','stats'];
  if (fields.some(key=>stable(saved[key])!==stable(submitted[key]))) {
    throw error(409,{code:'conflict',message:'This session already has a different result.'});
  }
}
export function validateGameReceipt(data: unknown, sessionId: string): GameSettlementReceipt {
  const parsed=receiptSchema.safeParse(data);
  if (!parsed.success || parsed.data.sessionId!==sessionId || parsed.data.xpDelta!==parsed.data.finalXp ||
      parsed.data.xpDelta!==parsed.data.rewardsGranted.xpGained || parsed.data.currencyDelta!==parsed.data.rewardsGranted.shardsGained ||
      parsed.data.xpMultiplier!==parsed.data.rewardsGranted.xpMultiplier || parsed.data.currencyMultiplier!==parsed.data.rewardsGranted.currencyMultiplier) {
    throw error(500,{code:'server_error',message:'Unable to confirm the saved result.'});
  }
  return parsed.data;
}
export async function readGameSettlement(admin: SupabaseClient, userId: string, sessionId: string) {
  const {data,error:queryError}=await admin.from('economy_transactions').select('applied, result, meta')
    .eq('user_id',userId).eq('source','game_session').eq('idempotency_key',`game-session:${sessionId}`).maybeSingle();
  if (queryError) throw queryError;
  if (!data) return null;
  const parsed=requestSchema.safeParse(data.meta?.request);
  if (data.applied!==true || !parsed.success) throw error(500,{code:'server_error',message:'Unable to confirm the saved result.'});
  return {request:parsed.data,receipt:validateGameReceipt(data.result,sessionId),
    gameId:typeof data.meta?.gameId==='string'?data.meta.gameId:null,
    gameSlug:typeof data.meta?.gameSlug==='string'?data.meta.gameSlug:null};
}
export function parseSettlementResult(data: unknown, sessionId: string) {
  if (!record(data) || typeof data.replayed!=='boolean') throw error(500,{code:'server_error',message:'Unable to confirm the saved result.'});
  return {receipt:validateGameReceipt(data.receipt,sessionId),replayed:data.replayed};
}
export function settlementError(cause: {message?:string}) {
  const code=cause.message?.replace(/^game_settlement_/,'');
  const statuses: Record<string,number> = {not_found:404,nonce_mismatch:403,conflict:409,legacy_unreconciled:409,
    cap_rewards_hourly:429,invalid_input:400,invalid_duration:400,invalid_score:400,invalid_score_rate:400,client_outdated:400,game_unavailable:409};
  const status=code?statuses[code]:undefined;
  return error(status??500,{code:code==='nonce_mismatch'?'forbidden':code==='legacy_unreconciled'?'legacy_unreconciled':status?code!:'server_error',
    message:'Unable to complete game session.'});
}

/** Only a committed owner receipt may drive game-completion progression/events. */
export async function canonicalGameCompletionEvent(admin: SupabaseClient, userId: string, sessionId: string | null) {
  if (!sessionId || !z.string().uuid().safeParse(sessionId).success) throw error(400,{code:'bad_request',message:'Session required.'});
  const saved=await readGameSettlement(admin,userId,sessionId);
  if (!saved || !saved.gameId || !saved.gameSlug) throw error(409,{code:'unconfirmed_completion',message:'No confirmed game completion.'});
  const {score,durationMs,success,stats}=saved.request;
  return {key:`game.complete:${sessionId}`,payload:{sessionId,gameId:saved.gameId,gameSlug:saved.gameSlug,
    score,durationMs,success,stats,results:{score,durationMs,success,stats},rewardsGranted:saved.receipt.rewardsGranted}};
}
