-- Migration: Booking System
-- Description: Creates tables for industry templates, booking configuration, customers, and bookings

-- Industry templates (pre-built configurations)
CREATE TABLE IF NOT EXISTS industry_templates (
  id TEXT PRIMARY KEY,  -- 'restaurant', 'dental', 'gym', 'salon', 'custom'
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,  -- lucide icon name
  default_fields JSONB NOT NULL,
  default_verification JSONB,
  default_payment JSONB,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Business booking configuration (per user)
CREATE TABLE IF NOT EXISTS booking_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  industry_template_id TEXT REFERENCES industry_templates(id),

  -- What to collect for bookings
  booking_fields JSONB NOT NULL DEFAULT '[]',

  -- Customer verification settings
  verification_enabled BOOLEAN DEFAULT FALSE,
  verification_fields JSONB DEFAULT '[]',
  verification_on_fail TEXT DEFAULT 'transfer_to_staff',

  -- New customer handling
  new_customer_action TEXT DEFAULT 'create_record',
  new_customer_fields JSONB DEFAULT '[]',

  -- Payment settings
  payment_required BOOLEAN DEFAULT FALSE,
  payment_type TEXT DEFAULT 'none',  -- 'none', 'card_hold', 'deposit'
  deposit_amount_cents INTEGER DEFAULT 0,

  -- Calendar integration
  calendar_provider TEXT,  -- 'google', 'calendly', null
  calendar_credentials JSONB,  -- encrypted OAuth tokens
  calendar_id TEXT,  -- specific calendar to use

  -- Confirmation settings
  sms_confirmation BOOLEAN DEFAULT TRUE,
  email_confirmation BOOLEAN DEFAULT FALSE,
  confirmation_template TEXT,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,

  UNIQUE(user_id)
);

-- Customer database (per business)
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Identity
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  phone TEXT,
  email TEXT,

  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'IE',

  -- Business-specific fields (flexible)
  custom_fields JSONB DEFAULT '{}',

  -- Metadata
  notes TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  last_booking_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(user_id, phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(user_id, email);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),

  -- Status
  status TEXT DEFAULT 'pending',  -- 'pending', 'pending_payment', 'confirmed', 'cancelled', 'completed', 'no_show'

  -- Booking data (flexible based on config)
  booking_data JSONB NOT NULL DEFAULT '{}',

  -- Scheduled time
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  duration_minutes INTEGER,

  -- Customer info (denormalized for quick access)
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,

  -- Payment
  payment_required BOOLEAN DEFAULT FALSE,
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  payment_status TEXT,  -- 'pending', 'authorized', 'captured', 'failed'
  payment_amount_cents INTEGER,

  -- Calendar sync
  calendar_event_id TEXT,

  -- Source
  source TEXT DEFAULT 'phone',  -- 'phone', 'web', 'walk_in'
  call_id UUID,  -- Reference to call_history if booked via call

  -- Timestamps
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(user_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(user_id, status);

-- RLS Policies
ALTER TABLE booking_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Policies for booking_configs
DROP POLICY IF EXISTS "Users can view own booking config" ON booking_configs;
CREATE POLICY "Users can view own booking config"
  ON booking_configs FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own booking config" ON booking_configs;
CREATE POLICY "Users can update own booking config"
  ON booking_configs FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own booking config" ON booking_configs;
CREATE POLICY "Users can insert own booking config"
  ON booking_configs FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own booking config" ON booking_configs;
CREATE POLICY "Users can delete own booking config"
  ON booking_configs FOR DELETE USING (user_id = auth.uid());

-- Policies for customers
DROP POLICY IF EXISTS "Users can view own customers" ON customers;
CREATE POLICY "Users can view own customers"
  ON customers FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage own customers" ON customers;
CREATE POLICY "Users can manage own customers"
  ON customers FOR ALL USING (user_id = auth.uid());

-- Policies for bookings
DROP POLICY IF EXISTS "Users can view own bookings" ON bookings;
CREATE POLICY "Users can view own bookings"
  ON bookings FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage own bookings" ON bookings;
CREATE POLICY "Users can manage own bookings"
  ON bookings FOR ALL USING (user_id = auth.uid());

-- Service role policies (for API access)
DROP POLICY IF EXISTS "Service role can manage booking_configs" ON booking_configs;
CREATE POLICY "Service role can manage booking_configs"
  ON booking_configs FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can manage customers" ON customers;
CREATE POLICY "Service role can manage customers"
  ON customers FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can manage bookings" ON bookings;
CREATE POLICY "Service role can manage bookings"
  ON bookings FOR ALL USING (auth.role() = 'service_role');

-- Seed industry templates
INSERT INTO industry_templates (id, name, description, icon, default_fields, default_verification, default_payment, sort_order) VALUES
('restaurant', 'Restaurant', 'Table reservations with party size', 'UtensilsCrossed',
  '[{"id":"party_size","label":"Party Size","type":"number","required":true,"voice_prompt":"How many people will be dining?"},{"id":"date","label":"Date","type":"date","required":true},{"id":"time","label":"Time","type":"time","required":true},{"id":"special_requests","label":"Special Requests","type":"text","required":false}]',
  '{"enabled":false}',
  '{"type":"card_hold","amount":0}',
  1),

('dental', 'Dental Practice', 'Appointments with service types', 'Stethoscope',
  '[{"id":"service_type","label":"Service","type":"select","required":true,"options":["Checkup","Cleaning","Filling","Extraction","Consultation"]},{"id":"date","label":"Date","type":"date","required":true},{"id":"time","label":"Time","type":"time","required":true},{"id":"notes","label":"Notes","type":"text","required":false}]',
  '{"enabled":true,"fields":["full_name","date_of_birth","postcode"]}',
  '{"type":"none"}',
  2),

('salon', 'Hair Salon / Barbershop', 'Service and stylist booking', 'Scissors',
  '[{"id":"service_type","label":"Service","type":"select","required":true,"options":["Haircut","Color","Highlights","Blowout","Treatment"]},{"id":"stylist","label":"Stylist","type":"text","required":false},{"id":"date","label":"Date","type":"date","required":true},{"id":"time","label":"Time","type":"time","required":true}]',
  '{"enabled":false}',
  '{"type":"deposit","amount":2000}',
  3),

('gym', 'Gym / Fitness', 'Class bookings and personal training', 'Dumbbell',
  '[{"id":"class_name","label":"Class","type":"select","required":true,"options":["Yoga","Spin","HIIT","Pilates","CrossFit","Personal Training"]},{"id":"date","label":"Date","type":"date","required":true},{"id":"time","label":"Time","type":"time","required":true}]',
  '{"enabled":true,"fields":["full_name","member_id"]}',
  '{"type":"none"}',
  4),

('custom', 'Custom', 'Build your own booking flow', 'Settings',
  '[{"id":"date","label":"Date","type":"date","required":true},{"id":"time","label":"Time","type":"time","required":true}]',
  '{"enabled":false}',
  '{"type":"none"}',
  99)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  default_fields = EXCLUDED.default_fields,
  default_verification = EXCLUDED.default_verification,
  default_payment = EXCLUDED.default_payment,
  sort_order = EXCLUDED.sort_order;
