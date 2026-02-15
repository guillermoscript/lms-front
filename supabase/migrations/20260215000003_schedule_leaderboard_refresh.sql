-- Schedule the leaderboard refresh every hour at the top of the hour
-- Using SELECT to avoid errors if already scheduled (though schedule() overwrites if name matches in some versions, 
-- but it's better to check or just use the name)

SELECT cron.schedule(
    'refresh-leaderboard-hourly',
    '0 * * * *',
    'SELECT refresh_leaderboard_cache()'
);
