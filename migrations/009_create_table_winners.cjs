/*
Table winners {
  hand_id     bigint [ref: > hands.id, not null]
  user_id     bigint [ref: > users.id, not null]
  amount_won  bigint [not null]
  hand_rank   varchar(32) [not null, note: Full House, Two Pair etc.']
  created_at  timestamp [not null, default: `now()`]

  (hand_id, user_id) [pk]
}
*/

exports.up = (pgm) => {
  pgm.createTable('winners', {
    hand_id: {
      type: 'bigint',
      notNull: true,
      references: 'hands',
      onDelete: 'CASCADE', 
    },
    user_id: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE', 
    },
    amount_won: {
      type: 'bigint',
      notNull: true,
    },
    hand_rank: {
      type: 'varchar(32)',
      notNull: true,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.addConstraint('winners', 'winners_pk', {
    primaryKey: ['hand_id', 'user_id'],
  });

  pgm.createIndex('winners', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('winners', {
    ifExists: true,
    cascade: true,
  });
};