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

const STATUS_TEXT = { pending: "결제 대기", paid: "결제 완료", failed: "결제 실패" };

function statusBadge(status) {
  return `<span class="badge ${status}">${STATUS_TEXT[status] || status}</span>`;
}

// 상단 메뉴
async function renderNav() {
  const user = await getUser();
  let links = `<a href="index.html">상품</a>`;
  if (user) {
    links += `<a href="orders.html">내 결제 내역</a>`;
    if (user.email === ADMIN_EMAIL) links += `<a href="admin.html">관리자</a>`;
    links += `<span class="nav-email">${user.email}</span><button class="link" onclick="logout()">로그아웃</button>`;
  } else {
    links += `<a href="login.html">로그인</a>`;
  }
  document.getElementById("nav").innerHTML =
    `<a class="logo" href="index.html">MAISON</a><div class="nav-links">${links}</div>`;
}

renderNav();
