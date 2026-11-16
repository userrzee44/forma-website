// Fixed Roblox endpoints only. No credentials, arbitrary proxy URLs, or private-data access.
const cache = new Map();
const inflight = new Map();
const cooldowns = new Map();
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
async function roblox(url, options = {}) {
  const key = url + (options.body || '');
  const host = new URL(url).hostname;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if ((cooldowns.get(host) || 0) > Date.now()) throw new ApiError(429, 'Roblox is receiving too many requests. Please try again shortly.');
  if (inflight.has(key)) return inflight.get(key);
  const promise = (async () => {
    let response;
    try { response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(9000) }); }
    catch { throw new ApiError(503, 'Roblox is taking too long to respond. Please try again.'); }
    if (!response.ok) {
      if (response.status === 429) cooldowns.set(host, Date.now() + 30000);
      const messages = { 400: 'Roblox could not process this request.', 401: 'Roblox requires authentication for this information.', 403: 'This information is private or restricted by Roblox.', 404: 'This information was not found on Roblox.', 429: 'Roblox is receiving too many requests. Please try again shortly.' };
      throw new ApiError(response.status === 429 ? 429 : response.status >= 500 ? 503 : response.status, messages[response.status] || 'Roblox is temporarily unavailable. Please try again.');
    }
    const value = await response.json();
    if (cache.size > 400) cache.delete(cache.keys().next().value);
    cache.set(key, { value, expires: Date.now() + 60000 });
    return value;
  })();
  inflight.set(key, promise);
  try { return await promise; } finally { inflight.delete(key); }
}
const get = (host, path) => roblox(`https://${host}.roblox.com${path}`);
const optional = async promise => { try { return { ok: true, value: await promise }; } catch (e) { return { ok: false, error: e.message, status: e.status || 503 }; } };
const validId = value => /^\d{1,16}$/.test(value || '') && Number.isSafeInteger(Number(value)) && Number(value) > 0;
async function pictures(items, type = 'avatar-headshot') {
  const ids = items.map(x => x.id).filter(Boolean).slice(0, 50);
  if (!ids.length) return items;
  const routes = { 'avatar-headshot': `/v1/users/avatar-headshot?userIds=${ids}&size=150x150&format=Png&isCircular=false`, outfits: `/v1/users/outfits?userOutfitIds=${ids}&size=420x420&format=Png&isCircular=false`, assets: `/v1/assets?assetIds=${ids}&size=150x150&format=Png&isCircular=false`, groups: `/v1/groups/icons?groupIds=${ids}&size=150x150&format=Png&isCircular=false`, badges: `/v1/badges/icons?badgeIds=${ids}&size=150x150&format=Png&isCircular=false`, games: `/v1/games/icons?universeIds=${ids}&size=256x256&format=Png&isCircular=false` };
  const result = await optional(get('thumbnails', routes[type]));
  const images = new Map((result.value?.data || []).map(x => [x.targetId, x.state === 'Completed' ? x.imageUrl : null]));
  return items.map(item => ({ ...item, image: images.get(item.id) || null }));
}
export async function dispatch(params) {
  const kind = params.get('kind') || 'search';
  if (kind === 'search') {
    const q = (params.get('q') || '').trim();
    if ((!validId(q) && q.length < 3) || q.length > 50) throw new ApiError(400, 'Enter at least 3 characters, or a player ID.');
    if (validId(q)) {
      const user = await get('users', `/v1/users/${q}`);
      return { data: await pictures([user]) };
    }
    // Fetch keyword matches and the exact username together; either can succeed independently.
    const [results, exact] = await Promise.all([
      optional(get('users', `/v1/users/search?keyword=${encodeURIComponent(q)}&limit=10`)),
      optional(roblox('https://users.roblox.com/v1/usernames/users', { method: 'POST', body: JSON.stringify({ usernames: [q], excludeBannedUsers: false }) }))
    ]);
    if (!results.ok && !exact.value?.data?.length) throw new ApiError(results.status, results.error);
    const all = [...(exact.value?.data || []), ...(results.value?.data || [])];
    const users = [...new Map(all.map(u => [u.id, u])).values()].slice(0, 10);
    return { data: await pictures(users) };
  }
  const id = params.get('id');
  if (!validId(id)) throw new ApiError(400, 'Enter a valid Roblox player ID.');
  const cursor = params.get('cursor') || '';
  if (cursor.length > 2000) throw new ApiError(400, 'Invalid page cursor.');
  const paging = `&cursor=${encodeURIComponent(cursor)}`;
  if (kind === 'profile') {
    const user = await get('users', `/v1/users/${id}`);
    const [avatar, thumbnail, friends, followers, following, inventory] = await Promise.all([
      optional(get('avatar', `/v1/users/${id}/avatar`)),
      optional(get('thumbnails', `/v1/users/avatar?userIds=${id}&size=420x420&format=Png&isCircular=false`)),
      optional(get('friends', `/v1/users/${id}/friends/count`)),
      optional(get('friends', `/v1/users/${id}/followers/count`)),
      optional(get('friends', `/v1/users/${id}/followings/count`)),
      optional(get('inventory', `/v1/users/${id}/can-view-inventory`))
    ]);
    return { user, avatar, thumbnail: thumbnail.value?.data?.[0]?.imageUrl || null, friends, followers, following, inventory, fetchedAt: new Date().toISOString() };
  }
  if (kind === 'avatar') {
    const avatar = await get('avatar', `/v1/users/${id}/avatar`);
    return { ...avatar, data: await pictures(avatar.assets || [], 'assets') };
  }
  if (kind === 'outfits') {
    const page = Number(params.get('page') || 1);
    if (!Number.isInteger(page) || page < 1 || page > 1000) throw new ApiError(400, 'Invalid page number.');
    const result = await get('avatar', `/v2/avatar/users/${id}/outfits?itemsPerPage=12&outfitType=Avatar&isEditable=true&paginationToken=${encodeURIComponent(cursor)}`);
    return { ...result, data: await pictures(result.data || [], 'outfits'), nextPageCursor: result.paginationToken || null };
  }
  if (kind === 'outfit') {
    const outfit = params.get('outfit');
    if (!validId(outfit)) throw new ApiError(400, 'Invalid outfit ID.');
    const result = await get('avatar', `/v1/outfits/${outfit}/details`);
    return { ...result, data: await pictures(result.assets || [], 'assets') };
  }
  if (kind === 'groups') {
    const result = await get('groups', `/v2/users/${id}/groups/roles`);
    const data = (result.data || []).map(x => ({ ...x.group, role: x.role }));
    const page = Math.max(1, Math.min(1000, Number(params.get('page')) || 1));
    return { data: await pictures(data.slice((page - 1) * 24, page * 24), 'groups'), total: data.length, nextPage: page * 24 < data.length ? page + 1 : null };
  }
  if (['friends','followers','following'].includes(kind)) {
    const route = kind === 'following' ? 'followings' : kind;
    const result = await get('friends', `/v1/users/${id}/${route}?limit=50&sortOrder=Desc${paging}`);
    const source = result.data || [];
    return { ...result, data: await pictures(source.slice(0, 50)), truncated: !result.nextPageCursor && source.length > 50 };
  }
  if (kind === 'badges') {
    const result = await get('badges', `/v1/users/${id}/badges?limit=10&sortOrder=Desc${paging}`);
    return { ...result, data: await pictures(result.data || [], 'badges') };
  }
  if (kind === 'names') return get('users', `/v1/users/${id}/username-history?limit=50&sortOrder=Desc${paging}`);
  if (kind === 'games' || kind === 'favorites') {
    const route = kind === 'favorites' ? 'favorite/games' : 'games';
    const result = await get('games', `/v2/users/${id}/${route}?accessFilter=Public&limit=10&sortOrder=Desc${paging}`);
    return { ...result, data: await pictures(result.data || [], 'games') };
  }
  if (kind === 'inventory') {
    const types = ['Hat','HairAccessory','FaceAccessory','NeckAccessory','ShoulderAccessory','FrontAccessory','BackAccessory','WaistAccessory','Shirt','Pants','TShirt','Gear','Face'];
    const type = params.get('type') || 'Hat';
    if (!types.includes(type)) throw new ApiError(400, 'Unsupported inventory category.');
    const access = await get('inventory', `/v1/users/${id}/can-view-inventory`);
    if (!access.canView) throw new ApiError(403, 'This player has made their inventory private.');
    const result = await get('inventory', `/v2/users/${id}/inventory?assetTypes=${type}&limit=10&sortOrder=Desc${paging}`);
    return { ...result, data: await pictures((result.data || []).map(x => ({ ...x, id: x.assetId })), 'assets') };
  }
  throw new ApiError(400, 'Unknown request.');
}
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') { res.setHeader('Allow','GET'); return res.status(405).json({ error: 'Only GET requests are supported.' }); }
  try {
    const result = await dispatch(new URL(req.url, 'https://bloxscope.local').searchParams);
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(result);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    if (error.status === 429) res.setHeader('Retry-After','30');
    return res.status(error.status || 503).json({ error: error.status ? error.message : 'Roblox is temporarily unavailable. Please try again.' });
  }
}
