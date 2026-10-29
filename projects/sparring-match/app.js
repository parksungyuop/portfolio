/* SparringMatch beta — static mock-data prototype. No real user or payment data is stored. */

const icons = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-7h6v7"/></svg>',
  compass: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.1 4.8-4.8 2.1 2.1-4.8Z"/></svg>',
  users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18-6-3V5l6 3 6-3 6 3v10l-6-3Z"/><path d="M9 8v10M15 5v10"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  message: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.9 9.9 0 0 1-4.5-1L3 20l1.1-3.7A8.4 8.4 0 0 1 3 11.5a8.4 8.4 0 0 1 9-8.5 8.4 8.4 0 0 1 9 8.5Z"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-3.8 8-10V5l-8-3-8 3v7c0 6.2 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.9-8.6a5.5 5.5 0 0 0-.1-7.8Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 4v4M16 10v4M10 16v4"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8Z"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></svg>',
  flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4"/><path d="M5 5c5-3 7 3 14 0v9c-7 3-9-3-14 0"/></svg>',
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l1 13H5L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
};

const mockUsers = [
  { id: 'dohyun', name: '김도현', initial: '도', sport: '복싱', level: '3~5년', intensity: '라이트', distance: 2.1, location: '성수 · 약 2km', weight: '-71kg', height: '175~179cm', availability: '화·목 20:00 이후', gym: '성수 파이트랩', note: '기본기 위주로 3R 라이트 스파링 선호합니다.', verified: true, online: true, colors: ['#6e2836', '#ee5966'], glow: 'rgba(229,59,71,0.23)' },
  { id: 'sora', name: '박소라', initial: '소', sport: '주짓수', level: '1~2년', intensity: '드릴', distance: 3.8, location: '건대 · 약 4km', weight: '-57kg', height: '160~164cm', availability: '토요일 오전', gym: '아지트 그래플링', note: '노기 드릴과 오픈매트 동행할 분을 찾아요.', verified: true, online: false, colors: ['#263c61', '#6fa8ec'], glow: 'rgba(112,183,255,0.2)' },
  { id: 'junseo', name: '이준서', initial: '준', sport: '킥복싱', level: '5년+', intensity: '보통', distance: 4.5, location: '잠실 · 약 5km', weight: '-75kg', height: '180~184cm', availability: '평일 저녁', gym: '잠실 스트라이크', note: '보호장비 갖추고 테크니컬 스파링합니다.', verified: true, online: true, colors: ['#60431e', '#e8ab51'], glow: 'rgba(240,182,76,0.2)' },
  { id: 'hyeri', name: '최혜리', initial: '혜', sport: 'MMA', level: '3~5년', intensity: '보통', distance: 6.2, location: '강남 · 약 6km', weight: '-61kg', height: '165~169cm', availability: '수·금 19:30', gym: '옥타곤 랩', note: '레슬링 연결 드릴과 가벼운 MMA 룰 가능해요.', verified: true, online: false, colors: ['#543265', '#b773db'], glow: 'rgba(183,115,219,0.2)' },
  { id: 'minjae', name: '한민재', initial: '민', sport: '복싱', level: '1년 미만', intensity: '드릴', distance: 7.3, location: '마포 · 약 7km', weight: '-67kg', height: '170~174cm', availability: '일요일 오후', gym: '연남 복싱클럽', note: '잽·풋워크 중심으로 안전하게 연습하고 싶습니다.', verified: false, online: true, colors: ['#254c45', '#60c3ad'], glow: 'rgba(96,195,173,0.18)' },
  { id: 'yeonwoo', name: '정연우', initial: '연', sport: '무에타이', level: '3~5년', intensity: '라이트', distance: 8.8, location: '왕십리 · 약 9km', weight: '-63kg', height: '165~169cm', availability: '월·수 21:00', gym: '왕십리 무에타이', note: '클린치와 미트 이후 라이트 스파링 좋아합니다.', verified: true, online: false, colors: ['#5a2928', '#df6d55'], glow: 'rgba(223,109,85,0.2)' },
  { id: 'jihu', name: '서지후', initial: '지', sport: 'MMA', level: '1~2년', intensity: '보통', distance: 11.6, location: '강서 · 약 12km', weight: '-71kg', height: '175~179cm', availability: '평일 저녁', gym: '강서 MMA 팩토리', note: '테이크다운 이후 포지션 드릴 위주로 연습하고 싶습니다.', verified: false, online: true, colors: ['#1f4a52', '#5fc0cf'], glow: 'rgba(95,192,207,0.2)' },
  { id: 'garam', name: '문가람', initial: '가', sport: '복싱', level: '1~2년', intensity: '라이트', distance: 14.2, location: '노원 · 약 14km', weight: '-61kg', height: '160~164cm', availability: '주말 오전', gym: '노원 파이트 짐', note: '주말 오전에 풋워크와 라이트 스파링 맞춰볼 분 찾아요.', verified: true, online: false, colors: ['#5b3a1c', '#e0a34e'], glow: 'rgba(224,163,78,0.2)' },
];

const gyms = [
  { id: 'fightlab', name: '성수 파이트랩', sports: '복싱 · 킥복싱', distance: '1.8km', rating: '4.9', reviews: 128, open: '오늘 22:30까지', pos: [31, 57], symbol: 'F', verified: true },
  { id: 'ag', name: '아지트 그래플링', sports: '주짓수 · 노기', distance: '3.5km', rating: '4.8', reviews: 96, open: '오늘 23:00까지', pos: [66, 35], symbol: 'G', verified: true },
  { id: 'strike', name: '잠실 스트라이크', sports: '킥복싱 · 무에타이', distance: '4.7km', rating: '4.7', reviews: 74, open: '오늘 21:30까지', pos: [73, 70], symbol: 'S', verified: false },
  { id: 'octagon', name: '옥타곤 랩 강남', sports: 'MMA · 레슬링', distance: '6.1km', rating: '4.9', reviews: 213, open: '오늘 22:00까지', pos: [42, 24], symbol: 'O', verified: true },
  { id: 'mapo', name: '마포 복싱 스테이션', sports: '복싱 · 피트니스', distance: '7.9km', rating: '4.6', reviews: 58, open: '오늘 22:00까지', pos: [16, 44], symbol: 'M', verified: true },
  { id: 'nowon', name: '노원 그래플링 랩', sports: '주짓수 · 레슬링', distance: '14.2km', rating: '4.8', reviews: 41, open: '오늘 21:00까지', pos: [84, 15], symbol: 'N', verified: false },
];

const events = [
  { id: 'openmat', month: 'OCT', day: '04', title: '성수 오픈매트: 노기 그래플링', category: '오픈매트', place: '성수 파이트랩 · 14:00', people: '관심 38명', accent: 'red' },
  { id: 'seminar', month: 'OCT', day: '09', title: '복싱 풋워크 & 거리 만들기 세미나', category: '세미나', place: '연남 복싱클럽 · 11:00', people: '잔여 8석', accent: 'blue' },
  { id: 'amateur', month: 'OCT', day: '17', title: '서울 아마추어 킥복싱 스파링 데이', category: '대회·교류전', place: '잠실 스트라이크 · 13:00', people: '참가 신청 중', accent: 'yellow' },
  { id: 'mma', month: 'OCT', day: '23', title: '초급 MMA 룰 이해 & 안전 교육', category: '클래스', place: '옥타곤 랩 강남 · 16:30', people: '관심 17명', accent: 'red' },
];

const posts = [
  { id: 'post1', author: '윤태호', initial: '태', board: '복싱', time: '18분 전', title: '라이트 스파링에서 거리 조절이 잘 안 될 때', body: '상대가 압박을 강하게 가져올 때 잽만 치다가 코너에 몰리는 편이에요. 다들 어떤 식으로 각을 만들어서 빠져나오시나요?', likes: 23, comments: 12, colors: ['#313f67', '#7b9ce8'] },
  { id: 'post2', author: '정연우', initial: '연', board: '무에타이', time: '42분 전', title: '왕십리 쪽 주말 오픈매트 정보 공유합니다', body: '이번 주 토요일 오후에 초급·중급 섞여서 가볍게 하기로 했습니다. 정강이 보호대와 마우스피스는 꼭 챙겨 주세요.', likes: 18, comments: 7, colors: ['#5b2c28', '#dc705d'] },
  { id: 'post3', author: '서유진', initial: '유', board: '장비', time: '1시간 전', title: '첫 16oz 글러브, 손목 지지감 비교 후기', body: '손이 작은 편이라 여러 제품을 착용해 봤습니다. 단순히 브랜드보다 손목 스트랩 길이와 안감이 더 중요하게 느껴졌어요.', likes: 41, comments: 19, colors: ['#355740', '#70bd88'] },
  { id: 'post4', author: '김도현', initial: '도', board: '성수', time: '2시간 전', title: '평일 저녁 3R 라이트 스파링 파트너 구합니다', body: '성수 파이트랩에서 화·목 8시 이후 가능하신 분 계실까요? 체급 차이는 너무 크지 않으면 좋겠습니다.', likes: 9, comments: 5, colors: ['#6e2836', '#ee5966'] },
];

let conversations = [
  { id: 'sora', userId: 'sora', preview: '토요일 11시 오픈매트 괜찮아요!', time: '10:32', unread: 1, messages: [
    { who: 'them', body: '안녕하세요! 노기 드릴 위주로 찾고 계신 걸 봤어요.', time: '10:23' },
    { who: 'me', body: '네, 무리하지 않고 1시간 정도 같이 해보고 싶어요.', time: '10:27' },
    { who: 'them', body: '토요일 11시 오픈매트 괜찮아요!', time: '10:32' },
  ] },
  { id: 'dohyun', userId: 'dohyun', preview: '화요일 8시 이후 가능합니다.', time: '어제', unread: 0, messages: [
    { who: 'them', body: '화요일 8시 이후 가능합니다. 보호장비는 모두 있어요.', time: '어제 21:12' },
  ] },
];

