// 서비스 워커: 홈 화면 설치 + 인터넷이 끊겼을 때 대비
// 항상 인터넷에서 새로 받아오고, 받은 것은 저장해 둔다. 실패했을 때만 저장해 둔 것을 보여준다.
// 로그인·주문·결제(토스)·상품 사진은 건드리지 않는다 (항상 실시간).
const CACHE = "turingshop-v1";
const FILES = ["offline.html", "css/style.css", "icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

// 옛 버전 저장소 지우기 (maison-v1 등)
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// 저장해 둘 요청인지 고르기
function canCache(url) {
  // 우리 사이트 파일 (단, 결제 결과 페이지는 절대 저장 안 함)
  if (url.origin === location.origin) return !/\/(success|fail)\.html$/.test(url.pathname);
  // 글꼴과 supabase 라이브러리
  if (["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)) return true;
  // Supabase 상품 목록 (누구나 보는 공개 정보)
  return url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/rest/v1/products");
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || !canCache(new URL(req.url))) return;

  e.respondWith(
    fetch(req)
      .then(res => {
        // 제대로 받은 것만 저장 (본 페이지도 저장 → 다음에 끊겨도 보임)
        // opaque = 다른 사이트 파일(supabase 라이브러리, 글꼴 css)이라 내용이 안 보이는 응답. 이것도 저장
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const saved = await caches.match(req);
        if (saved) return saved;
        if (req.mode === "navigate") return caches.match("offline.html");
        return Response.error();
      })
  );
});
