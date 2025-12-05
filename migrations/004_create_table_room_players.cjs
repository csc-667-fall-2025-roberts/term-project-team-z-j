/*
Table room_players {
  user_id     bigint [ref: > users.id, not null]
  room_id     bigint [ref: > game_room.id, not null]
  position    int [not null, default: 0, note: 'seat num.'] 
  is_ready    boolean [not null, default: false]
  created_at  timestamp [not null, default: `now()`]
  (user_id, room_id) [pk]
}
*/

exports.up = (pgm) => {
  pgm.createTable('room_players', {
    user_id: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE', 
    },
    room_id: {
      type: 'bigint',
      notNull: true,
      references: 'game_room',
      onDelete: 'CASCADE', 
    },
    position: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    is_ready: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.addConstraint('room_players', 'room_players_pk', {
    primaryKey: ['user_id', 'room_id'],
  });
  
  //ensure each seat has only one player
  pgm.addConstraint('room_players', 'room_players_room_position_unique', {
    unique: ['room_id', 'position'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('room_players', {
    ifExists: true,
    cascade: true,
  });
};