const products = [
  { id: 'new-glove', name: 'StrikeOne Pro 16oz 글러브', brand: 'StrikeOne', type: '새제품', category: '글러브', price: 89000, accent: 'red', mark: '16', badge: '베스트', description: '입문부터 라이트 스파링까지. 손목 스트랩과 기본 보호력을 갖춘 mock 상품입니다.' },
  { id: 'new-shin', name: 'MatCraft 인스텝 정강이 보호대', brand: 'MatCraft', type: '새제품', category: '보호장비', price: 64000, accent: 'blue', mark: 'SH', badge: 'NEW', description: '킥복싱·무에타이 훈련용 보호장비 mock 상품입니다.' },
  { id: 'new-rash', name: 'Groundline 노기 래시가드', brand: 'Groundline', type: '새제품', category: '도복·의류', price: 49000, accent: 'green', mark: 'GR', badge: '', description: '움직임을 고려한 긴소매 래시가드 mock 상품입니다.' },
  { id: 'new-mouth', name: 'CoreGuard 맞춤형 마우스피스', brand: 'CoreGuard', type: '새제품', category: '보호장비', price: 28000, accent: 'yellow', mark: 'CG', badge: '추천', description: '스파링 전 필수 보호장비를 알리는 mock 상품입니다.' },
  { id: 'used-glove', name: 'Velo 14oz 글러브 · 블랙', brand: '개인 판매자', type: '중고', category: '글러브', price: 35000, accent: 'red', mark: '14', badge: '상태 A', seller: '도현복서', location: '성수 · 직거래 가능', description: '사용감이 적은 중고 mock 상품입니다. 실물 상태와 사이즈는 거래 전 판매자에게 확인하세요.' },
  { id: 'used-gi', name: '화이트 주짓수 도복 A2', brand: '개인 판매자', type: '중고', category: '도복·의류', price: 42000, accent: 'blue', mark: 'A2', badge: '상태 B+', seller: '소라그랩', location: '건대 · 택배 가능', description: '사이즈·수축 여부를 확인해야 하는 중고 도복 mock 상품입니다.' },
  { id: 'used-headgear', name: '헤드기어 M 사이즈', brand: '개인 판매자', type: '중고', category: '보호장비', price: 22000, accent: 'yellow', mark: 'M', badge: '상태 A-', seller: '민재킥', location: '마포 · 안전결제', description: '스파링용 중고 헤드기어 mock 상품입니다. 보호 성능을 반드시 직접 확인하세요.' },
];

const MATCH_CHAT_USER_ID = 'demo';
let registeredProfiles = [];

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

async function matchChatRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '서버 요청을 처리하지 못했습니다.');
  return payload;
}

function formatServerTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '방금';
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function currentUserId() {
  return state.account?.userId || MATCH_CHAT_USER_ID;
}

function pendingReceivedRequests() {
  return state.serverRequests.filter((request) => request.toUserId === currentUserId() && request.status === 'pending');
}

// 가입 프로필은 다른 사용자가 쓴 문자열이다. 렌더 템플릿 곳곳에서 챙기는 대신 들어오는 지점에서 한 번 이스케이프한다.
function sanitizeProfile(profile) {
  return Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, typeof value === 'string' ? escapeHtml(value) : value]));
}

// 위치 보호(설계서 §9.2): 소수점 거리 대신 km 버킷으로만 보여준다.
function distanceLabel(user) {
  return `약 ${Math.max(1, Math.ceil(user.distance))}km`;
}

// Bumble "Things you can bond over" 패턴 — 나와 겹치는 운동 조건.
function commonGround(user) {
  const me = myProfile();
  const items = [];
  if (user.sport === me.sport) items.push(`같은 종목 · ${user.sport}`);
  if (user.intensity === me.intensity) items.push(`강도 일치 · ${user.intensity}`);
  if (user.level === me.level) items.push('비슷한 연차');
  if (user.distance <= 5) items.push('5km 이내');
  return items;
}

function profileToUser(profile) {
  return {
    ...profile,
    initial: profile.initial || Array.from(profile.name || '나')[0],
    colors: profile.colors || ['#6e2836', '#ee5966'],
    glow: profile.glow || 'rgba(229, 89, 102, 0.2)',
  };
}

function allUsers() {
  return [...mockUsers, ...registeredProfiles.map(profileToUser)];
}

function findUser(userId) {
  return allUsers().find((user) => user.id === userId);
}

function toClientConversation(conversation) {
  const latest = conversation.latestMessage || conversation.messages.at(-1);
  return {
    id: conversation.id,
    userId: conversation.otherUserId,
    preview: latest?.body || '새로운 매칭 대화가 시작됐어요.',
    time: latest ? formatServerTime(latest.createdAt) : '',
    unread: 0,
    messages: conversation.messages.map((message) => ({
      who: message.senderId === currentUserId() ? 'me' : 'them',
      body: message.body,
      time: formatServerTime(message.createdAt),
    })),
  };
}

async function syncMatchAndChat() {
  const userId = currentUserId();
  try {
    const [conversationPayload, requestPayload, profilePayload] = await Promise.all([
      matchChatRequest(`/api/conversations?userId=${encodeURIComponent(userId)}`),
      matchChatRequest(`/api/match-requests?userId=${encodeURIComponent(userId)}`),
      matchChatRequest('/api/profiles'),
    ]);
    registeredProfiles = (profilePayload.profiles || []).map(sanitizeProfile);
    if (currentUserId() !== userId) return;
    conversations = conversationPayload.conversations.map(toClientConversation);
    state.serverRequests = requestPayload.requests;
    state.sentRequests = new Set(requestPayload.requests
      .filter((request) => request.fromUserId === userId && request.status === 'pending')
      .map((request) => request.toUserId));
    if (!conversations.some((conversation) => conversation.id === state.activeConversationId)) {
      state.activeConversationId = conversations[0]?.id || null;
    }
    state.serverConnected = true;
    render();
  } catch (error) {
    state.serverConnected = false;
    console.warn('매칭·채팅 서버에 연결하지 못했습니다.', error);
  }
}

const AUTH_ACCOUNTS_KEY = 'sparringmatch-beta-accounts-v1';
const AUTH_SESSION_KEY = 'sparringmatch-beta-session-v1';
const DEMO_ACCOUNT = { userId: MATCH_CHAT_USER_ID, email: 'demo@sparringmatch.beta', nickname: '김파이터', sport: '복싱', birthDate: '1998-06-12', initial: '나', colors: ['#6e2836', '#ee5966'], demo: true };

function readStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function readSession() {
  return readStoredJson(AUTH_SESSION_KEY, null);
}

function saveSession(account) {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(account));
}

function clearSession() {
  localStorage.removeItem(AUTH_SESSION_KEY);
}

async function hashForMockOnly(value) {
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `fallback-${Array.from(value).reduce((total, char) => total + char.charCodeAt(0), 0)}`;
}

