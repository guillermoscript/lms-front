-- Create payment_requests table for manual payment tracking
CREATE TABLE IF NOT EXISTS payment_requests (
  request_id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,

  -- Contact information
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  message TEXT,

  -- Request status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending: waiting for admin action
  -- contacted: admin has sent payment instructions
  -- payment_received: payment confirmed, ready to enroll
  -- completed: student enrolled
  -- cancelled: request cancelled

  -- Payment details (filled by admin)
  payment_method TEXT, -- e.g., "Bank Transfer", "Wire Transfer", "Cash"
  payment_instructions TEXT,
  payment_deadline TIMESTAMPTZ,
  payment_confirmed_at TIMESTAMPTZ,
  payment_amount NUMERIC(10, 2),
  payment_currency VARCHAR(3),

  -- Invoice tracking
  invoice_number TEXT UNIQUE,
  invoice_generated_at TIMESTAMPTZ,

  -- Admin tracking
  processed_by UUID REFERENCES profiles(id),
  admin_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  CONSTRAINT payment_requests_status_check CHECK (
    status IN ('pending', 'contacted', 'payment_received', 'completed', 'cancelled')
  )
);

-- Create indexes for common queries
CREATE INDEX idx_payment_requests_user_id ON payment_requests(user_id);
CREATE INDEX idx_payment_requests_product_id ON payment_requests(product_id);
CREATE INDEX idx_payment_requests_status ON payment_requests(status);
CREATE INDEX idx_payment_requests_created_at ON payment_requests(created_at DESC);

-- Create updated_at trigger
CREATE TRIGGER update_payment_requests_updated_at
  BEFORE UPDATE ON payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;

-- Students can view their own payment requests
CREATE POLICY "Students can view own payment requests" ON payment_requests
  FOR SELECT
  USING (
    auth.uid() = user_id
  );

-- Students can create payment requests
CREATE POLICY "Students can create payment requests" ON payment_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
  );

-- Admins can view all payment requests
CREATE POLICY "Admins can view all payment requests" ON payment_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update all payment requests
CREATE POLICY "Admins can update payment requests" ON payment_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Add comment
COMMENT ON TABLE payment_requests IS 'Tracks manual/offline payment requests from students';
