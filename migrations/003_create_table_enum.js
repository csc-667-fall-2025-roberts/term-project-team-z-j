/*
1. ENUM action_type ('fold', 'check', 'call', 'bet', 'raise', 'all_in')
2. ENUM street_type ('preflop', 'flop', 'turn', 'river')
3. ENUM message_type ('chat', 'system', 'announcement')
*/

exports.up = (pgm) => {
  pgm.createType('action_type', [
    'fold', 
    'check', 
    'call', 
    'bet', 
    'raise', 
    'all_in'
  ]);

  pgm.createType('street_type', [
    'preflop', 
    'flop', 
    'turn', 
    'river'
  ]);

  pgm.createType('message_type', [
    'chat', 
    'system', 
  ]);
};

exports.down = (pgm) => {
  pgm.dropType('action_type', { ifExists: true });
  pgm.dropType('street_type', { ifExists: true });
  pgm.dropType('message_type', { ifExists: true });
};