function calculateAge(dateString) {
  const birth = new Date(`${dateString}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function myProfile() {
  const account = state.account || DEMO_ACCOUNT;
  const savedProfile = account.userId ? registeredProfiles.find((profile) => profile.id === account.userId) : null;
  const profile = savedProfile || account;
  return {
    initial: profile.initial || Array.from(profile.name || profile.nickname || '나')[0],
    name: profile.name || profile.nickname || '김파이터',
    sport: profile.sport || '복싱',
    level: profile.level || '3~5년',
    intensity: profile.intensity || '라이트',
    location: profile.location || '성수 · 대략 표시',
    weight: profile.weight || '-67 ~ -75kg',
    availability: profile.availability || '평일 저녁',
    colors: profile.colors || ['#6e2836', '#ee5966'],
    verified: Boolean(account.demo),
  };
}

const state = {
  page: 'home',
  sport: '전체',
  intensity: '전체',
  radius: 10,
  search: '',
  selectedGymId: 'fightlab',
  activeConversationId: 'sora',
  sentRequests: new Set(),
  savedUsers: new Set(),
  passedUsers: new Set(),
  eventFilter: '전체 일정',
  shopType: '전체',
  shopCategory: '전체',
  cart: new Set(),
  savedProducts: new Set(),
  authMode: 'login',
  account: readSession(),
  serverConnected: null,
  serverRequests: [],
};

const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
const toastRoot = document.querySelector('#toast-root');

function avatar(user, classes = '') {
  const [a, b] = user.colors || ['#6e2836', '#ee5966'];
  return `<div class="avatar ${classes}" style="--avatar-a:${a}; --avatar-b:${b}" aria-label="${user.name} 프로필 이미지">${user.initial}</div>`;
}

function miniAvatar(user) {
  const [a, b] = user.colors || ['#6e2836', '#ee5966'];
  return `<div class="mini-avatar" style="--avatar-a:${a}; --avatar-b:${b}" aria-hidden="true">${user.initial}</div>`;
}

function verified() {
  return `<span class="verified-tag">${icons.check} 인증됨</span>`;
}

function pageTitle(page) {
  return ({ home: '홈', find: '파트너 찾기', community: '커뮤니티', gyms: '체육관', events: '이벤트', shop: '장비샵', messages: '메시지', profile: '내 프로필' })[page] || 'SparringMatch';
}

function navButton(page, icon, label, extra = '') {
  return `<button class="side-link ${state.page === page ? 'active' : ''}" data-page="${page}" ${state.page === page ? 'aria-current="page"' : ''}>${icons[icon]}<span>${label}</span>${extra}</button>`;
}

function bottomLink(page, icon, label) {
  return `<button class="bottom-link ${state.page === page ? 'active' : ''}" data-page="${page}" ${state.page === page ? 'aria-current="page"' : ''}>${icons[icon]}<span>${label}</span></button>`;
}

function renderShell(content) {
  const inboxCount = pendingReceivedRequests().length;
  const topItems = [
    ['home', '홈'], ['find', '파트너 찾기'], ['community', '커뮤니티'], ['gyms', '체육관'], ['events', '이벤트'], ['shop', '장비샵'],
  ];
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <button class="brand" data-page="home" aria-label="SparringMatch 홈으로 이동">
          <span class="fc-mark"><span>FC</span></span><span>SparringMatch</span>
        </button>
        <nav class="top-nav" aria-label="주요 메뉴">
          ${topItems.map(([page, label]) => `<button class="nav-item ${state.page === page ? 'active' : ''}" data-page="${page}" ${state.page === page ? 'aria-current="page"' : ''}>${label}</button>`).join('')}
        </nav>
        <div class="top-actions">
          <button class="icon-button" data-page="events" aria-label="이벤트 보기">${icons.calendar}</button>
          <button class="icon-button" data-page="messages" aria-label="${inboxCount ? `받은 스파링 요청 ${inboxCount}개` : '메시지'}">${icons.message}${inboxCount ? '<span class="notification-dot"></span>' : ''}</button>
          <button class="icon-button" data-page="profile" aria-label="내 프로필">${miniAvatar(myProfile())}</button>
        </div>
      </header>
      <div class="content-wrap">
        <aside class="sidebar" aria-label="보조 메뉴">
          <p class="sidebar-label">둘러보기</p>
          ${navButton('home', 'home', '오늘의 홈')}
          ${navButton('find', 'compass', '파트너 찾기')}
          ${navButton('community', 'users', '커뮤니티')}
          ${navButton('gyms', 'map', '체육관 지도')}
          ${navButton('events', 'calendar', '이벤트')}
          ${navButton('shop', 'bag', '장비샵')}
          <p class="sidebar-label">내 활동</p>
          ${navButton('messages', 'message', '메시지', inboxCount ? `<span class="side-count">${inboxCount}</span>` : '')}
          ${navButton('profile', 'user', '내 프로필')}
          <div class="side-safety">
            <strong>${icons.shield} 안전한 스파링</strong>
            <p>상호 동의한 룰과 강도, 공개된 체육관에서의 만남을 우선해요.</p>
          </div>
        </aside>
        <main id="main-content" tabindex="-1">${content}</main>
      </div>
      <nav class="bottom-nav" aria-label="모바일 메뉴">
        ${bottomLink('home', 'home', '홈')}
        ${bottomLink('find', 'compass', '찾기')}
        ${bottomLink('messages', 'message', inboxCount ? `메시지 ${inboxCount}` : '메시지')}
        ${bottomLink('community', 'users', '커뮤니티')}
        ${bottomLink('profile', 'user', '내 정보')}
      </nav>
    </div>`;
}

function renderPageHead(eyebrow, title, description, action = '') {
  return `<section class="page-head">
    <div><p class="eyebrow">${icons.spark} ${eyebrow}</p><h1>${title}</h1><p>${description}</p></div>
    ${action}
  </section>`;
}

function userCard(user, reason = '') {
  const sent = state.sentRequests.has(user.id);
  const saved = state.savedUsers.has(user.id);
  const [a, b] = user.colors || ['#6e2836', '#ee5966'];
  const common = commonGround(user);
  return `<article class="profile-card">
    <button class="card-poster" data-action="profile" data-id="${user.id}" style="--avatar-a:${a}; --avatar-b:${b}" aria-label="${user.name} 프로필 자세히 보기">
      <span class="poster-initial" aria-hidden="true">${user.initial}</span>
      <span class="distance-pill">${icons.pin} ${distanceLabel(user)}</span>
      ${user.online ? '<span class="online-pill"><i></i> 활동 중</span>' : ''}
      <span class="poster-name"><b>${user.name}</b>${user.verified ? verified() : ''}<small>${user.sport} · ${user.level} · ${user.weight}</small></span>
    </button>
    <div class="card-body">
      ${reason ? `<p class="pick-reason">${icons.spark} ${reason}</p>` : ''}
      ${common.length ? `<div class="common-list" aria-label="나와 겹치는 조건">${common.map((item) => `<span class="common-chip">${icons.check} ${item}</span>`).join('')}</div>` : ''}
      <div class="prompt-block"><span>내가 선호하는 스파링</span><p>${user.note}</p></div>
      <div class="tag-list"><span class="rule-tag">${user.intensity}</span><span class="tag">${user.availability}</span></div>
    </div>
    <div class="card-actions">
      <button class="icon-button" data-action="pass-user" data-id="${user.id}" aria-label="${user.name} 넘기기" title="넘기기">${icons.x}</button>
      <button class="icon-button ${saved ? 'is-saved' : ''}" data-action="save-user" data-id="${user.id}" aria-pressed="${saved}" aria-label="${user.name} 저장" title="저장">${icons.heart}</button>
      <button class="primary-button small-button" data-action="request" data-id="${user.id}" ${sent ? 'disabled' : ''}>${sent ? `${icons.check} 제안 보냄` : `${icons.plus} 스파링 제안`}</button>
    </div>
  </article>`;
}

function compactPartner(user) {
  return `<article class="partner-row">
    ${avatar(user)}
    <button data-action="profile" data-id="${user.id}" style="border:0;background:transparent;color:inherit;padding:0;text-align:left;min-width:0">
      <h3>${user.name} ${user.verified ? verified() : ''}</h3>
      <p>${user.sport} · ${user.level} · ${user.location}</p>
      <div class="partner-tags"><span class="rule-tag">${user.intensity} 스파링</span><span class="tag">${user.weight}</span><span class="tag">${user.availability}</span></div>
    </button>
    <button class="secondary-button small-button" data-action="request" data-id="${user.id}" ${state.sentRequests.has(user.id) ? 'disabled' : ''}>${state.sentRequests.has(user.id) ? '보냄' : '제안'}</button>
  </article>`;
}

function todaysPicks() {
  // ponytail: 겹치는 조건 개수로만 정렬하는 단순 추천. 실제 추천 모델이 생기면 교체.
  return allUsers()
    .filter((user) => user.id !== currentUserId() && !state.passedUsers.has(user.id))
    .map((user) => ({ user, common: commonGround(user) }))
    .sort((left, right) => right.common.length - left.common.length || left.user.distance - right.user.distance)
    .slice(0, 3);
}

function renderHome() {
  const me = myProfile();
  const inboxCount = pendingReceivedRequests().length;
  return `<section class="hero" aria-label="SparringMatch 소개">
      <div class="hero-content">
        <span class="hero-kicker"><span class="pulse"></span> BETA · 서울 전역</span>
        <h1>같은 룰, <em>맞는 강도.</em><br>오늘의 스파링 파트너</h1>
        <span class="neon-sub" aria-hidden="true">SEOUL SPARRING CLUB</span>
        <p>체급·종목·경험·가능 시간을 확인한 뒤, 상호 동의로 안전한 운동 약속을 만들어 보세요.</p>
        <div class="hero-actions"><button class="primary-button" data-page="find">${icons.compass} 파트너 둘러보기</button>${inboxCount ? `<button class="secondary-button" data-page="messages">${icons.bell} 받은 제안 ${inboxCount}건 확인</button>` : `<button class="secondary-button" data-page="profile">${icons.edit} 내 조건 설정</button>`}</div>
      </div>
    </section>
    <nav class="quick-links" aria-label="바로가기"><button data-page="gyms">${icons.map}<span>체육관 지도</span></button><button data-page="events">${icons.calendar}<span>이벤트</span></button><button data-page="shop">${icons.bag}<span>장비샵</span></button><button data-action="safety">${icons.shield}<span>안전 가이드</span></button></nav>
    <section class="section-head"><div><h2>오늘의 추천 3명</h2><p>${me.sport} · ${me.intensity} 기준으로 조건이 많이 겹치는 순서예요. 추천 순서는 결제로 바뀌지 않습니다.</p></div><button class="text-button" data-page="find">전체 보기 ${icons.arrow}</button></section>
    <section class="discovery-grid">${todaysPicks().map(({ user, common }) => userCard(user, common.length ? `조건 ${common.length}개가 겹쳐요` : '가까운 거리의 새 파트너')).join('')}</section>
    <aside class="safety-card" style="margin-top:17px"><h3>${icons.shield} 먼저, 서로의 룰을 맞춰요</h3><p>스파링 제안에는 종목, 강도, 시간, 장소 유형을 함께 적습니다. 불편한 요청은 언제든 거절·차단·신고할 수 있어요.</p><button class="ghost-button small-button" data-action="safety">안전 가이드 보기 ${icons.arrow}</button></aside>
    <section class="section-head"><div><h2>이번 주 내 주변</h2><p>공식 체육관과 검토된 이벤트만 표시됩니다.</p></div><button class="text-button" data-page="events">이벤트 전체 ${icons.arrow}</button></section>
    <section class="grid-2">
      <div class="surface-card padded"><h3 class="section-mini-title">${icons.calendar} 놓치면 아쉬운 일정</h3><div class="compact-list">${events.slice(0, 3).map((event) => `<button class="compact-row" data-action="event" data-id="${event.id}" style="border-right:0;border-left:0;border-bottom:0;background:transparent;color:inherit;text-align:left"><span class="date-badge">${event.month}<b>${event.day}</b></span><span><b>${event.title}</b><span>${event.place} · ${event.category}</span></span><span style="margin-left:auto;color:var(--muted)">${icons.arrow}</span></button>`).join('')}</div></div>
      <div class="surface-card padded"><h3 class="section-mini-title">${icons.users} 커뮤니티 인기글</h3><div class="compact-list">${posts.slice(0, 3).map((post) => `<button class="compact-row" data-action="post" data-id="${post.id}" style="border-right:0;border-left:0;border-bottom:0;background:transparent;color:inherit;text-align:left">${miniAvatar({ initial: post.initial, colors: post.colors })}<span><b>${post.title}</b><span>${post.board} · 댓글 ${post.comments}</span></span></button>`).join('')}</div></div>
    </section>
    <section class="shop-preview"><div><p class="eyebrow">${icons.bag} FIGHT GEAR MARKET</p><h2>새제품부터 믿을 수 있는<br>중고 장비 정보까지.</h2><p>글러브, 보호장비, 도복·의류를 비교하고, 중고 거래 수칙도 함께 확인하세요.</p></div><button class="primary-button" data-page="shop">장비샵 둘러보기 ${icons.arrow}</button></section>`;
}

function filteredUsers() {
  const query = state.search.trim().toLowerCase();
  return allUsers().filter((user) => {
    if (user.id === currentUserId() || state.passedUsers.has(user.id)) return false;
    const hasSport = state.sport === '전체' || user.sport === state.sport;
    const hasIntensity = state.intensity === '전체' || user.intensity === state.intensity;
    const hasRadius = user.distance <= state.radius;
    const haystack = `${user.name} ${user.sport} ${user.gym} ${user.location}`.toLowerCase();
    return hasSport && hasIntensity && hasRadius && (!query || haystack.includes(query));
  });
}

function renderFindResults(users = filteredUsers()) {
  const count = `<div class="find-summary"><p><strong>${users.length}명</strong>의 파트너가 현재 조건에 맞아요.</p>${state.passedUsers.size ? `<button class="text-button" data-action="restore-passed">넘긴 ${state.passedUsers.size}명 다시 보기</button>` : '<span class="sort">등록순</span>'}</div>`;
  const cards = users.length
    ? `<section class="discovery-grid">${users.map((user) => userCard(user)).join('')}</section>`
    : `<section class="empty-state"><div>${icons.search}<h3>조건에 맞는 파트너가 아직 없어요</h3><p>거리 또는 종목 조건을 조금 넓혀 보세요.</p><button class="secondary-button small-button" data-action="reset-filters">필터 초기화</button></div></section>`;
  return `${count}${cards}`;
}

function refreshFindResults() {
  const region = document.querySelector('#find-results');
  if (region) region.innerHTML = renderFindResults();
}

let isSearchComposing = false;
let searchRefreshTimer = null;

function queueFindResultsRefresh() {
  window.clearTimeout(searchRefreshTimer);
  searchRefreshTimer = window.setTimeout(() => {
    if (!isSearchComposing) refreshFindResults();
  }, 120);
}

function renderFind() {
  return `${renderPageHead('SPARRING MATCH', '스파링 파트너 찾기', '종목, 강도, 거리와 수련 경험을 기준으로 서로에게 맞는 파트너를 살펴보세요.', '<button class="secondary-button" data-action="filters">'+icons.sliders+' 상세 조건</button>')}
    <section class="filter-panel" aria-label="파트너 필터">
      <label class="search-box">${icons.search}<input id="search-input" value="${escapeHtml(state.search)}" autocomplete="off" placeholder="이름, 종목, 체육관으로 검색" aria-label="파트너 검색" /></label>
      <select class="select-control" id="sport-select" aria-label="종목 필터"><option value="전체">전체 종목</option><option value="복싱">복싱</option><option value="주짓수">주짓수</option><option value="킥복싱">킥복싱</option><option value="무에타이">무에타이</option><option value="MMA">MMA</option></select>
      <select class="select-control" id="intensity-select" aria-label="강도 필터"><option value="전체">전체 강도</option><option value="드릴">드릴</option><option value="라이트">라이트</option><option value="보통">보통</option></select>
      <label class="range-control"><span>${state.radius}km 이내</span><input id="radius-range" type="range" min="3" max="30" value="${state.radius}" aria-label="거리 범위" /></label>
    </section>
    <div id="find-results" aria-live="polite">${renderFindResults()}</div>
    <section class="notice-card" style="margin-top:18px"><h3>${icons.lock} 위치와 연락처는 보호됩니다</h3><p>정확한 집·직장 주소와 전화번호는 추천 목록에 표시되지 않아요. 상호 동의 뒤에도 공개 체육관에서의 만남을 먼저 권장합니다.</p></section>`;
}

function renderCommunity() {
  const topics = [
    ['복싱', '오늘 새 글 26개', 'spark'], ['주짓수', '오픈매트 8개', 'users'], ['대회·세미나', '이번 주 17개', 'calendar'], ['장비 이야기', '후기 54개', 'bag'],
  ];
  return `${renderPageHead('FIGHT COMMUNITY', '운동 이야기를 나누는 곳', '종목별 팁, 체육관 후기, 대회와 세미나 정보를 건전한 가이드라인 안에서 나눠요.', '<button class="primary-button" data-action="write-post">'+icons.plus+' 글쓰기</button>')}
    <section class="community-layout">
      <div><div class="write-box">${miniAvatar({ initial: '나', colors: ['#6e2836', '#ee5966'] })}<p>훈련 팁, 오픈매트, 장비 이야기를 공유해 보세요.</p><button class="secondary-button small-button" data-action="write-post">글쓰기</button></div><div class="post-list">${posts.map((post) => `<article class="post-card"><div class="post-author">${miniAvatar({ initial: post.initial, colors: post.colors })}<div><strong>${post.author}</strong><div class="post-meta"><span class="board-badge">${post.board}</span><span>${post.time}</span></div></div><button class="icon-button" data-action="report" aria-label="게시글 신고" style="margin-left:auto">${icons.more}</button></div><button data-action="post" data-id="${post.id}" style="border:0;background:transparent;color:inherit;padding:0;text-align:left;width:100%"><h3>${post.title}</h3><p class="post-body">${post.body}</p></button><div class="post-footer"><span>${icons.heart} ${post.likes}</span><span>${icons.message} 댓글 ${post.comments}</span><span style="margin-left:auto">${icons.clock} ${post.time}</span></div></article>`).join('')}</div></div>
      <aside><div class="surface-card padded"><h3 class="section-mini-title">${icons.compass} 지금 활발한 주제</h3><div class="topic-list" style="margin-top:13px">${topics.map(([title, detail, icon]) => `<button class="topic-row" data-action="topic"><span class="topic-icon">${icons[icon]}</span><span style="text-align:left"><b>${title}</b><span>${detail}</span></span><span style="margin-left:auto;color:var(--dim)">${icons.arrow}</span></button>`).join('')}</div></div><div class="side-safety" style="margin-top:14px"><strong>${icons.shield} 커뮤니티 약속</strong><p>개인 연락처·계좌 정보·동의 없는 촬영물은 올리지 마세요. 불편한 글은 바로 신고할 수 있습니다.</p></div></aside>
    </section>`;
}

function renderGyms() {
  const selected = gyms.find((gym) => gym.id === state.selectedGymId) || gyms[0];
  return `${renderPageHead('GYM DIRECTORY', '내 주변 체육관', '검토된 체육관의 종목, 오픈매트와 시설 정보를 살펴보고 파트너와 공개 장소에서 만나세요.', '<button class="secondary-button" data-action="gym-suggest">'+icons.plus+' 체육관 제보</button>')}
    <section class="gym-layout"><div class="map-panel" aria-label="서울 전역 체육관 지도 모형"><span class="map-legend">${icons.pin} 서울 전역 · 실제 지도 연동 전 mock 화면</span>${gyms.map((gym) => `<button class="map-pin ${selected.id === gym.id ? 'active' : ''}" data-action="select-gym" data-id="${gym.id}" style="left:${gym.pos[0]}%;top:${gym.pos[1]}%" aria-label="${gym.name} 선택">${gym.symbol}</button>`).join('')}</div>
      <aside class="surface-card padded"><h3 class="section-mini-title">${icons.map} 주변 추천 ${gyms.length}곳</h3><div class="gym-list" style="margin-top:13px">${gyms.map((gym) => `<button class="gym-row ${selected.id === gym.id ? 'active' : ''}" data-action="select-gym" data-id="${gym.id}"><span class="gym-symbol">${gym.symbol}</span><span><h3>${gym.name} ${gym.verified ? verified() : ''}</h3><p>${gym.sports} · ${gym.distance}</p></span><span class="rating">★ ${gym.rating}</span></button>`).join('')}</div></aside></section>
    <section class="surface-card padded" style="margin-top:17px"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px"><div><p class="eyebrow" style="margin-bottom:5px">${icons.shield} ${selected.verified ? '운영자 인증 체육관' : '정보 검토 중'}</p><h2 style="margin:0;font-size:21px">${selected.name}</h2><p style="margin:8px 0 0;color:var(--muted);font-size:13px">${selected.sports} · ${selected.distance} · 리뷰 ${selected.reviews}개</p></div><button class="primary-button small-button" data-action="gym-detail" data-id="${selected.id}">상세 보기</button></div><div class="detail-grid"><div class="detail-item"><span>오늘 운영</span><b>${selected.open}</b></div><div class="detail-item"><span>이용자 평점</span><b>★ ${selected.rating} / 5.0</b></div><div class="detail-item"><span>오픈매트</span><b>토 14:00 · 예약 권장</b></div><div class="detail-item"><span>파트너 약속</span><b>공개 장소 우선</b></div></div></section>`;
}

function renderEvents() {
  const filters = ['전체 일정', ...new Set(events.map((event) => event.category))];
  const visible = events.filter((event) => state.eventFilter === '전체 일정' || event.category === state.eventFilter);
  return `${renderPageHead('EVENT BOARD', '대회, 세미나, 오픈매트', '개인이 올린 행사는 검토 후 공개됩니다. 신청 전 참가 조건과 장소를 꼭 확인하세요.', '<button class="primary-button" data-action="create-event">'+icons.plus+' 이벤트 등록</button>')}
    <section class="filter-bar" style="margin-bottom:17px">${filters.map((filter) => `<button class="filter-chip ${state.eventFilter === filter ? 'active' : ''}" data-action="event-filter" data-value="${filter}" aria-pressed="${state.eventFilter === filter}">${filter}</button>`).join('')}</section>
    <section class="event-grid">${visible.map((event) => `<article class="event-card"><div><span class="event-date">${event.month}<b>${event.day}</b></span><div class="tag-list"><span class="rule-tag">${event.category}</span></div><h3>${event.title}</h3><p>${event.place}</p></div><div class="event-card-footer"><span>${event.people}</span><button class="secondary-button small-button" data-action="event" data-id="${event.id}">자세히</button></div></article>`).join('')}</section>
    <section class="notice-card" style="margin-top:17px"><h3>${icons.shield} 이벤트 안전 안내</h3><p>상대의 동의 없는 촬영, 사적 장소 유도, 금전 요구는 금지됩니다. 행사 정보가 사실과 다르거나 불편한 요청을 받으면 신고해 주세요.</p></section>`;
}

function requestInboxSection() {
  const receivedRequests = pendingReceivedRequests();
  if (!receivedRequests.length) return '';
  return `<section class="surface-card padded" style="margin-bottom:17px"><h3 class="section-mini-title">${icons.bell} 받은 스파링 요청 ${receivedRequests.length}건</h3><div class="request-inbox-list">${receivedRequests.map((request) => {
    const sender = findUser(request.fromUserId) || { name: '알 수 없는 사용자', initial: '?', colors: ['#343434', '#555555'] };
    return `<div class="request-inbox-row">${miniAvatar(sender)}<div class="request-inbox-copy"><b>${sender.name}</b><span>${escapeHtml(request.purpose)} · ${escapeHtml(request.intensity)} · ${escapeHtml(request.preferredTime)} · ${escapeHtml(request.venueType)}</span><p>“${escapeHtml(request.message)}”</p></div><div class="request-inbox-actions"><button class="secondary-button small-button" data-action="decline-request" data-id="${request.id}" aria-label="${sender.name}의 제안 거절">거절</button><button class="primary-button small-button" data-action="accept-request" data-id="${request.id}" aria-label="${sender.name}의 제안 수락">${icons.check} 수락</button></div></div>`;
  }).join('')}</div><p class="request-inbox-note">${icons.shield} 수락하면 매칭된 대화방이 열립니다. 거절 사유는 상대에게 전달되지 않아요.</p></section>`;
}

function renderMessages() {
  const inboxSection = requestInboxSection();
  const current = conversations.find((conversation) => conversation.id === state.activeConversationId) || conversations[0];
  if (!current) {
    return `${renderPageHead('MATCHED CHAT', '매칭된 대화', '상대가 스파링 제안을 수락하면 안전한 대화방이 열립니다.')}
      ${inboxSection}
      <section class="empty-state"><div>${icons.message}<h3>아직 매칭된 대화가 없어요</h3><p>파트너에게 스파링 제안을 보내고, 상호 수락 후 대화를 시작해 보세요.</p><button class="primary-button small-button" data-page="find">파트너 찾기</button></div></section>`;
  }
  const user = findUser(current.userId);
  const pendingRequests = state.serverRequests.filter((request) => request.fromUserId === currentUserId() && request.status === 'pending');
  return `${renderPageHead('MATCHED CHAT', '매칭된 대화', '매칭된 사용자와만 대화할 수 있어요. 상대가 불편하면 언제든 차단하거나 신고할 수 있습니다.')}
    ${state.serverConnected === true ? '<p class="eyebrow" style="margin:-10px 0 13px;color:var(--green)">서버 저장소 연결됨 · 메시지와 스파링 요청이 로컬 서버에 저장됩니다.</p>' : ''}
    ${inboxSection}
    ${pendingRequests.length ? `<section class="notice-card" style="margin-bottom:17px"><h3>${icons.clock} 보낸 스파링 요청 ${pendingRequests.length}건</h3><p>${pendingRequests.map((request) => `${findUser(request.toUserId)?.name || '파트너'} · ${escapeHtml(request.purpose)} · ${escapeHtml(request.preferredTime)}`).join(' / ')}</p></section>` : ''}
    <section class="message-layout"><aside class="conversation-list" aria-label="대화 목록">${conversations.map((conversation) => { const partner = findUser(conversation.userId) || { name: '알 수 없는 파트너', initial: '?', colors: ['#343434', '#555555'] }; return `<button class="conversation-row ${conversation.id === current.id ? 'active' : ''}" data-action="conversation" data-id="${conversation.id}">${miniAvatar(partner)}<span class="conversation-title"><strong>${partner.name}</strong><span>${escapeHtml(conversation.preview)}</span></span><span class="conversation-time">${conversation.messages.at(-1)?.who === 'them' ? '<span class="turn-badge">내 차례</span>' : conversation.time}</span></button>`; }).join('')}</aside>
      <div class="chat-pane"><header class="chat-head"><div class="chat-head-user">${miniAvatar(user)}<span><b>${user.name} ${user.verified ? verified() : ''}</b><span>${user.sport} · ${user.intensity} 스파링</span></span></div><div class="chat-tools"><button class="safety-tool" data-action="safety">${icons.shield}<span>안전 가이드</span></button><button class="icon-button" data-action="report" aria-label="대화 신고 또는 차단">${icons.flag}</button></div></header><div class="chat-messages" id="chat-messages"><p class="safety-message">${icons.shield} 서로 합의한 룰·강도·공개 장소를 확인하세요. 연락처·정확한 주소 공유는 신중하게 결정해요.</p>${current.messages.map((message) => `<div class="bubble ${message.who === 'me' ? 'me' : ''}">${escapeHtml(message.body)}<small>${message.time}</small></div>`).join('')}</div><form class="chat-form" id="chat-form"><input id="chat-input" maxlength="300" autocomplete="off" placeholder="안전한 운동 약속을 위한 메시지를 입력하세요" aria-label="메시지 입력"/><button class="primary-button small-button" type="submit">보내기</button></form></div>
    </section>`;
}

function renderProfile() {
  const me = myProfile();
  return `${renderPageHead('MY PROFILE', '내 운동 프로필', '보이는 정보와 매칭 조건을 직접 설정하세요. 정확한 위치와 연락처는 기본으로 공개되지 않습니다.', '<button class="primary-button" data-action="edit-profile">'+icons.edit+' 프로필 수정</button>')}
    <section class="profile-page"><div class="surface-card padded profile-hero"><div class="profile-hero-inner">${avatar(me, 'large')}<div><h2>${me.name} ${me.verified ? verified() : ''}</h2><p>${me.sport} · ${me.level} · ${me.location}</p><div class="tag-list"><span class="rule-tag">${me.intensity} 스파링</span><span class="tag">${me.availability}</span><span class="tag">${me.weight}</span></div></div></div><div class="progress-wrap"><div class="progress-label"><span>프로필 완성도</span><b>82%</b></div><div class="progress-bar"><span></span></div></div><div class="detail-grid"><div class="detail-item"><span>선호 종목</span><b>${me.sport}</b></div><div class="detail-item"><span>운동 연차</span><b>${me.level}</b></div><div class="detail-item"><span>희망 거리</span><b>10km 이내</b></div><div class="detail-item"><span>공개 지역</span><b>${me.location}</b></div></div></div>
      <aside><div class="surface-card padded"><h3 class="section-mini-title">${icons.shield} 안전 설정</h3><ul class="check-list">${me.verified ? `<li>${icons.check}<span>휴대폰 인증을 완료했어요</span></li>` : ''}<li>${icons.check}<span>정확한 위치는 공개하지 않아요</span></li><li>${icons.check}<span>매칭된 상대와만 메시지를 주고받아요</span></li><li>${icons.check}<span>차단·신고 기록은 상대에게 보이지 않아요</span></li></ul><button class="secondary-button small-button" data-action="safety" style="margin-top:15px">안전 설정 열기</button></div><div class="notice-card" style="margin-top:14px"><h3>${icons.lock} 공개 범위 미리보기</h3><p>다른 사용자에게는 닉네임, 운동 조건, 대략적인 거리만 보입니다. 연락처, 이메일, 정확한 주소는 공개되지 않습니다.</p></div><button class="ghost-button small-button" data-action="logout" style="margin-top:14px;width:100%">로그아웃</button></aside></section>`;
}

function filteredProducts() {
  return products.filter((product) => (state.shopType === '전체' || product.type === state.shopType) && (state.shopCategory === '전체' || product.category === state.shopCategory));
}

function formatPrice(price) {
  return `${price.toLocaleString('ko-KR')}원`;
}

function productCard(product) {
  const inCart = state.cart.has(product.id);
  return `<article class="product-card"><button class="product-visual ${product.accent}" data-action="product" data-id="${product.id}" aria-label="${product.name} 상세 보기"><span class="product-badge">${product.badge || product.type}</span><b>${product.mark}</b><span>${product.category}</span></button><div class="product-copy"><p class="product-brand">${product.brand}</p><h3>${product.name}</h3><p class="product-meta">${product.type === '중고' ? `${product.seller} · ${product.location}` : '공식 판매 mock 상품 · 무료배송 조건 확인'}</p><div class="product-price-row"><strong>${formatPrice(product.price)}</strong><span class="condition-pill ${product.type === '중고' ? 'used' : ''}">${product.type}</span></div><div class="product-actions"><button class="secondary-button small-button" data-action="save-product" data-id="${product.id}" aria-label="${product.name} 찜하기">${icons.heart}</button><button class="${product.type === '중고' ? 'primary-button' : 'secondary-button'} small-button" data-action="${product.type === '중고' ? 'used-inquiry' : 'cart'}" data-id="${product.id}" ${inCart ? 'disabled' : ''}>${inCart ? `${icons.check} 담김` : product.type === '중고' ? `${icons.message} 문의하기` : `${icons.bag} 장바구니`}</button></div></div></article>`;
}

function renderShop() {
  const visibleProducts = filteredProducts();
  const typeTabs = ['전체', '새제품', '중고'];
  const categoryTabs = ['전체', '글러브', '보호장비', '도복·의류'];
  return `${renderPageHead('FIGHT GEAR MARKET', '운동 장비샵', '새제품은 공식 판매 mock 카탈로그로, 중고는 판매자 정보와 거래 주의사항을 확인하는 베타 화면입니다.', `<button class="secondary-button" data-action="cart-view">${icons.bag} 장바구니 <span class="cart-count">${state.cart.size}</span></button>`)}
    <section class="shop-hero"><div><p class="eyebrow">${icons.shield} 새제품 · 중고 거래는 구분해서</p><h2>내 운동에 맞는 장비를<br><span>안전하게 비교해요.</span></h2><p>중고 거래에서는 개인 연락처·선입금을 요구하지 말고, 상품 상태와 거래 방법을 직접 확인하세요.</p></div><div class="shop-hero-art"><span>GEAR</span><b>FC</b></div></section>
    <section class="shop-controls" aria-label="상품 필터"><div class="segment-control">${typeTabs.map((tab) => `<button class="${state.shopType === tab ? 'active' : ''}" data-action="shop-type" data-value="${tab}">${tab}</button>`).join('')}</div><div class="filter-bar">${categoryTabs.map((tab) => `<button class="filter-chip ${state.shopCategory === tab ? 'active' : ''}" data-action="shop-category" data-value="${tab}">${tab}</button>`).join('')}</div></section>
    <div class="find-summary"><p><strong>${visibleProducts.length}개</strong>의 ${state.shopType === '전체' ? '장비' : state.shopType} 상품을 보고 있어요.</p><span class="sort">가격 낮은 순 · mock 데이터</span></div>
    <section class="product-grid">${visibleProducts.map(productCard).join('')}</section>
    <section class="trade-safety-grid"><div class="notice-card"><h3>${icons.shield} 중고 거래 안전 수칙</h3><p>실물 사진, 상태, 구성품, 사이즈, 거래 방식을 확인하세요. 개인 계좌 선입금·외부 링크·정확한 집 주소 요구가 불편하면 거래를 중단하고 신고하세요.</p></div><div class="surface-card padded"><h3 class="section-mini-title">${icons.bag} 새제품 구매 안내</h3><p style="margin:9px 0 0;color:var(--muted);font-size:12px;line-height:1.65">정식 서비스에서는 검증된 PG와 판매자 정보, 배송·반품·환불 정책을 연결합니다. 이 베타는 결제를 처리하지 않습니다.</p></div></section>`;
}

function renderAuth() {
  const isLogin = state.authMode === 'login';
  const error = '<p class="form-error" id="auth-error" role="alert" hidden></p>';
  const form = isLogin
    ? `<form class="auth-form" id="login-form"><label class="field"><span>이메일</span><input id="login-email" type="email" autocomplete="email" placeholder="demo@sparringmatch.beta" required /></label><label class="field"><span>비밀번호</span><input id="login-password" type="password" autocomplete="current-password" placeholder="8자 이상 입력" required /></label>${error}<button class="primary-button auth-submit" type="submit">로그인하고 둘러보기 ${icons.arrow}</button><button class="ghost-button auth-demo" type="button" data-action="demo-login">데모 계정으로 체험하기</button><p class="auth-switch">계정이 없나요? <button type="button" data-action="switch-auth" data-value="signup">회원가입</button></p></form>`
    : `<form class="auth-form" id="signup-form" novalidate>
      <div class="step-progress" role="progressbar" aria-valuemin="1" aria-valuemax="3" aria-valuenow="1" aria-label="가입 단계"><span></span></div>
      <p class="step-label" id="step-label">1 / 3 · 계정과 연령 확인</p>
      <fieldset class="signup-step" data-step="1"><div class="form-grid"><label class="field full"><span>이메일</span><input id="signup-email" type="email" autocomplete="email" placeholder="name@example.com" required /></label><label class="field"><span>비밀번호</span><input id="signup-password" type="password" minlength="8" autocomplete="new-password" placeholder="8자 이상" required /></label><label class="field"><span>비밀번호 확인</span><input id="signup-password-confirm" type="password" minlength="8" autocomplete="new-password" placeholder="한 번 더 입력" required /></label><label class="field full"><span>생년월일 <small>· 공개되지 않아요</small></span><input id="signup-birth" type="date" autocomplete="bday" required /></label></div></fieldset>
      <fieldset class="signup-step" data-step="2" hidden><div class="form-grid"><label class="field"><span>주 종목</span><select id="signup-sport"><option>복싱</option><option>주짓수</option><option>킥복싱</option><option>무에타이</option><option>MMA</option></select></label><label class="field"><span>운동 연차</span><select id="signup-level"><option>1년 미만</option><option>1~2년</option><option>3~5년</option><option>5년+</option></select></label><label class="field"><span>희망 강도</span><select id="signup-intensity"><option>드릴</option><option>라이트</option><option>보통</option></select></label><label class="field"><span>가능 시간</span><select id="signup-availability"><option>일정 조율</option><option>평일 저녁</option><option>주말 오전</option><option>주말 오후</option></select></label><label class="field"><span>체급</span><select id="signup-weight"><option>체급 미설정</option><option>-57kg</option><option>-61kg</option><option>-67kg</option><option>-71kg</option><option>-75kg</option><option>-84kg</option><option>+84kg</option></select></label><label class="field"><span>키</span><select id="signup-height"><option>키 미설정</option><option>160~164cm</option><option>165~169cm</option><option>170~174cm</option><option>175~179cm</option><option>180~184cm</option><option>185cm 이상</option></select></label></div></fieldset>
      <fieldset class="signup-step" data-step="3" hidden><div class="form-grid"><label class="field"><span>닉네임</span><input id="signup-name" minlength="2" maxlength="16" autocomplete="nickname" placeholder="예: 성수복서" required /></label><label class="field"><span>소속 체육관</span><input id="signup-gym" maxlength="50" placeholder="선택 입력" /></label><label class="field full"><span>공개 지역</span><input id="signup-location" maxlength="30" autocomplete="address-level2" placeholder="예: 성수 · 대략적인 지역만" required /></label><label class="field full"><span>내가 선호하는 스파링</span><textarea id="signup-note" maxlength="160" placeholder="선호하는 룰과 안전한 스파링 조건을 적어 주세요."></textarea></label></div>
        <div class="house-rules"><strong>${icons.shield} SparringMatch 하우스 룰</strong><ul><li>룰·강도·보호장비는 운동 전에 다시 합의해요.</li><li>첫 만남은 인증 체육관이나 공개 오픈매트에서.</li><li>동의 없는 촬영·게시, 연락처·금전 요구는 하지 않아요.</li></ul></div>
        <label class="consent-row"><input id="signup-terms" type="checkbox" required /><span>만 15세 이상이며, 하우스 룰과 청소년 안전 모드, 이용약관·개인정보 처리 안내를 확인했습니다.</span></label></fieldset>
      ${error}
      <div class="step-actions"><button class="ghost-button" type="button" data-action="signup-prev" id="signup-prev" hidden>이전</button><button class="primary-button auth-submit" type="button" data-action="signup-next" id="signup-next">다음 ${icons.arrow}</button><button class="primary-button auth-submit" type="submit" id="signup-submit" hidden>안전한 계정 만들기 ${icons.arrow}</button></div>
      <p class="auth-switch">이미 계정이 있나요? <button type="button" data-action="switch-auth" data-value="login">로그인</button></p></form>`;
  app.innerHTML = `<main class="auth-screen"><section class="auth-hero"><button class="brand" data-action="auth-home" aria-label="SparringMatch 소개"><span class="fc-mark"><span>FC</span></span><span>SparringMatch</span></button><div class="auth-hero-copy"><p class="eyebrow">${icons.shield} SPARRING COMMUNITY BETA</p><h1>같은 룰, 맞는 강도.<br><span>안전한 연결부터.</span></h1><span class="neon-sub" aria-hidden="true">SEOUL SPARRING CLUB</span><p>SparringMatch은 격투 스포츠인을 위한 스파링 파트너·커뮤니티 베타입니다. 회원가입 후 서울 전역의 파트너, 체육관, 이벤트와 장비샵을 둘러볼 수 있어요.</p><div class="auth-points"><span>${icons.check} 상호 동의 매칭</span><span>${icons.check} 위치·연락처 기본 보호</span><span>${icons.check} 만 15세 이상 안전 모드</span></div></div><p class="auth-footnote">계정 인증은 mock 베타입니다. 실제 이메일·비밀번호를 입력하지 마세요. 매칭 요청과 채팅은 로컬 서버에 저장됩니다.</p></section><section class="auth-panel"><div class="auth-card"><div class="auth-tabs"><button class="${isLogin ? 'active' : ''}" data-action="switch-auth" data-value="login">로그인</button><button class="${!isLogin ? 'active' : ''}" data-action="switch-auth" data-value="signup">회원가입</button></div><div class="auth-card-copy"><h2>${isLogin ? '다시 만나서 반가워요.' : 'SparringMatch 베타에 참여해요.'}</h2><p>${isLogin ? '운동 조건과 안전 설정을 이어서 확인하세요.' : '가입 정보는 mock 브라우저 저장소에만 사용됩니다.'}</p></div>${form}${isLogin ? '<p class="demo-hint">데모 계정: <b>demo@sparringmatch.beta</b> / <b>sparringmatch2026</b></p>' : ''}</div></section></main>`;
}

function render() {
  if (!state.account) {
    renderAuth();
    return;
  }
  const pageRenderers = { home: renderHome, find: renderFind, community: renderCommunity, gyms: renderGyms, events: renderEvents, shop: renderShop, messages: renderMessages, profile: renderProfile };
  renderShell(pageRenderers[state.page]());
  const sport = document.querySelector('#sport-select');
  const intensity = document.querySelector('#intensity-select');
  if (sport) sport.value = state.sport;
  if (intensity) intensity.value = state.intensity;
}

let toastTimer = null;

function showToast(message) {
  toastRoot.innerHTML = `<div class="toast">${icons.check}<span>${message}</span></div>`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toastRoot.innerHTML = ''; }, 3300);
}

