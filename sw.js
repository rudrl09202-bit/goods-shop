// 서비스 워커: 홈 화면 설치 + 인터넷이 끊겼을 때 대비
// 1) 자주 보는 페이지(첫 화면, 상품 상세)는 설치할 때 미리 저장
// 2) 결제 화면(과 내 정보가 필요한 화면)은 저장본을 쓰지 않고 항상 인터넷에서 최신으로
// 3) 그 밖에는 인터넷 먼저 → 받은 것 저장 → 끊기면 저장본, 없으면 안내 페이지(offline.html)
// 로그인·주문·결제(토스)·상품 사진은 건드리지 않는다 (항상 실시간).
importScripts("js/config.js"); // SUPABASE_URL, SUPABASE_KEY (공개 값)

const CACHE = "turingshop-v4";
const FILES = [
  "index.html", "product.html", "offline.html",
  "css/style.css", "css/product.css", "js/config.js", "js/common.js",
  "manifest.json", "icons/icon-192.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
];
// 항상 최신으로만 여는 화면 (저장 안 함, 끊기면 안내 페이지)
// - 결제 진행 중: 장바구니(결제 위젯), 결제 성공·실패
// - 내 정보가 필요해 인터넷 없이는 못 쓰는 화면: 내 결제 내역, 관리자, 로그인
const LIVE_PAGES = ["cart.html", "success.html", "fail.html", "orders.html", "admin.html", "login.html"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(FILES);
    await saveProducts(c).catch(() => {}); // 상품 미리 저장은 실패해도 설치는 계속
  }));
  self.skipWaiting();
});

// 모든 상품의 상세 페이지와 상품 정보를 미리 저장
// (페이지가 Supabase 에 보내는 것과 똑같은 주소로 저장해야 끊겼을 때 찾을 수 있음)
async function saveProducts(c) {
  const api = SUPABASE_URL + "/rest/v1/products?select=*";
  const res = await fetch(api + "&order=id.asc", { headers: { apikey: SUPABASE_KEY } });
  if (!res.ok) return;
  await c.put(api + "&order=id.asc", res.clone()); // 첫 화면 상품 목록
  const page = await c.match("product.html");
  for (const p of await res.json()) {
    await c.put(`product.html?id=${p.id}`, page.clone());
    await c.put(api + `&id=eq.${p.id}`, new Response(JSON.stringify([p]), {
      headers: { "Content-Type": "application/json" },
    }));
  }
}

// 옛 버전 저장소 지우기 (maison-v1 등)
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// 서비스 워커가 맡을 요청인지 고르기
function canCache(url) {
  // 우리 사이트 파일
  if (url.origin === location.origin) return true;
  // 글꼴과 supabase 라이브러리
  if (["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)) return true;
  // Supabase 상품 목록 (누구나 보는 공개 정보)
  return url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/rest/v1/products");
}

// 항상 최신 화면인지: 그 화면 자체이거나, 그 화면이 불러오는 파일
async function isLive(e) {
  const client = e.request.mode === "navigate" ? null : await clients.get(e.clientId);
  const pageUrl = client ? client.url : e.request.url;
  return LIVE_PAGES.some(p => new URL(pageUrl).pathname.endsWith("/" + p));
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || !canCache(new URL(req.url))) return;
  e.respondWith(handle(e));
});

async function handle(e) {
  const req = e.request;
  try {
    // 결제 중 등: 저장본도 브라우저 임시 저장도 건너뛰고 항상 최신. 저장도 안 함
    if (await isLive(e)) {
      const fresh = req.mode === "navigate" ? new Request(req.url) : req;
      return await fetch(fresh, { cache: "no-store" });
    }
    const res = await fetch(req);
    // 제대로 받은 것만 저장 (본 페이지도 저장 → 다음에 끊겨도 보임)
    // opaque = 다른 사이트 파일(supabase 라이브러리, 글꼴 css)이라 내용이 안 보이는 응답. 이것도 저장
    if (res.ok || res.type === "opaque") {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  } catch (_) {
    // 인터넷이 끊김: 저장본 → 없으면 페이지는 안내 페이지
    const saved = await caches.match(req);
    if (saved) return saved;
    if (req.mode === "navigate") return caches.match("offline.html");
    return Response.error();
  }
}

// ── 푸시 알림: 서버(Edge Function)가 보낸 알림을 화면에 띄움 ──
self.addEventListener("push", e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(data.title || "turingshop", {
    body: data.body || "",
    icon: "icons/icon-192.png",
    data: { url: data.url || "index.html" },
  }));
});

// 알림을 누르면: 열려 있는 창이 있으면 그 창으로, 없으면 새로 열기
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data.url, self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window" }).then(list => {
    const win = list.find(c => c.url.startsWith(self.registration.scope));
    return win ? win.focus().then(w => w.navigate(url)) : clients.openWindow(url);
  }));
});
