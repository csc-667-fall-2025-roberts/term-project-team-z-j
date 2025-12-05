/*
Table actions {
  id           bigint [pk, increment]
  hand_id      bigint [ref: > hands.id, not null]
  user_id      bigint [ref: > users.id, not null]
  action_type  action_type [ref: > action_type, not null]
  amount       bigint [default: 0]
  street       street_type [ref: > street_type, not null]
  created_at   timestamp [not null, default: `now()`]
}
*/

exports.up = (pgm) => {
  pgm.createTable('actions', {
    id: {
      type: 'bigserial',
      primaryKey: true,
      notNull: true,
    },
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
    action_type: {
      type: 'action_type', 
      notNull: true,
    },
    amount: {
      type: 'bigint',
      notNull: true,
      default: 0,
    },
    
    street: {
      type: 'street_type',
      notNull: true,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.createIndex('actions', ['hand_id', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('actions', {
    ifExists: true,
    cascade: true,
  });
};