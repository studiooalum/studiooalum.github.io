create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum (
      'created',
      'payment_pending',
      'paid',
      'payment_failed',
      'cancelled',
      'refunded',
      'fulfilled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum (
      'pending',
      'authorized',
      'confirmed',
      'failed',
      'cancelled',
      'refunded'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'shipment_status') then
    create type shipment_status as enum (
      'ready',
      'packing',
      'shipped',
      'delivered',
      'returned'
    );
  end if;
end
$$;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  phone text,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  public_order_id text not null unique,
  customer_id uuid references customers(id) on delete set null,
  order_name text not null,
  currency text not null default 'KRW',
  status order_status not null default 'created',
  payment_status payment_status not null default 'pending',
  pg_provider text not null default 'toss',
  subtotal_amount integer not null default 0,
  shipping_amount integer not null default 0,
  discount_amount integer not null default 0,
  total_amount integer not null,
  paid_at timestamptz,
  cancelled_at timestamptz,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_total_amount_nonnegative check (total_amount >= 0),
  constraint orders_subtotal_amount_nonnegative check (subtotal_amount >= 0),
  constraint orders_shipping_amount_nonnegative check (shipping_amount >= 0),
  constraint orders_discount_amount_nonnegative check (discount_amount >= 0)
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  sanity_product_id text not null,
  product_slug text,
  product_title text not null,
  edition_label text,
  unit_price integer not null,
  quantity integer not null,
  line_total integer generated always as (unit_price * quantity) stored,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint order_items_unit_price_nonnegative check (unit_price >= 0),
  constraint order_items_quantity_positive check (quantity > 0)
);

create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  recipient_name text not null,
  recipient_phone text not null,
  recipient_email text not null,
  zipcode text not null,
  address1 text not null,
  address2 text not null default '',
  delivery_memo text not null default '',
  status shipment_status not null default 'ready',
  carrier text,
  tracking_number text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null default 'toss',
  toss_payment_key text unique,
  toss_order_id text,
  method text,
  status payment_status not null default 'pending',
  requested_amount integer not null,
  approved_amount integer,
  raw_request jsonb not null default '{}'::jsonb,
  raw_response jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  constraint payments_requested_amount_positive check (requested_amount > 0),
  constraint payments_approved_amount_nonnegative check (approved_amount is null or approved_amount >= 0)
);

create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  payment_id uuid references payments(id) on delete cascade,
  provider text not null default 'toss',
  event_type text not null,
  delivery_id text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, delivery_id)
);

create index if not exists idx_orders_customer_id on orders(customer_id);
create index if not exists idx_orders_status on orders(status, payment_status);
create index if not exists idx_order_items_order_id on order_items(order_id);
create index if not exists idx_shipments_status on shipments(status);
create index if not exists idx_payments_order_id on payments(order_id);
create index if not exists idx_payments_toss_order_id on payments(toss_order_id);
create index if not exists idx_payment_events_order_id on payment_events(order_id, received_at desc);