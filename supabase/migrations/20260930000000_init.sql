-- 상품
create table public.products (
  id bigint generated always as identity primary key,
  name text not null,
  description text not null default '',
  price integer not null check (price > 0),
  emoji text not null default '🎁',
  created_at timestamptz not null default now()
);

-- 주문 (결제 1건 = 주문 1건)
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,              -- 토스에 넘기는 주문번호
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  user_email text not null default (auth.jwt() ->> 'email'),
  product_id bigint not null references public.products(id),
  product_name text not null,
  amount integer not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  payment_key text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- 관리자 여부
create function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'admin@admin.com'
$$;

alter table public.products enable row level security;
alter table public.orders enable row level security;

-- 상품은 누구나 조회
create policy "products_select_all" on public.products
  for select using (true);

-- 주문 조회: 본인 것, 관리자는 전부
create policy "orders_select_own_or_admin" on public.orders
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- 주문 생성: 본인 것, pending 상태, 상품 가격과 같은 금액만
create policy "orders_insert_own_pending" on public.orders
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and user_email = (auth.jwt() ->> 'email')
    and status = 'pending'
    and payment_key is null
    and paid_at is null
    and amount = (select p.price from public.products p where p.id = product_id)
  );

-- 수정/삭제 정책 없음 → Edge Function(service role)만 상태를 바꿈

insert into public.products (name, description, price, emoji) values
  ('로고 스티커 세트', '노트북에 붙이기 좋은 방수 스티커 5종', 3000, '🏷️'),
  ('머그컵', '매일 쓰기 좋은 350ml 세라믹 머그', 12000, '☕'),
  ('티셔츠', '부드러운 면 100% 반팔 티셔츠', 25000, '👕'),
  ('에코백', '튼튼한 캔버스 소재 데일리 에코백', 15000, '👜');
