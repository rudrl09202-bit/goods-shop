const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 현재 로그인한 사용자 (없으면 null)
async function getUser() {
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
}

// 로그인 안 했으면 로그인 페이지로 보냄
async function requireLogin() {
  const user = await getUser();
  if (!user) location.href = "login.html";
  return user;
}

async function logout() {
  await sb.auth.signOut();
  location.href = "index.html";
}

function won(n) {
  return Number(n).toLocaleString("ko-KR") + "원";
}

function dateText(s) {
  return s ? new Date(s).toLocaleString("ko-KR") : "-";
}

// DB 글자를 innerHTML 에 넣을 때 꼭 감싸기 (태그가 실행되지 않게)
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Edge Function 호출. 실패하면 서버가 보낸 메시지로 오류를 던짐
async function callFunction(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    try { message = (await error.context.json()).message || message; } catch (_) {}
    throw new Error(message);
  }
  return data;
}

const STATUS_TEXT = { pending: "결제 대기", paid: "결제 완료", failed: "결제 실패", canceled: "결제 취소" };

function statusBadge(status) {
  return `<span class="badge ${esc(status)}">${esc(STATUS_TEXT[status] || status)}</span>`;
}

// ── 장바구니 (이 브라우저에만 저장: [{ productId, quantity }]) ──
const CART_KEY = "maison-cart";
const CART_MAX_QTY = 10;

function getCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
    return Array.isArray(cart) ? cart : [];
  } catch (_) {
    return [];
  }
}

function saveCart(cart) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (_) {}
  updateCartBadge();
}

// 담기: 같은 상품이면 수량을 더함 (최대 10개)
function addToCart(productId, qty = 1) {
  const cart = getCart();
  const item = cart.find(i => i.productId === productId);
  if (item) item.quantity = Math.min(CART_MAX_QTY, item.quantity + qty);
  else cart.push({ productId, quantity: Math.min(CART_MAX_QTY, qty) });
  saveCart(cart);
}

function setCartQty(productId, qty) {
  const q = Math.max(1, Math.min(CART_MAX_QTY, qty));
  saveCart(getCart().map(i => (i.productId === productId ? { ...i, quantity: q } : i)));
}

function removeFromCart(productId) {
  saveCart(getCart().filter(i => i.productId !== productId));
}

function clearCart() {
  saveCart([]);
}

function cartCount() {
  return getCart().reduce((sum, i) => sum + i.quantity, 0);
}

function updateCartBadge() {
  const el = document.getElementById("cart-count");
  if (el) el.textContent = cartCount();
}

// 상단 메뉴
async function renderNav() {
  const user = await getUser();
  let links = `<a href="index.html">상품</a>`;
  links += `<a href="cart.html">장바구니<span id="cart-count" class="cart-count">${cartCount()}</span></a>`;
  if (user) {
    links += `<a href="orders.html">내 결제 내역</a>`;
    if (user.email === ADMIN_EMAIL) links += `<a href="admin.html">관리자</a>`;
    links += `<span class="nav-email">${esc(user.email)}</span><button class="link" onclick="logout()">로그아웃</button>`;
  } else {
    links += `<a href="login.html">로그인</a>`;
  }
  document.getElementById("nav").innerHTML =
    `<a class="logo" href="index.html">MAISON</a><div class="nav-links">${links}</div>`;
}

// 하단 영역 (모든 페이지 공통)
function renderFooter() {
  document.body.insertAdjacentHTML("beforeend", `
    <footer class="site-footer">
      <div class="footer-logo">MAISON</div>
      <p>토스페이먼츠 테스트 결제 환경입니다. 실제로 결제되지 않습니다.</p>
    </footer>`);
}

renderNav();
renderFooter();

// 앱처럼 설치(홈 화면에 추가)할 수 있게 서비스 워커 등록 (sw.js)
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

// ── 홈 화면 추가 안내: 휴대폰·태블릿에서 처음 한 번만 아래에 띠로 보여줌 ──
const INSTALL_SEEN_KEY = "install-guide-seen";

function canShowInstallGuide() {
  const mobile = matchMedia("(pointer: coarse) and (max-width: 959px)").matches;
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  let seen = true;
  try { seen = localStorage.getItem(INSTALL_SEEN_KEY) === "1"; } catch (_) {}
  return mobile && !installed && !seen;
}

// text: 안내 글, onInstall: [설치] 버튼을 누르면 할 일 (없으면 버튼 없음)
function showInstallGuide(text, onInstall) {
  try { localStorage.setItem(INSTALL_SEEN_KEY, "1"); } catch (_) {}
  const bar = document.createElement("div");
  bar.className = "install-guide";
  bar.innerHTML = `<p>${text}</p>
    ${onInstall ? `<button class="install-btn">설치</button>` : ""}
    <button class="install-close" aria-label="안내 닫기">×</button>`;
  bar.querySelector(".install-close").onclick = () => bar.remove();
  if (onInstall) bar.querySelector(".install-btn").onclick = () => { bar.remove(); onInstall(); };
  document.body.append(bar);
}

// 안드로이드(크롬·삼성 인터넷): 브라우저가 "설치할 수 있음" 신호를 주면 띠 표시
addEventListener("beforeinstallprompt", e => {
  if (!canShowInstallGuide()) return;
  e.preventDefault();
  showInstallGuide("turingshop 앱으로 설치하면 더 편해요", () => e.prompt());
});

// 아이폰·아이패드 사파리: 설치 신호가 없어서 방법을 글로 안내 (카카오톡 등 앱 안 브라우저는 제외)
const ua = navigator.userAgent;
const iosSafari = /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|KAKAOTALK|NAVER|Instagram|FBAN|Line/.test(ua);
if (iosSafari && canShowInstallGuide()) {
  setTimeout(() => showInstallGuide("공유 버튼 → '홈 화면에 추가'로 앱처럼 쓸 수 있어요"), 2000);
}
