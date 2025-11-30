/*
Table game {
  id           bigint [pk, increment]
  room_id      bigint [ref: > game_room.id, not null]
  start_time   timestamp [not null, default: `now()`]
  end_time     timestamp 
}
*/

exports.up = (pgm) => {
  pgm.createTable('game', {
    id: {
      type: 'bigserial',
      primaryKey: true,
      notNull: true,
    },
    room_id: {
      type: 'bigint',
      notNull: true,
      references: 'game_room',
      onDelete: 'CASCADE', 
    },
    start_time: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    end_time: {
      type: 'timestamp',
      notNull: false,
      default: pgm.func("current_timestamp"),
    },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('game', {
    ifExists: true,
    cascade: true,
  });
};