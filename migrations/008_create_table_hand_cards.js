/*
Table hand_cards {
  hand_id bigint [ref: > hands.id, not null]
  user_id bigint [ref: > users.id, not null]
  card_1  varchar(3) [note:'record 2 hole cards on each players' hand']
  card_2  varchar(3) 
  
  (hand_id, user_id) [pk]
}
*/

exports.up = (pgm) => {
  pgm.createTable('hand_cards', {
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
    card_1: {
      type: 'varchar(3)',
      notNull: true,
    },
    card_2: {
      type: 'varchar(3)',
      notNull: true,
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    }
  });

  pgm.addConstraint('hand_cards', 'hand_cards_pk', {
    primaryKey: ['hand_id', 'user_id'],
  });
  pgm.createIndex('hand_cards', 'hand_id');
};

exports.down = (pgm) => {
  pgm.dropTable('hand_cards', {
    ifExists: true,
    cascade: true,
  });
};