import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));
const DATA_FILE = join(ROOT_DIR, 'data', 'match-chat.json');
const PORT = Number.parseInt(process.env.PORT || '4173', 10);
// 인증 없는 mock API라 기본은 로컬 전용. LAN 공개가 필요하면 HOST=0.0.0.0 으로 명시한다.
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY_BYTES = 16 * 1024;
const MAX_MESSAGE_LENGTH = 300;
const SYSTEM_USER_IDS = new Set(['demo', 'sora', 'dohyun', 'junseo', 'hyeri', 'minjae', 'yeonwoo', 'jihu', 'garam']);
const SPORTS = new Set(['복싱', '주짓수', '킥복싱', '무에타이', 'MMA']);
const EXPERIENCE_LEVELS = new Set(['1년 미만', '1~2년', '3~5년', '5년+']);
const INTENSITIES = new Set(['드릴', '라이트', '보통']);
const PROFILE_COLORS = [
  ['#6e2836', '#ee5966'], ['#263c61', '#6fa8ec'], ['#254c45', '#60c3ad'],
  ['#543265', '#b773db'], ['#5a2928', '#df6d55'],
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function asText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function safeUserId(value) {
  if (typeof value !== 'string') return null;
  return SYSTEM_USER_IDS.has(value) || store.profiles.some((profile) => profile.id === value) ? value : null;
}

async function loadStore() {
  const raw = await readFile(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.conversations) || !Array.isArray(parsed.matchRequests)) {
    throw new Error('match-chat.json 형식이 올바르지 않습니다.');
  }
  if (!Array.isArray(parsed.profiles)) parsed.profiles = [];
  return parsed;
}

let store = await loadStore();
let pendingWrite = Promise.resolve();

function persistStore() {
  const snapshot = `${JSON.stringify(store, null, 2)}\n`;
  pendingWrite = pendingWrite.then(() => writeFile(DATA_FILE, snapshot, 'utf8'));
  return pendingWrite;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

function getQueryUserId(url) {
  return safeUserId(url.searchParams.get('userId'));
}

function ageFromBirthDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const birth = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = today.getUTCMonth() < birth.getUTCMonth()
    || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function publicProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    initial: profile.initial,
    sport: profile.sport,
    level: profile.level,
    intensity: profile.intensity,
    distance: profile.distance,
    location: profile.location,
    weight: profile.weight,
    height: profile.height,
    availability: profile.availability,
    gym: profile.gym,
    note: profile.note,
    verified: false,
    online: true,
    colors: profile.colors,
    glow: profile.glow,
    createdAt: profile.createdAt,
  };
}

async function readJsonBody(request) {
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > MAX_BODY_BYTES) {
      const error = new Error('요청 본문이 너무 큽니다.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('JSON 형식의 요청이 필요합니다.');
    error.statusCode = 400;
    throw error;
  }
}

function getOtherUserId(conversation, userId) {
  return conversation.memberIds.find((memberId) => memberId !== userId) || null;
}

