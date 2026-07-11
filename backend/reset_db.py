import psycopg2

conn = psycopg2.connect(dbname='postgres', user='postgres', password='Linuxprotocol123', host='localhost')
conn.autocommit = True
cur = conn.cursor()

# Terminate other connections
cur.execute("""
    SELECT pg_terminate_backend(pg_stat_activity.pid) 
    FROM pg_stat_activity 
    WHERE pg_stat_activity.datname = 'spylt_db' 
    AND pid != pg_backend_pid()
""")

cur.execute('DROP DATABASE IF EXISTS spylt_db')
cur.execute('CREATE DATABASE spylt_db')
print('Database reset OK!')
cur.close()
conn.close()
