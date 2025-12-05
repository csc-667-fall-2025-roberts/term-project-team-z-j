/*
Table game_room {
  id           bigint [pk, increment]
  owner_id     bigint [fk, not null, unique] ref: > users.id
  name         varchar(64) [not null]
  max_players  int [not null, default: 4]        
  status       varchar(16) [not null, note: 'waiting | in_progress | closed']
  created_at   timestamp [not null, default: `now()`]
}
*/

exports.up = (pgm) => {
  pgm.createTable('game_room', {
    id: {
      type: 'bigserial',
      primaryKey: true,
      notNull: true,
    },
    owner_id: {
      type: 'bigint',
      notNull: true,
      references: 'users', // foreign key to user table
    },
    name: {
      type: 'varchar(64)',
      notNull: true,
    },
    max_players: {
      type: 'int',
      notNull: true,
      default: 4,
    },
    status: {
      type: 'varchar(16)',
      notNull: true,
      default: 'waiting',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('game_room', {
    ifExists: true,
  });
};