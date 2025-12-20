-- Reset game room 7 to allow restarting
UPDATE game_room SET status = 'waiting' WHERE id = 7;

-- Delete any hands and related data for games in room 7
DELETE FROM winners WHERE hand_id IN (SELECT id FROM hands WHERE game_id IN (SELECT id FROM game WHERE room_id = 7));
DELETE FROM actions WHERE hand_id IN (SELECT id FROM hands WHERE game_id IN (SELECT id FROM game WHERE room_id = 7));
DELETE FROM hand_cards WHERE hand_id IN (SELECT id FROM hands WHERE game_id IN (SELECT id FROM game WHERE room_id = 7));
DELETE FROM hands WHERE game_id IN (SELECT id FROM game WHERE room_id = 7);

-- Delete any incomplete game records for room 7
DELETE FROM game WHERE room_id = 7;

-- Show current status
SELECT id, name, status, max_players FROM game_room WHERE id = 7;
SELECT COUNT(*) as player_count FROM room_players WHERE room_id = 7;