function showAuthError(message) {
  const region = document.querySelector('#auth-error');
  if (!region) return;
  region.textContent = message;
  region.hidden = !message;
}

const SIGNUP_STEP_LABELS = ['계정과 연령 확인', '운동 조건', '공개 프로필과 하우스 룰'];

function currentSignupStep() {
  return Number(document.querySelector('.signup-step:not([hidden])')?.dataset.step || 1);
}

function goSignupStep(step) {
  document.querySelectorAll('.signup-step').forEach((fieldset) => { fieldset.hidden = Number(fieldset.dataset.step) !== step; });
  document.querySelector('#signup-prev').hidden = step === 1;
  document.querySelector('#signup-next').hidden = step === 3;
  document.querySelector('#signup-submit').hidden = step !== 3;
  document.querySelector('#step-label').textContent = `${step} / 3 · ${SIGNUP_STEP_LABELS[step - 1]}`;
  const bar = document.querySelector('.step-progress');
  bar.setAttribute('aria-valuenow', step);
  bar.style.setProperty('--step', step);
  showAuthError('');
  document.querySelector(`.signup-step[data-step="${step}"]`).querySelector('input, select, textarea')?.focus();
}

// 단계별 검증. 통과하면 '' 을, 아니면 보여줄 문구를 돌려준다.
function signupStepError(step) {
  const fieldset = document.querySelector(`.signup-step[data-step="${step}"]`);
  if (step === 1) {
    const password = fieldset.querySelector('#signup-password').value;
    const birthDate = fieldset.querySelector('#signup-birth').value;
    if (!fieldset.querySelector('#signup-email').checkValidity()) return '이메일 주소를 다시 확인해 주세요.';
    if (password.length < 8) return '비밀번호는 8자 이상 입력해 주세요.';
    if (password !== fieldset.querySelector('#signup-password-confirm').value) return '비밀번호 확인이 일치하지 않습니다.';
    if (!birthDate || calculateAge(birthDate) < 15) return 'SparringMatch 베타는 만 15세 이상만 이용할 수 있어요.';
  }
  if (step === 3) {
    if (fieldset.querySelector('#signup-name').value.trim().length < 2) return '닉네임은 두 글자 이상 입력해 주세요.';
    if (!fieldset.querySelector('#signup-location').value.trim()) return '정확한 주소 대신 공개할 대략적인 지역을 입력해 주세요.';
    if (!fieldset.querySelector('#signup-terms').checked) return '하우스 룰과 청소년 안전 모드 확인이 필요합니다.';
  }
  return '';
}

