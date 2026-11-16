import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { dispatch } from '../api/roblox.js';
const query = obj => new URLSearchParams(obj);
test('rejects invalid identifiers, unknown actions and arbitrary upstream URLs',async()=>{
 for(const p of [{kind:'profile',id:'https://example.com'},{kind:'profile',id:'-2'},{kind:'profile',id:'0'},{kind:'search',q:'a'},{kind:'proxy',id:'1'},{kind:'inventory',id:'1',type:'secret'},{kind:'outfits',id:'1',page:'-1'}]) await assert.rejects(dispatch(query(p)),e=>e.status===400);
});
test('HTTP handler rejects writes and does not cache errors',async()=>{
 const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(j){this.body=j;return this;}});
 let r=response();await handler({method:'POST',url:'/api/roblox'},r);assert.equal(r.code,405);assert.equal(r.headers.Allow,'GET');
 r=response();await handler({method:'GET',url:'/api/roblox?kind=profile&id=nope'},r);assert.equal(r.code,400);assert.equal(r.headers['Cache-Control'],'no-store');
});
test('private inventory never calls the inventory listing endpoint',async t=>{
 const original=globalThis.fetch; t.after(()=>globalThis.fetch=original);
 let calls=[];globalThis.fetch=async url=>{calls.push(url);return new Response(JSON.stringify({canView:false}),{status:200});};
 await assert.rejects(dispatch(query({kind:'inventory',id:'999991',type:'Hat'})),e=>e.status===403);
 assert.equal(calls.length,1);assert.match(calls[0],/can-view-inventory$/);
});
test('partial profile failures preserve available data and never fake zero counts',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 globalThis.fetch=async url=>{
  if(url==='https://users.roblox.com/v1/users/999992')return new Response(JSON.stringify({id:999992,name:'test',displayName:'Test',created:'2020-01-01T00:00:00Z'}));
  if(url.includes('friends/count'))return new Response('{}',{status:403});
  if(url.includes('followers/count'))return new Response(JSON.stringify({count:123}));
  if(url.includes('followings/count'))return new Response('{}',{status:429});
  if(url.includes('can-view-inventory'))return new Response(JSON.stringify({canView:true}));
  if(url.includes('thumbnails'))return new Response(JSON.stringify({data:[]}));
  return new Response(JSON.stringify({assets:[],playerAvatarType:'R15'}));
 };
 const p=await dispatch(query({kind:'profile',id:'999992'}));assert.equal(p.user.id,999992);assert.equal(p.friends.ok,false);assert.equal(p.friends.value,undefined);assert.equal(p.followers.value.count,123);assert.equal(p.following.status,429);assert.equal(p.avatar.value.playerAvatarType,'R15');
});
test('thumbnail errors retain outfit metadata and pagination',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 globalThis.fetch=async url=>url.includes('thumbnails')?new Response('{}',{status:429}):new Response(JSON.stringify({data:Array.from({length:12},(_,i)=>({id:i+10,name:`Outfit ${i}`})),paginationToken:'next-token'}));
 const d=await dispatch(query({kind:'outfits',id:'999993',page:'1'}));assert.equal(d.data.length,12);assert.equal(d.data[0].image,null);assert.equal(d.nextPageCursor,'next-token');
});

test('one-digit player IDs are supported by search',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 globalThis.fetch=async url=>new Response(JSON.stringify(url.includes('thumbnails')?{data:[]}:{id:1,name:'Roblox',displayName:'Roblox'}));
 const d=await dispatch(query({kind:'search',q:'1'}));assert.equal(d.data[0].id,1);
});
