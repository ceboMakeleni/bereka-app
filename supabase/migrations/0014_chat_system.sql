-- ============================================================================
-- Bereka: Job-Scoped Chat System
-- Migration 0014 — Real-time messaging between job creators and workers
--
-- One chat room per job assignment. Only the poster and assigned worker
-- can access each room. Messages are delivered in real-time via Supabase
-- Realtime. Blocklist-flagged messages are stored but hidden in the UI.
-- ============================================================================

-- ============================================
-- 1. Chat Rooms — one per job assignment
-- ============================================
CREATE TABLE IF NOT EXISTS chat_rooms (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id     UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- One chat room per job
  CONSTRAINT uq_chat_room_job UNIQUE (job_id),
  -- Creator and worker must be different people
  CONSTRAINT chk_chat_room_participants CHECK (creator_id <> worker_id)
);

-- ============================================
-- 2. Chat Messages
-- ============================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id    UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  is_flagged BOOLEAN DEFAULT FALSE NOT NULL,
  read_at    TIMESTAMPTZ,  -- For future read receipts
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================
-- 3. Chat Reports — message reporting
-- ============================================
CREATE TABLE IF NOT EXISTS chat_reports (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id  UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  status      TEXT DEFAULT 'OPEN' NOT NULL
              CHECK (status IN ('OPEN', 'RESOLVED')),
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Prevent duplicate reports from same user on same message
  CONSTRAINT uq_chat_report_user_message UNIQUE (message_id, reporter_id)
);

-- ============================================
-- 4. Row Level Security — chat_rooms
-- ============================================
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;

-- Participants can view their own rooms
CREATE POLICY "Participants can view own chat rooms"
  ON chat_rooms FOR SELECT
  USING (auth.uid() = creator_id OR auth.uid() = worker_id);

-- Service role inserts chat rooms (edge functions / auto-creation)
CREATE POLICY "Service role can insert chat rooms"
  ON chat_rooms FOR INSERT
  WITH CHECK (true);

-- Admins can view all chat rooms (admin visibility)
CREATE POLICY "Admins can view all chat rooms"
  ON chat_rooms FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ============================================
-- 5. Row Level Security — chat_messages
-- ============================================
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Participants can view messages in their rooms
CREATE POLICY "Participants can view chat messages"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_rooms
      WHERE chat_rooms.id = room_id
        AND (chat_rooms.creator_id = auth.uid() OR chat_rooms.worker_id = auth.uid())
    )
  );

-- Service role inserts messages (via edge function)
CREATE POLICY "Service role can insert chat messages"
  ON chat_messages FOR INSERT
  WITH CHECK (true);

-- Admins can view all messages (admin visibility)
CREATE POLICY "Admins can view all chat messages"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Allow participants to update read_at on messages they received
CREATE POLICY "Recipients can mark messages as read"
  ON chat_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM chat_rooms
      WHERE chat_rooms.id = room_id
        AND (chat_rooms.creator_id = auth.uid() OR chat_rooms.worker_id = auth.uid())
    )
    AND sender_id <> auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_rooms
      WHERE chat_rooms.id = room_id
        AND (chat_rooms.creator_id = auth.uid() OR chat_rooms.worker_id = auth.uid())
    )
    AND sender_id <> auth.uid()
  );

-- ============================================
-- 6. Row Level Security — chat_reports
-- ============================================
ALTER TABLE chat_reports ENABLE ROW LEVEL SECURITY;

-- Participants can insert reports for messages in their rooms
CREATE POLICY "Participants can report chat messages"
  ON chat_reports FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_messages
      JOIN chat_rooms ON chat_rooms.id = chat_messages.room_id
      WHERE chat_messages.id = message_id
        AND (chat_rooms.creator_id = auth.uid() OR chat_rooms.worker_id = auth.uid())
    )
  );

-- Reporters can view their own reports
CREATE POLICY "Reporters can view own reports"
  ON chat_reports FOR SELECT
  USING (reporter_id = auth.uid());

-- Admins can view all reports
CREATE POLICY "Admins can view all chat reports"
  ON chat_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ============================================
-- 7. Indexes for efficient querying
-- ============================================

-- Chat rooms: look up by job, by participants
CREATE INDEX IF NOT EXISTS idx_chat_rooms_job_id     ON chat_rooms(job_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_creator_id ON chat_rooms(creator_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_worker_id  ON chat_rooms(worker_id);

-- Chat messages: paginated retrieval by room
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created
  ON chat_messages(room_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id
  ON chat_messages(sender_id);

-- Chat reports: lookup by message, by status
CREATE INDEX IF NOT EXISTS idx_chat_reports_message_id ON chat_reports(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_reports_status     ON chat_reports(status) WHERE status = 'OPEN';

-- ============================================
-- 8. Enable Supabase Realtime on chat_messages
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- ============================================
-- 9. CDC Audit Triggers
-- ============================================

-- Audit trigger on new chat messages
CREATE TRIGGER audit_chat_messages_insert
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Audit trigger on new chat reports
CREATE TRIGGER audit_chat_reports_insert
  AFTER INSERT ON chat_reports
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
