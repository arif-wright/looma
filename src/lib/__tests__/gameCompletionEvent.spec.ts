import { describe, it, expect, vi } from 'vitest';
import { canonicalGameCompletionEvent } from '$lib/server/games/settlement';

const owner='10000000-0000-4000-8000-000000000001';
const session='20000000-0000-4000-8000-000000000001';
const game='30000000-0000-4000-8000-000000000001';
const fixture=()=>{
  const data={applied:true,result:{settlementVersion:1,sessionId:session,xpDelta:10,baseXpDelta:10,xpMultiplier:1,
    baseXp:10,finalXp:10,xpFromCompanion:0,xpFromStreak:0,currencyDelta:22,baseCurrencyDelta:20,currencyMultiplier:1.1,
    companionBonus:null,rewardsGranted:{xpGained:10,shardsGained:22,xpMultiplier:1,currencyMultiplier:1.1},rituals:null,achievements:[]},
    meta:{gameId:game,gameSlug:'dodge',request:{score:1000,durationMs:60000,nonce:'server-nonce',clientVersion:'1.0.0',success:true,stats:{waves:4}}}};
  const state:{data:typeof data|null;error:unknown}={data,error:null};
  const eq=vi.fn();const builder: any={select:vi.fn(()=>builder),eq: (...args:unknown[])=>{eq(...args);return builder;},maybeSingle:vi.fn(async()=>state)};
  const admin={from:vi.fn(()=>builder)};
  return {state,admin,eq};
};
describe('receipt-backed game completion events',()=>{
  it('derives one canonical key and payload from the committed owner receipt',async()=>{
    const f=fixture();const result=await canonicalGameCompletionEvent(f.admin as any,owner,session);
    expect(f.admin.from).toHaveBeenCalledWith('economy_transactions');
    expect(f.eq.mock.calls).toEqual([['user_id',owner],['source','game_session'],['idempotency_key',`game-session:${session}`]]);
    expect(result).toEqual({key:`game.complete:${session}`,payload:{sessionId:session,gameId:game,gameSlug:'dodge',score:1000,durationMs:60000,
      success:true,stats:{waves:4},results:{score:1000,durationMs:60000,success:true,stats:{waves:4}},
      rewardsGranted:{xpGained:10,shardsGained:22,xpMultiplier:1,currencyMultiplier:1.1}}});
    expect(JSON.stringify(result)).not.toContain('server-nonce');
  });
  it.each([null,'','arbitrary-client-session'])('rejects invalid session %s before privileged reads',async id=>{
    const f=fixture();await expect(canonicalGameCompletionEvent(f.admin as any,owner,id)).rejects.toMatchObject({status:400});
    expect(f.admin.from).not.toHaveBeenCalled();
  });
  it('cannot emit for an absent/unpaid/foreign receipt',async()=>{
    const f=fixture();f.state.data=null;await expect(canonicalGameCompletionEvent(f.admin as any,owner,session)).rejects.toMatchObject({status:409});
  });
  it.each(['unapplied','wrong-session','bad-reward','missing-request','missing-game','missing-slug'])('fails closed for %s canonical evidence',async kind=>{
    const f=fixture();const data=f.state.data!;
    if(kind==='unapplied')data.applied=false;
    if(kind==='wrong-session')data.result.sessionId=owner;
    if(kind==='bad-reward')data.result.rewardsGranted.xpGained=999;
    if(kind==='missing-request')delete (data.meta as any).request;
    if(kind==='missing-game')delete (data.meta as any).gameId;
    if(kind==='missing-slug')delete (data.meta as any).gameSlug;
    await expect(canonicalGameCompletionEvent(f.admin as any,owner,session)).rejects.toBeTruthy();
  });
});
