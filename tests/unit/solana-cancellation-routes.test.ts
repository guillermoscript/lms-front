import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const m = vi.hoisted(() => ({
  user: {id:'owner'} as {id:string}|null, tenant:'school', rpc:vi.fn(), state:vi.fn(), build:vi.fn(), reconcile:vi.fn(), filters:[] as Record<string,unknown>[],
}))
vi.mock('@/lib/supabase/tenant', () => ({getCurrentTenantId:async()=>m.tenant}))
vi.mock('@/lib/rate-limit', () => ({paymentAuthLimiter:{check:async()=>{}}}))
vi.mock('@/lib/supabase/admin', () => ({createAdminClient:()=>({rpc:m.rpc})}))
vi.mock('@/lib/payments/solana-subscriptions', () => ({getSubscriptionState:m.state,buildCancelTxUnsignedBase64:m.build}))
vi.mock('@/lib/payments/solana-renewal', () => ({renewSolanaSubscription:m.reconcile}))
vi.mock('@/lib/supabase/server', () => ({createClient:async()=>({auth:{getUser:async()=>({data:{user:m.user}})},from:()=>{
  const filters:Record<string,unknown>={};const q={select:()=>q,eq:(key:string,value:unknown)=>{filters[key]=value;return q},maybeSingle:async()=>{
    m.filters.push(filters)
    return {data:filters.user_id==='owner'&&filters.tenant_id==='school'?{subscription_id:1,payment_provider:'solana_subs',provider_metadata:{subscriber:'wallet',merchant:'merchant',planId:'1'}}:null}
  }};return q
}})}))
import {POST as verify} from '@/app/api/payments/solana/cancel-verify/route'
import {POST as build} from '@/app/api/payments/solana/cancel-tx/route'
function request(origin='http://school.test',headerTenant?:string,id=1){return new NextRequest('http://school.test/api/payments/solana/cancel-verify',{method:'POST',headers:{host:'school.test',origin,'content-type':'application/json',...(headerTenant?{'x-tenant-id':headerTenant}:{})},body:JSON.stringify({subscriptionId:id})})}
beforeEach(()=>{vi.clearAllMocks();m.user={id:'owner'};m.tenant='school';m.filters=[];process.env.SOLANA_RPC_URL='https://api.devnet.solana.com';m.state.mockResolvedValue({expiresAtTs:BigInt(2000000000)});m.reconcile.mockResolvedValue({status:'not_due'});m.rpc.mockResolvedValue({data:'2033-05-18T03:33:20Z',error:null});m.build.mockResolvedValue('unsigned')})
describe.each([['build',build],['verify',verify]] as const)('%s cancellation authorization (mocked sessions/database)',(_label,route)=>{
  it('rejects wrong owner before chain or privileged work',async()=>{m.user={id:'other'};expect((await route(request())).status).toBe(404);expect(m.rpc).not.toHaveBeenCalled();expect(m.state).not.toHaveBeenCalled();expect(m.build).not.toHaveBeenCalled()})
  it('rejects wrong school and a forged tenant header',async()=>{m.tenant='wrong';expect((await route(request('http://school.test','school'))).status).toBe(404);expect(m.rpc).not.toHaveBeenCalled()})
  it('rejects cross origin',async()=>{expect((await route(request('http://other.test'))).status).toBe(403);expect(m.filters).toHaveLength(0)})
  it('requires a session',async()=>{m.user=null;expect((await route(request())).status).toBe(401)})
  it('rejects unsafe/invalid IDs',async()=>{expect((await route(request('http://school.test',undefined,-1))).status).toBe(400)})
})
it('delegation cancellation reconciles without debiting and calls the shared scheduled-access transition',async()=>{
  const response=await verify(request());expect(response.status).toBe(200)
  expect(m.reconcile).toHaveBeenCalledWith(expect.anything(),expect.anything(),{recoveryOnly:true})
  expect(m.rpc).toHaveBeenCalledWith('apply_subscription_cancellation',{_subscription_id:1,_immediate:false,_provider_deadline:'2033-05-18T03:33:20.000Z'})
})
it('uncanceled chain state does not change access',async()=>{m.state.mockResolvedValue({expiresAtTs:BigInt(0)});expect(await (await verify(request())).json()).toEqual({canceled:false});expect(m.rpc).not.toHaveBeenCalled()})
it('receipt uncertainty requires recovery without pretending cancellation/access persistence succeeded',async()=>{m.reconcile.mockRejectedValue(new Error('receipt write unavailable'));expect((await verify(request())).status).toBe(503);expect(m.rpc).not.toHaveBeenCalled()})
