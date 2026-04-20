import sqlite3
import os

DB_PATH = "shnoor_meetings.db"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create events table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS calendar_events (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'meetings',
            room_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor.execute("PRAGMA table_info(calendar_events)")
    existing_columns = [row["name"] for row in cursor.fetchall()]

    if "category" not in existing_columns:
        cursor.execute("ALTER TABLE calendar_events ADD COLUMN category TEXT NOT NULL DEFAULT 'meetings'")
    
    conn.commit()
    conn.close()
