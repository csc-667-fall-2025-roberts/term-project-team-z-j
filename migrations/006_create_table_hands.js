/*
Table hands {
  id               bigint [pk, increment]
  game_id          bigint [ref: > game.id, not null]
  hand_number      int [not null]
  dealer_seat      int [not null]
  small_blind_seat int [not null]
  big_blind_seat   int [not null]
  current_street   street_type [ref: > street_type, not null]
  pot_size         bigint [not null, default: 0]
  board_cards      varchar(10) 
  is_completed     boolean [not null, default: false]
  start_time       timestamp [not null, default: `now()`]
}
*/

exports.up = (pgm) => {
    pgm.createTable('hands', {
    id: {
      type: 'bigserial',
      primaryKey: true,
      notNull: true,
    },
    game_id: {
      type: 'bigint',
      notNull: true,
      references: 'game',
      onDelete: 'CASCADE',
    },
    hand_number: {
      type: 'integer',
      notNull: true,
    },
    dealer_seat: {
      type: 'integer',
      notNull: true,
    },
    small_blind_seat: {
      type: 'integer',
      notNull: true,
    },
    big_blind_seat: {
      type: 'integer',
      notNull: true,
    },
    current_street: {
      type: 'street_type',
      notNull: true,
      default: 'preflop',
    },
    pot_size: {
      type: 'bigint',
      notNull: true,
      default: 0,
    },
    board_cards: {
      type: 'varchar(10)',
      notNull: false, 
    },
    is_completed: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    start_time: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.addConstraint('hands', 'hands_game_number_unique', {
    unique: ['game_id', 'hand_number'],
  });

  pgm.createIndex('hands', 'game_id');
};

exports.down = (pgm) => {
  pgm.dropTable('hands', {
    ifExists: true,
    cascade: true,
  });
};