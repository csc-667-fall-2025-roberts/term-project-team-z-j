/*
Table messages {
  id            bigserial [pk, not null]
  room_id       bigint [ref: > game_room.id, not null]
  sender_id     bigint [ref: > users.id, not null]
  message_type  message_type [ref: > message_type, not null, default: 'chat']
  content       text [not null]
  created_at    timestamp with time zone [not null, default: `now()`]
}
*/

exports.up = (pgm) => {
  pgm.createTable('messages', {
    id: {
      type: 'bigint',
      primaryKey: true,
      notNull: true,
    },
    room_id: {
      type: 'bigint',
      notNull: true,
      references: 'game_room',
      onDelete: 'CASCADE', 
    },
    sender_id: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE', 
    },
    message_type: {
      type: 'message_type',
      notNull: true,
      default: 'chat',
    },
    content: {
      type: 'text',
      notNull: true,
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('messages', ['room_id', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('messages', {
    ifExists: true,
    cascade: true,
  });
};