function conversationSummary(conversation, userId) {
  const latestMessage = conversation.messages.at(-1) || null;
  return {
    id: conversation.id,
    otherUserId: getOtherUserId(conversation, userId),
    messages: conversation.messages,
    latestMessage,
  };
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(response, 200, { status: 'ok', storage: 'data/match-chat.json' });
  }

  if (request.method === 'GET' && url.pathname === '/api/profiles') {
    return sendJson(response, 200, { profiles: store.profiles.map(publicProfile) });
  }

  if (request.method === 'POST' && url.pathname === '/api/profiles') {
    const body = await readJsonBody(request);
    const name = asText(body.name, 16);
    const sport = asText(body.sport, 20);
    const level = asText(body.level, 20);
    const intensity = asText(body.intensity, 20);
    const location = asText(body.location, 30);
    const weight = asText(body.weight, 20);
    const height = asText(body.height, 20);
    const availability = asText(body.availability, 40);
    const gym = asText(body.gym, 50);
    const note = asText(body.note, 160);
    const birthDate = asText(body.birthDate, 10);
    const age = ageFromBirthDate(birthDate);

    if (name.length < 2 || !SPORTS.has(sport) || !EXPERIENCE_LEVELS.has(level) || !INTENSITIES.has(intensity)) {
      return sendError(response, 400, '닉네임과 운동 프로필 정보를 다시 확인해 주세요.');
    }
    if (age === null || age < 15 || age > 120) {
      return sendError(response, 400, '만 15세 이상만 가입할 수 있습니다.');
    }

    const colors = PROFILE_COLORS[store.profiles.length % PROFILE_COLORS.length];
    const profile = {
      id: createId('user'),
      name,
      initial: Array.from(name)[0],
      sport,
      level,
      intensity,
      distance: 10,
      location: location || '공개 지역 미설정',
      weight: weight || '체급 미설정',
      height: height || '키 미설정',
      availability: availability || '일정 조율',
      gym: gym || '소속 체육관 미설정',
      note: note || '안전한 룰과 강도를 합의할 스파링 파트너를 찾고 있어요.',
      colors,
      glow: 'rgba(229, 89, 102, 0.2)',
      createdAt: new Date().toISOString(),
    };
    store.profiles.push(profile);
    await persistStore();
    return sendJson(response, 201, { profile: publicProfile(profile) });
  }

  if (request.method === 'GET' && url.pathname === '/api/conversations') {
    const userId = getQueryUserId(url);
    if (!userId) return sendError(response, 400, '유효한 userId가 필요합니다.');
    const conversations = store.conversations
      .filter((conversation) => conversation.memberIds.includes(userId))
      .map((conversation) => conversationSummary(conversation, userId));
    return sendJson(response, 200, { conversations });
  }

  if (request.method === 'GET' && url.pathname === '/api/match-requests') {
    const userId = getQueryUserId(url);
    if (!userId) return sendError(response, 400, '유효한 userId가 필요합니다.');
    const requests = store.matchRequests.filter((matchRequest) => matchRequest.fromUserId === userId || matchRequest.toUserId === userId);
    return sendJson(response, 200, { requests });
  }

  if (request.method === 'POST' && url.pathname === '/api/match-requests') {
    const body = await readJsonBody(request);
    const fromUserId = safeUserId(body.fromUserId);
    const toUserId = safeUserId(body.toUserId);
    const purpose = asText(body.purpose, 40);
    const intensity = asText(body.intensity, 20);
    const preferredTime = asText(body.preferredTime, 60);
    const venueType = asText(body.venueType, 60);
    const message = asText(body.message, 200);

    if (!fromUserId || !toUserId || fromUserId === toUserId) {
      return sendError(response, 400, '유효한 요청 상대를 선택해 주세요.');
    }
    if (!purpose || !intensity || !preferredTime || !venueType || !message) {
      return sendError(response, 400, '운동 목적, 강도, 시간, 장소 유형과 메시지를 모두 입력해 주세요.');
    }
    if (store.matchRequests.some((item) => item.fromUserId === fromUserId && item.toUserId === toUserId && item.status === 'pending')) {
      return sendError(response, 409, '이미 대기 중인 스파링 요청이 있습니다.');
    }

    const matchRequest = {
      id: createId('request'),
      fromUserId,
      toUserId,
      purpose,
      intensity,
      preferredTime,
      venueType,
      message,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    store.matchRequests.push(matchRequest);
    await persistStore();
    return sendJson(response, 201, { request: matchRequest });
  }

  const requestMatch = url.pathname.match(/^\/api\/match-requests\/([^/]+)\/accept$/);
  if (request.method === 'POST' && requestMatch) {
    const body = await readJsonBody(request);
    const actorUserId = safeUserId(body.actorUserId);
    const matchRequest = store.matchRequests.find((item) => item.id === requestMatch[1]);
    if (!matchRequest) return sendError(response, 404, '스파링 요청을 찾을 수 없습니다.');
    if (!actorUserId || actorUserId !== matchRequest.toUserId) return sendError(response, 403, '요청을 수락할 권한이 없습니다.');
    if (matchRequest.status !== 'pending') return sendError(response, 409, '이미 처리된 요청입니다.');

    matchRequest.status = 'accepted';
    matchRequest.acceptedAt = new Date().toISOString();
    const existingConversation = store.conversations.find((conversation) => conversation.memberIds.includes(matchRequest.fromUserId) && conversation.memberIds.includes(matchRequest.toUserId));
    const conversation = existingConversation || {
      id: createId('conversation'),
      memberIds: [matchRequest.fromUserId, matchRequest.toUserId],
      messages: [],
    };
    if (!existingConversation) store.conversations.push(conversation);
    conversation.messages.push({
      id: createId('message'),
      senderId: actorUserId,
      body: '스파링 제안을 수락했어요. 룰과 강도, 공개 장소를 함께 확인해요.',
      createdAt: new Date().toISOString(),
    });
    await persistStore();
    return sendJson(response, 200, { request: matchRequest, conversation: conversationSummary(conversation, actorUserId) });
  }

  const declineMatch = url.pathname.match(/^\/api\/match-requests\/([^/]+)\/decline$/);
  if (request.method === 'POST' && declineMatch) {
    const body = await readJsonBody(request);
    const actorUserId = safeUserId(body.actorUserId);
    const matchRequest = store.matchRequests.find((item) => item.id === declineMatch[1]);
    if (!matchRequest) return sendError(response, 404, '스파링 요청을 찾을 수 없습니다.');
    if (!actorUserId || actorUserId !== matchRequest.toUserId) return sendError(response, 403, '요청을 거절할 권한이 없습니다.');
    if (matchRequest.status !== 'pending') return sendError(response, 409, '이미 처리된 요청입니다.');

    matchRequest.status = 'declined';
    matchRequest.declinedAt = new Date().toISOString();
    await persistStore();
    return sendJson(response, 200, { request: matchRequest });
  }

  const messageMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (request.method === 'POST' && messageMatch) {
    const body = await readJsonBody(request);
    const senderId = safeUserId(body.senderId);
    const messageBody = asText(body.body, MAX_MESSAGE_LENGTH);
    const conversation = store.conversations.find((item) => item.id === messageMatch[1]);
    if (!conversation) return sendError(response, 404, '대화방을 찾을 수 없습니다.');
    if (!senderId || !conversation.memberIds.includes(senderId)) return sendError(response, 403, '대화방에 메시지를 보낼 권한이 없습니다.');
    if (!messageBody) return sendError(response, 400, '메시지를 입력해 주세요.');

    const message = { id: createId('message'), senderId, body: messageBody, createdAt: new Date().toISOString() };
    conversation.messages.push(message);
    await persistStore();
    return sendJson(response, 201, { message });
  }

  return sendError(response, 404, 'API 경로를 찾을 수 없습니다.');
}

