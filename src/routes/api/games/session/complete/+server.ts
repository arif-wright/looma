import { env } from '$env/dynamic/private';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureAuth, getSession, hasAbuseFlag, getAdminClient, getConfigForGame, getGameById } from '$lib/server/games/guard';
import { buildSignaturePayload, verifySignature } from '$lib/server/games/hmac';
import { limit } from '$lib/server/games/rate';
import { logEvent } from '$lib/server/analytics/log';
import { inspectSessionComplete } from '$lib/server/anti/inspect';
import { getDeviceHash } from '$lib/server/utils/device';
import { logGameAudit } from '$lib/server/games/audit';
import { createAchievementNotification } from '$lib/server/notifications';
import { getAchievementShardFactor } from '$lib/server/econ/index';
import { ingestServerEvent } from '$lib/server/events/ingest';
import { safeGameApiError } from '$lib/server/games/safeApiError';
import { assertSameSubmission, parseGameSubmission, parseSettlementResult, readGameSettlement, settlementError } from '$lib/server/games/settlement';

const rateLimitPerMinute = Number.parseInt(env.GAME_RATE_LIMIT_PER_MINUTE ?? '20', 10) || 20;
const maxRewardsPerHour = Number.parseInt(env.GAME_MAX_REWARDS_PER_HOUR ?? '60', 10) || 60;

export const POST: RequestHandler = async (event) => {
  try {
    const {user,supabase}=await ensureAuth(event);
    // Revalidate identity at the service-role boundary, even with cached locals.
    const verified=await supabase.auth.getUser();
    if (verified.error || verified.data.user?.id!==user.id) throw error(401,{code:'unauthorized',message:'Authentication required.'});
    let raw:unknown;
    try { raw=await event.request.json(); } catch { throw error(400,{code:'bad_request',message:'Invalid JSON.'}); }
    const {sessionId,signature,submission}=parseGameSubmission(raw);
    const {score,durationMs,nonce}=submission;
    const session=await getSession(supabase,sessionId);
    if (!session || session.user_id!==user.id) throw error(404,{code:'not_found',message:'Session not found.'});
    if (session.nonce!==nonce) throw error(403,{code:'forbidden',message:'Nonce mismatch.'});
    if (!verifySignature(buildSignaturePayload(sessionId,score,durationMs,nonce),signature)) {
      throw error(403,{code:'forbidden',message:'Invalid signature.'});
    }
    const admin=getAdminClient();
    const saved=await readGameSettlement(admin,user.id,sessionId);
    // Authorization and immutable-request checks precede replay; changing catalog,
    // bonuses, hourly caps or private tuning cannot change an already-paid receipt.
    if (saved) {
      assertSameSubmission(saved.request,submission);
      return json(saved.receipt);
    }
    if (session.status!=='started' || session.completed_at) throw error(409,{code:'legacy_unreconciled',message:'This earlier session has no recoverable receipt.'});
    const clientIp=typeof event.getClientAddress==='function'?event.getClientAddress():null;
    await limit(supabase,`games:complete:user:${user.id}`,rateLimitPerMinute);
    if (clientIp) await limit(supabase,`games:complete:ip:${clientIp}`,rateLimitPerMinute);
    if (await hasAbuseFlag(user.id)) throw error(403,{code:'restricted',message:'Account is temporarily restricted.'});
    const rawCap=Number.parseFloat(env.ECON_STREAK_MULTIPLIER_CAP ?? '2');
    const {data,error:rpcError}=await admin.rpc('fn_settle_game_session',{
      p_user:user.id,p_session:sessionId,p_score:score,p_duration_ms:durationMs,p_nonce:nonce,
      p_client_version:submission.clientVersion,p_success:submission.success,p_stats:submission.stats,
      p_max_rewards_per_hour:maxRewardsPerHour,p_streak_multiplier_cap:Number.isFinite(rawCap)&&rawCap>0?rawCap:2,
      p_achievement_shard_factor:getAchievementShardFactor()
    });
    if (rpcError) throw settlementError(rpcError);
    const settled=parseSettlementResult(data,sessionId);
    if (!settled.replayed) {
      // Only optional presentation/observability remains. It cannot award money,
      // change the receipt, or turn a successful commit into a failed response.
      const receipt=settled.receipt;
      const effects=Promise.allSettled([
        Promise.resolve().then(async () => {
          if (!session.game_id) return;
          const [config,game]=await Promise.all([getConfigForGame(supabase,session.game_id),getGameById(session.game_id)]);
          const deviceHash=getDeviceHash(event);
          await inspectSessionComplete({userId:user.id,sessionId,gameId:session.game_id,score,durationMs,
            ip:clientIp,deviceHash,caps:{maxScorePerMin:config?.max_score_per_min ?? null,minDurationMs:config?.min_duration_ms ?? null}});
          await logEvent(event,'game_complete',{userId:user.id,sessionId,gameId:session.game_id,score,durationMs,
            meta:{slug:game?.slug,success:submission.success,stats:submission.stats,deviceHash,
              multiplier:receipt.currencyMultiplier,baseCurrency:receipt.baseCurrencyDelta}});
        }),
        ...(receipt.currencyDelta>0?[Promise.resolve().then(()=>logEvent(event,'wallet_grant',{
          userId:user.id,sessionId,...(session.game_id?{gameId:session.game_id}:{}),amount:receipt.currencyDelta,currency:'shards',
          meta:{source:'game_session',multiplier:receipt.currencyMultiplier,baseCurrency:receipt.baseCurrencyDelta}
        }))]:[]),
        ...receipt.achievements.map(entry=>Promise.resolve().then(async()=>{
          await logEvent(event,'achievement_unlock',{userId:user.id,sessionId,...(session.game_id?{gameId:session.game_id}:{}),
            meta:{key:entry.key,points:entry.points,shards:entry.shards,rarity:entry.rarity}});
          if(entry.shards>0) await logEvent(event,'wallet_grant',{userId:user.id,sessionId,amount:entry.shards,currency:'shards',
            meta:{source:'achievement',key:entry.key,points:entry.points}});
        })),
        ...['alltime','daily','weekly'].map(scope=>Promise.resolve().then(()=>admin.rpc('fn_leader_refresh',{p_scope:scope}))),
        ...receipt.achievements.map(entry=>Promise.resolve().then(()=>createAchievementNotification(admin,{
          userId:user.id,achievementId:entry.achievementId,metadata:{key:entry.key,name:entry.name,points:entry.points,icon:entry.icon,rarity:entry.rarity}
        }))),
        Promise.resolve().then(()=>logGameAudit({userId:user.id,sessionId,event:'complete',ip:clientIp,
          details:{score,durationMs,clientVersion:submission.clientVersion,settlementVersion:1}})),
        Promise.resolve().then(()=>ingestServerEvent(event,'game.complete',{
          sessionId,gameId:session.game_id,score,durationMs,success:submission.success,stats:submission.stats,
          rewardsGranted:receipt.rewardsGranted
        },{sessionId,idempotencyKey:`game.complete:${sessionId}`}))
      ]);
      // A hung optional downstream service must not strand the reward response.
      let timer:ReturnType<typeof setTimeout>|undefined;
      await Promise.race([effects,new Promise<void>(resolve=>{timer=setTimeout(resolve,1500);})]);
      if (timer) clearTimeout(timer);
    }
    return json(settled.receipt);
  } catch (cause) { return safeGameApiError('complete',cause); }
};