let modalReturnFocus = null;

function closeModal() {
  if (!modalRoot.innerHTML) return;
  modalRoot.innerHTML = '';
  modalReturnFocus?.focus?.();
  modalReturnFocus = null;
}

// 모달이 열리면 포커스를 안으로 옮기고, 닫히면 열었던 버튼으로 돌려준다.
new MutationObserver(() => {
  const modal = modalRoot.querySelector('.modal');
  if (!modal || modal.contains(document.activeElement)) return;
  if (!modalReturnFocus) modalReturnFocus = document.activeElement;
  modal.setAttribute('tabindex', '-1');
  (modal.querySelector('select, textarea, input, .modal-actions .primary-button') || modal).focus();
}).observe(modalRoot, { childList: true });

document.addEventListener('keydown', (event) => {
  const modal = modalRoot.querySelector('.modal');
  if (!modal) return;
  if (event.key === 'Escape') return closeModal();
  if (event.key !== 'Tab') return;
  const focusable = [...modal.querySelectorAll('button, select, textarea, input, a[href]')].filter((element) => !element.disabled);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

// 매칭 순간 — 포스터 05의 좌우 분할을 '나 ↔ 상대' 은유로.
function openMatch(partner, request) {
  const me = myProfile();
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal match-modal" role="dialog" aria-modal="true" aria-labelledby="match-title"><div class="match-split" style="--me-a:${me.colors[0]}; --me-b:${me.colors[1]}; --them-a:${partner.colors[0]}; --them-b:${partner.colors[1]}"><span>${me.initial}</span><i aria-hidden="true">×</i><span>${partner.initial}</span></div><div class="modal-body"><p class="eyebrow">${icons.check} 상호 동의 완료</p><h2 id="match-title" class="match-title">매칭 <em>성사.</em></h2><p class="modal-bio">${partner.name}님과 대화방이 열렸어요. 만나기 전에 아래 조건을 한 번 더 맞춰 보세요.</p><div class="detail-grid"><div class="detail-item"><span>목적</span><b>${escapeHtml(request.purpose)}</b></div><div class="detail-item"><span>강도</span><b>${escapeHtml(request.intensity)}</b></div><div class="detail-item"><span>희망 시간</span><b>${escapeHtml(request.preferredTime)}</b></div><div class="detail-item"><span>장소 유형</span><b>${escapeHtml(request.venueType)}</b></div></div><footer class="modal-actions"><button class="ghost-button" data-action="safety">안전 가이드</button><button class="primary-button" data-action="close-modal">${icons.message} 대화 시작하기</button></footer></div></section></div>`;
}

function openRequest(userId) {
  const user = findUser(userId);
  if (!user) return;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="request-title"><header class="modal-head"><h2 id="request-title">스파링 제안 보내기</h2><button class="icon-button" data-action="close-modal" aria-label="닫기">${icons.x}</button></header><form class="modal-body" id="request-form" data-user-id="${user.id}"><div class="modal-profile">${avatar(user)}<div><b>${user.name} ${user.verified ? verified() : ''}</b><p>${user.sport} · ${user.level} · ${user.weight} · ${user.location}</p></div></div><div class="form-grid"><div class="field"><label for="request-purpose">운동 목적</label><select id="request-purpose"><option>라이트 스파링</option><option>기술 드릴</option><option>오픈매트 동행</option></select></div><div class="field"><label for="request-intensity">희망 강도</label><select id="request-intensity"><option>${user.intensity}</option><option>드릴</option><option>라이트</option><option>보통</option></select></div><div class="field"><label for="request-time">희망 시간</label><select id="request-time"><option>이번 주 화요일 20:00</option><option>이번 주 목요일 20:00</option><option>일정 조율하기</option></select></div><div class="field"><label for="request-venue">장소 유형</label><select id="request-venue"><option>인증 체육관에서</option><option>공개 오픈매트에서</option></select></div><div class="field full"><label for="request-message">메시지</label><textarea id="request-message" maxlength="200">안녕하세요! ${user.note} 저도 비슷한 조건으로 안전하게 운동하고 싶어 제안드려요.</textarea></div></div><p class="modal-safety">${icons.shield}<span>상대가 수락하기 전에는 정확한 주소와 연락처를 요구하지 마세요. 룰·강도·보호장비는 실제 운동 전 다시 함께 확인해 주세요.</span></p><footer class="modal-actions"><button class="ghost-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">${icons.arrow} 제안 보내기</button></footer></form></section></div>`;
}

function openProfile(userId) {
  const user = findUser(userId);
  if (!user) return;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="profile-title"><header class="modal-head"><span>파트너 프로필</span><button class="icon-button" data-action="close-modal" aria-label="닫기">${icons.x}</button></header><div class="modal-body"><div class="profile-modal-head">${avatar(user, 'large')}<div><h2 id="profile-title">${user.name} ${user.verified ? verified() : ''}</h2><p>${user.sport} · ${user.level} · ${user.location}</p><div class="tag-list"><span class="rule-tag">${user.intensity} 스파링</span><span class="tag">${user.weight}</span><span class="tag">${user.height}</span></div></div></div>${commonGround(user).length ? `<div class="common-list" style="margin-top:14px">${commonGround(user).map((item) => `<span class="common-chip">${icons.check} ${item}</span>`).join('')}</div>` : ''}<div class="prompt-block" style="margin-top:12px"><span>내가 선호하는 스파링</span><p>${user.note}</p></div><div class="detail-grid"><div class="detail-item"><span>가능 시간</span><b>${user.availability}</b></div><div class="detail-item"><span>소속 체육관</span><b>${user.gym}</b></div><div class="detail-item"><span>위치 공개</span><b>${distanceLabel(user)}</b></div><div class="detail-item"><span>인증 상태</span><b>${user.verified ? '휴대폰 인증 완료' : '기본 인증'}</b></div></div><footer class="modal-actions"><button class="danger-button" data-action="report">${icons.flag} 신고</button><button class="primary-button" data-action="request" data-id="${user.id}" ${state.sentRequests.has(user.id) ? 'disabled' : ''}>${state.sentRequests.has(user.id) ? `${icons.check} 제안 보냄` : `${icons.plus} 스파링 제안`}</button></footer></div></section></div>`;
}

function infoModal(title, body, actionLabel = '확인') {
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="info-title"><header class="modal-head"><h2 id="info-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="닫기">${icons.x}</button></header><div class="modal-body">${body}<footer class="modal-actions"><button class="primary-button" data-action="close-modal">${actionLabel}</button></footer></div></section></div>`;
}

function openPost(postId) {
  const post = posts.find((candidate) => candidate.id === postId);
  if (!post) return;
  infoModal(post.title, `<div class="post-author">${miniAvatar({ initial: post.initial, colors: post.colors })}<div><strong>${post.author}</strong><div class="post-meta"><span class="board-badge">${post.board}</span><span>${post.time}</span></div></div></div><p class="modal-bio">${post.body}</p><div class="notice-card" style="margin-top:15px"><h3>${icons.shield} 건전한 대화</h3><p>개인 연락처와 정확한 위치 정보는 공개하지 마세요. 불편한 댓글이나 메시지는 신고할 수 있습니다.</p></div>`);
}

function openEvent(eventId) {
  const event = events.find((candidate) => candidate.id === eventId);
  if (!event) return;
  infoModal(event.title, `<div class="modal-profile"><span class="event-date">${event.month}<b>${event.day}</b></span><div><b>${event.category}</b><p>${event.place}</p></div></div><p class="modal-bio">이 화면은 베타용 mock 이벤트입니다. 실제 신청 전에는 참가 조건, 보호장비, 환불 규정과 주최자 정보를 확인해야 합니다.</p><div class="detail-grid"><div class="detail-item"><span>현재 상태</span><b>${event.people}</b></div><div class="detail-item"><span>안전 기준</span><b>공개 장소 · 룰 확인</b></div></div>`, '관심 표시');
}

function openProduct(productId) {
  const product = products.find((candidate) => candidate.id === productId);
  if (!product) return;
  const isUsed = product.type === '중고';
  infoModal(product.name, `<div class="product-detail-top"><span class="product-visual ${product.accent}"><span class="product-badge">${product.badge || product.type}</span><b>${product.mark}</b><span>${product.category}</span></span><div><p class="product-brand">${product.brand}</p><h3 style="margin:3px 0 6px;font-size:18px">${product.name}</h3><strong style="font-size:18px">${formatPrice(product.price)}</strong><div class="tag-list"><span class="condition-pill ${isUsed ? 'used' : ''}">${product.type}</span>${isUsed ? `<span class="tag">${product.location}</span>` : '<span class="tag">공식 판매 mock</span>'}</div></div></div><p class="modal-bio">${product.description}</p>${isUsed ? `<div class="modal-safety">${icons.shield}<span>중고 거래에서는 판매자 평판, 실물 상태, 사이즈, 거래 방법을 확인하세요. 이 베타는 결제·배송·안전결제를 처리하지 않습니다.</span></div>` : `<div class="notice-card" style="margin-top:15px"><h3>${icons.bag} 새제품 구매 mock</h3><p>결제·배송은 연결되지 않았습니다. 정식 버전에서는 상품 정보, 반품·환불 조건, PG 결제를 별도로 연동합니다.</p></div>`}`);
}

async function sendChat(form) {
  const input = form.querySelector('#chat-input');
  const message = input.value.trim();
  if (!message) return;
  const sendButton = form.querySelector('button[type="submit"]');
  sendButton.disabled = true;
  try {
    const payload = await matchChatRequest(`/api/conversations/${state.activeConversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ senderId: currentUserId(), body: message }),
    });
    const conversation = conversations.find((item) => item.id === state.activeConversationId);
    conversation.messages.push({ who: 'me', body: payload.message.body, time: formatServerTime(payload.message.createdAt) });
    conversation.preview = payload.message.body;
    conversation.time = formatServerTime(payload.message.createdAt);
    input.value = '';
    render();
    document.querySelector('#chat-input')?.focus();
  } catch (error) {
    sendButton.disabled = false;
    showToast(error.message || '메시지를 서버에 저장하지 못했습니다.');
  }
}

const respondingRequestIds = new Set();

async function respondToRequest(requestId, decision) {
  if (respondingRequestIds.has(requestId)) return;
  respondingRequestIds.add(requestId);
  try {
    const payload = await matchChatRequest(`/api/match-requests/${encodeURIComponent(requestId)}/${decision}`, {
      method: 'POST',
      body: JSON.stringify({ actorUserId: currentUserId() }),
    });
    const index = state.serverRequests.findIndex((item) => item.id === requestId);
    if (index >= 0) state.serverRequests[index] = payload.request;
    if (decision === 'accept' && payload.conversation) state.activeConversationId = payload.conversation.id;
    await syncMatchAndChat();
    render();
    if (decision === 'accept') {
      state.page = 'messages';
      render();
      openMatch(findUser(payload.request.fromUserId) || { name: '파트너', initial: '?', colors: ['#343434', '#555555'] }, payload.request);
    } else {
      showToast('스파링 제안을 거절했어요. 사유는 상대에게 전달되지 않습니다.');
    }
  } catch (error) {
    showToast(error.message || '요청을 처리하지 못했습니다.');
  } finally {
    respondingRequestIds.delete(requestId);
  }
}

function handleAction(action, id, value) {
  if (action === 'close-modal') return closeModal();
  if (action === 'accept-request') return void respondToRequest(id, 'accept');
  if (action === 'decline-request') return void respondToRequest(id, 'decline');
  if (action === 'switch-auth') { state.authMode = value || 'login'; return render(); }
  if (action === 'signup-prev') return goSignupStep(currentSignupStep() - 1);
  if (action === 'signup-next') { const message = signupStepError(currentSignupStep()); return message ? showAuthError(message) : goSignupStep(currentSignupStep() + 1); }
  if (action === 'pass-user') { state.passedUsers.add(id); render(); return showToast('이 파트너를 넘겼어요. 상대에게는 알리지 않습니다.'); }
  if (action === 'restore-passed') { state.passedUsers.clear(); return render(); }
  if (action === 'event-filter') { state.eventFilter = value || '전체 일정'; return render(); }
  if (action === 'auth-home') { state.authMode = 'login'; return render(); }
  if (action === 'demo-login') { state.account = { ...DEMO_ACCOUNT }; saveSession(state.account); state.page = 'home'; render(); void syncMatchAndChat(); return showToast('데모 계정으로 로그인했습니다. 매칭 요청과 채팅은 로컬 서버에 저장됩니다.'); }
  if (action === 'logout') { clearSession(); state.account = null; state.authMode = 'login'; return render(); }
  if (action === 'shop-type') { state.shopType = value || '전체'; return render(); }
  if (action === 'shop-category') { state.shopCategory = value || '전체'; return render(); }
  if (action === 'product') return openProduct(id);
  if (action === 'cart') { state.cart.add(id); render(); return showToast('장바구니에 담았어요. 베타에서는 실제 결제가 진행되지 않습니다.'); }
  if (action === 'save-product') { state.savedProducts.has(id) ? state.savedProducts.delete(id) : state.savedProducts.add(id); showToast(state.savedProducts.has(id) ? '관심 장비에 저장했어요.' : '관심 장비에서 삭제했어요.'); return render(); }
  if (action === 'used-inquiry') return infoModal('중고 상품 문의', `<p class="modal-bio">베타에서는 판매자에게 실제 메시지가 전송되지 않습니다. 정식 버전에서는 매칭 채팅과 분리된 안전 거래 문의, 차단·신고, 거래 가이드가 필요합니다.</p><div class="modal-safety">${icons.shield}<span>개인 계좌 선입금, 외부 메신저 유도, 정확한 집 주소 요구는 신중하게 판단하세요.</span></div>`);
  if (action === 'cart-view') { const items = products.filter((product) => state.cart.has(product.id)); return infoModal('장바구니', items.length ? `<div class="cart-list">${items.map((product) => `<div class="compact-row"><span class="product-thumb ${product.accent}">${product.mark}</span><span><b>${product.name}</b><span>${formatPrice(product.price)} · ${product.type}</span></span></div>`).join('')}</div><div class="modal-safety">${icons.lock}<span>베타에서는 결제·배송·환불 처리가 연결되어 있지 않습니다.</span></div>` : '<p class="modal-bio">장바구니가 비어 있습니다. 새제품 장비를 담아 볼 수 있어요.</p>'); }
  if (action === 'request') return openRequest(id);
  if (action === 'profile') return openProfile(id);
  if (action === 'post') return openPost(id);
  if (action === 'event') return openEvent(id);
  if (action === 'select-gym') { state.selectedGymId = id; return render(); }
  if (action === 'conversation') { state.activeConversationId = id; return render(); }
  if (action === 'save-user') { state.savedUsers.has(id) ? state.savedUsers.delete(id) : state.savedUsers.add(id); showToast(state.savedUsers.has(id) ? '저장 목록에 추가했어요.' : '저장 목록에서 삭제했어요.'); return render(); }
  if (action === 'reset-filters') { state.sport = '전체'; state.intensity = '전체'; state.radius = 10; state.search = ''; state.passedUsers.clear(); return render(); }
  if (action === 'safety') return infoModal('SparringMatch 안전 가이드', `<ul class="check-list"><li>${icons.check}<span>스파링 전에는 종목, 강도, 룰, 보호장비를 다시 합의해요.</span></li><li>${icons.check}<span>처음 만날 때는 인증 체육관이나 공개 오픈매트를 우선해요.</span></li><li>${icons.check}<span>정확한 주소·연락처·금전 요구가 불편하면 거절하고 차단·신고할 수 있어요.</span></li><li>${icons.check}<span>상대의 동의 없이 촬영하거나 영상을 게시하지 않아요.</span></li></ul>`);
  if (action === 'report') return infoModal('신고 및 차단', `<p class="modal-bio">베타 화면에서는 실제 신고가 접수되지 않습니다. 실제 서비스에서는 신고 사유, 증거, 긴급 여부를 분리해 운영자가 검토해야 합니다.</p><div class="modal-safety">${icons.shield}<span>즉시 위험한 상황이라면 앱 신고보다 지역 긴급 연락처를 먼저 이용하세요.</span></div>`, '확인');
  if (action === 'filters') return infoModal('상세 조건', `<p class="modal-bio">정식 버전에서는 체급/키 범위, 운동 연차, 가능 시간, 체육관 인증, 차단 목록을 포함한 세부 필터를 제공합니다.</p>`);
  if (action === 'write-post') return infoModal('커뮤니티 글쓰기', `<p class="modal-bio">베타에서는 게시글 작성 UI를 준비 중입니다. 실제 서비스에서는 금칙어·미디어 검사와 신고 기능을 함께 적용해야 합니다.</p>`, '알겠어요');
  if (action === 'topic') return showToast('이 주제의 최신 글을 불러오는 mock 동작입니다.');
  if (action === 'gym-suggest') return infoModal('체육관 제보', `<p class="modal-bio">정식 서비스에서는 체육관명, 공개된 사업장 정보, 종목, 공식 링크를 제보받아 운영자가 검토한 뒤 등록합니다.</p>`);
  if (action === 'gym-detail') return infoModal('체육관 상세', `<p class="modal-bio">실제 베타에서는 시간표, 시설, 오픈매트, 체험 수업, 운영자 인증 상태를 이 화면에서 제공합니다. 현재는 mock 데이터입니다.</p>`);
  if (action === 'create-event') return infoModal('이벤트 등록', `<p class="modal-bio">정식 서비스에서는 주최자, 일시, 공개 장소, 참가 조건, 비용, 안전 수칙을 입력하고 운영 검토를 거쳐 공개합니다.</p>`);
  if (action === 'edit-profile') return infoModal('프로필 수정', `<p class="modal-bio">베타에서는 mock 프로필을 보여주고 있습니다. 정식 구현에서는 각 항목의 공개 범위를 직접 조정할 수 있어야 합니다.</p>`);
}

document.addEventListener('click', (event) => {
  const pageTarget = event.target.closest('[data-page]');
  if (pageTarget) {
    state.page = pageTarget.dataset.page;
    render();
    document.querySelector('#main-content')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const quick = event.target.closest('[data-quick-filter]');
  if (quick) {
    state.sport = quick.dataset.quickFilter === 'all' ? '전체' : quick.dataset.quickFilter;
    state.page = 'find';
    render();
    return;
  }
  const actionTarget = event.target.closest('[data-action]');
  if (actionTarget) {
    // Only the exposed backdrop closes the dialog; clicks inside .modal must reach their own buttons.
    if (actionTarget.classList.contains('modal-backdrop') && event.target !== actionTarget) return;
    handleAction(actionTarget.dataset.action, actionTarget.dataset.id, actionTarget.dataset.value);
  }
});

document.addEventListener('compositionstart', (event) => {
  if (event.target.id !== 'search-input') return;
  isSearchComposing = true;
  window.clearTimeout(searchRefreshTimer);
});

document.addEventListener('compositionend', (event) => {
  if (event.target.id !== 'search-input') return;
  isSearchComposing = false;
  state.search = event.target.value;
  queueFindResultsRefresh();
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'search-input') {
    state.search = event.target.value;
    if (!isSearchComposing && !event.isComposing) queueFindResultsRefresh();
  }
  if (event.target.id === 'radius-range') { state.radius = Number(event.target.value); event.target.previousElementSibling.textContent = `${state.radius}km 이내`; refreshFindResults(); }
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'sport-select') { state.sport = event.target.value; render(); }
  if (event.target.id === 'intensity-select') { state.intensity = event.target.value; render(); }
});

document.addEventListener('submit', async (event) => {
  if (event.target.id === 'login-form') {
    event.preventDefault();
    const email = event.target.querySelector('#login-email').value.trim().toLowerCase();
    const password = event.target.querySelector('#login-password').value;
    if (email === DEMO_ACCOUNT.email && password === 'sparringmatch2026') {
      state.account = { ...DEMO_ACCOUNT };
      saveSession(state.account);
     
      state.page = 'home';
      render();
      void syncMatchAndChat();
      showToast('데모 계정으로 로그인했습니다. 매칭 요청과 채팅은 로컬 서버에 저장됩니다.');
      return;
    }
    const accounts = readStoredJson(AUTH_ACCOUNTS_KEY, []);
    const account = accounts.find((candidate) => candidate.email === email);
    if (!account || account.passwordHash !== await hashForMockOnly(password)) {
      showAuthError('이메일 또는 비밀번호를 다시 확인해 주세요. 데모 계정도 사용할 수 있어요.');
      return;
    }
    const { passwordHash, ...sessionAccount } = account;
    state.account = sessionAccount;
    saveSession(state.account);
   
    state.page = 'home';
    render();
    void syncMatchAndChat();
    showToast('로그인했습니다. 안전한 운동 약속을 만들어 보세요.');
    return;
  }
  if (event.target.id === 'signup-form') {
    event.preventDefault();
    const nickname = event.target.querySelector('#signup-name').value.trim();
    const sport = event.target.querySelector('#signup-sport').value;
    const level = event.target.querySelector('#signup-level').value;
    const intensity = event.target.querySelector('#signup-intensity').value;
    const location = event.target.querySelector('#signup-location').value.trim();
    const weight = event.target.querySelector('#signup-weight').value;
    const height = event.target.querySelector('#signup-height').value;
    const availability = event.target.querySelector('#signup-availability').value;
    const gym = event.target.querySelector('#signup-gym').value.trim();
    const note = event.target.querySelector('#signup-note').value.trim();
    const email = event.target.querySelector('#signup-email').value.trim().toLowerCase();
    const password = event.target.querySelector('#signup-password').value;
    const passwordConfirm = event.target.querySelector('#signup-password-confirm').value;
    const birthDate = event.target.querySelector('#signup-birth').value;
    const terms = event.target.querySelector('#signup-terms').checked;
    // Enter 키 암묵 제출: 마지막 단계가 아니면 '다음'으로 취급한다.
    if (currentSignupStep() < 3) return handleAction('signup-next');
    const failedStep = [1, 2, 3].find((step) => signupStepError(step));
    if (failedStep) {
      const message = signupStepError(failedStep);
      goSignupStep(failedStep);
      showAuthError(message);
    } else {
      const accounts = readStoredJson(AUTH_ACCOUNTS_KEY, []);
      const existingAccount = accounts.find((candidate) => candidate.email === email);
      if (email === DEMO_ACCOUNT.email || existingAccount?.userId) {
        goSignupStep(1);
        showAuthError('이미 등록된 이메일입니다. 로그인해 주세요.');
      } else if (existingAccount && existingAccount.passwordHash !== await hashForMockOnly(password)) {
        goSignupStep(1);
        showAuthError('기존 계정의 비밀번호가 일치하지 않습니다. 로그인 후 다시 시도해 주세요.');
      } else {
        try {
          const payload = await matchChatRequest('/api/profiles', {
            method: 'POST',
            body: JSON.stringify({ name: nickname, sport, level, intensity, location, weight, height, availability, gym, note, birthDate }),
          });
          const profile = sanitizeProfile(payload.profile);
          const account = {
            email,
            nickname: profile.name,
            birthDate,
            userId: profile.id,
            ...profile,
            passwordHash: existingAccount?.passwordHash || await hashForMockOnly(password),
          };
          const nextAccounts = existingAccount
            ? accounts.map((candidate) => candidate.email === email ? account : candidate)
            : [...accounts, account];
          localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(nextAccounts));
          const { passwordHash, ...sessionAccount } = account;
          state.account = sessionAccount;
          registeredProfiles = [...registeredProfiles.filter((item) => item.id !== profile.id), profile];
          saveSession(state.account);
         
          state.page = 'profile';
          render();
          void syncMatchAndChat();
          showToast(existingAccount ? '기존 계정을 공개 운동 프로필로 전환했어요.' : '가입 프로필이 서버에 저장됐어요. 이제 파트너 목록에도 표시됩니다.');
          return;
        } catch (error) {
          showAuthError(error.message || '가입 프로필을 서버에 저장하지 못했습니다.');
        }
      }
    }
    return;
  }
  if (event.target.id === 'request-form') {
    event.preventDefault();
    const userId = event.target.dataset.userId;
    const submitButton = event.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      const payload = await matchChatRequest('/api/match-requests', {
        method: 'POST',
        body: JSON.stringify({
          fromUserId: currentUserId(),
          toUserId: userId,
          purpose: event.target.querySelector('#request-purpose').value,
          intensity: event.target.querySelector('#request-intensity').value,
          preferredTime: event.target.querySelector('#request-time').value,
          venueType: event.target.querySelector('#request-venue').value,
          message: event.target.querySelector('#request-message').value,
        }),
      });
      state.serverRequests.push(payload.request);
      state.sentRequests.add(userId);
      closeModal();
      render();
      showToast('서버에 스파링 제안을 보냈어요. 상대가 수락하면 안전한 채팅이 열립니다.');
    } catch (error) {
      submitButton.disabled = false;
      showToast(error.message || '스파링 제안을 서버에 저장하지 못했습니다.');
    }
    return;
  }
  if (event.target.id === 'chat-form') {
    event.preventDefault();
    sendChat(event.target);
  }
});

render();
void syncMatchAndChat();
