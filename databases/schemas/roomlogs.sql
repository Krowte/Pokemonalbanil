CREATE TABLE public.roomlogs (
	type STRING NOT NULL,
	room STRING NOT NULL,
	userid STRING NULL,
	day STRING NOT NULL,
	month STRING NOT NULL,
	year STRING NOT NULL,
	timestamp INT NOT NULL,
	log STRING NOT NULL,
	INDEX userid (userid),
	INDEX room (room),
	INDEX type (type),
	INDEX fulldate (day, month, year)
);
-- computed columns have to be added after apparently
ALTER TABLE roomlogs ADD COLUMN content TSVECTOR AS (to_tsvector('english', log)) STORED;