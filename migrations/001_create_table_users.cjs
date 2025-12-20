/*
 
  Table users {
  id            bigint [pk, increment]
  email         varchar(255) [not null, unique]
  username      varchar(32)  [not null, unique] // display name
  password_hash varchar(255) [not null]
  created_at    timestamp    [not null, default: `now()`]
  }
 */

exports.up = (pgm) => {
  pgm.createTable('users', {
    // id: bigint [pk, increment]
    id: {
      type: 'bigserial',
      primaryKey: true,
      notNull: true,
    },
    // email: varchar(255) [not null, unique]
    email: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    // username: varchar(32) [not null, unique]
    username: {
      type: 'varchar(32)',
      notNull: true,
      unique: true,
    },
    // password_hash: varchar(255) [not null]
    password_hash: {
      type: 'varchar(255)',
      notNull: true,
    },
    // created_at: timestamp [not null, default: `now()`]
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('users', {
    ifExists: true,
  });
};