async function serveStatic(response, url) {
  let requestPath;
  try {
    requestPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  } catch {
    return sendError(response, 400, '잘못된 경로입니다.');
  }
  const normalizedPath = normalize(requestPath).replace(/^[\\/]+/, '');
  const filePath = resolve(join(ROOT_DIR, normalizedPath));
  const allowedExtension = extname(filePath).toLowerCase();
  // data/ 에는 모든 사용자의 대화가 들어 있으므로 정적 파일로 내보내지 않는다.
  const isPrivate = filePath.startsWith(`${join(ROOT_DIR, 'data')}${sep}`);
  if (!filePath.startsWith(`${ROOT_DIR}${sep}`) || isPrivate || !MIME_TYPES[allowedExtension]) {
    return sendError(response, 403, '허용되지 않은 파일 요청입니다.');
  }
  try {
    const contents = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': MIME_TYPES[allowedExtension], 'Cache-Control': 'no-cache' });
    response.end(contents);
  } catch (error) {
    if (error?.code === 'ENOENT') return sendError(response, 404, '파일을 찾을 수 없습니다.');
    console.error(error);
    return sendError(response, 500, '파일을 제공할 수 없습니다.');
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return sendError(response, 405, 'GET 요청만 지원합니다.');
    return await serveStatic(response, url);
  } catch (error) {
    console.error(error);
    return sendError(response, error?.statusCode || 500, error?.message || '서버 오류가 발생했습니다.');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`SparringMatch server listening on ${HOST}:${PORT}`);
  console.log(`Match/chat data file: ${DATA_FILE}`);
});
