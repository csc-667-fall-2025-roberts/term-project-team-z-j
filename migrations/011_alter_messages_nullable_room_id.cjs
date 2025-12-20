/*
  Fix messages table:
  1. Allow room_id to be NULL for lobby chat messages
  2. Add auto-increment sequence for id column
*/

exports.up = (pgm) => {
  // Drop the NOT NULL constraint on room_id
  pgm.alterColumn('messages', 'room_id', {
    notNull: false,
  });
  
  // Create a sequence for the id column if it doesn't exist
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'messages_id_seq') THEN
        CREATE SEQUENCE messages_id_seq;
        ALTER TABLE messages ALTER COLUMN id SET DEFAULT nextval('messages_id_seq');
        PERFORM setval('messages_id_seq', COALESCE((SELECT MAX(id) FROM messages), 0) + 1);
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  // First delete any messages with NULL room_id
  pgm.sql('DELETE FROM messages WHERE room_id IS NULL');
  
  // Then restore the NOT NULL constraint
  pgm.alterColumn('messages', 'room_id', {
    notNull: true,
  });
  
  // Remove the default (sequence) from id column
  pgm.sql('ALTER TABLE messages ALTER COLUMN id DROP DEFAULT');
};
