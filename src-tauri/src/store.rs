use crate::pairs::{parse_pairs, search_query};
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub content: String,
    pub updated: i64,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct Session {
    pub notes: Vec<Note>,
    pub tabs: Vec<String>,
    pub active: Option<String>,
}
pub struct Store {
    conn: Connection,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
          CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, content TEXT NOT NULL, updated INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS pairs(note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE, key TEXT NOT NULL, value TEXT NOT NULL);
          CREATE INDEX IF NOT EXISTS pairs_key_note ON pairs(key,note_id);
          CREATE TABLE IF NOT EXISTS session(id INTEGER PRIMARY KEY CHECK(id=1), tabs TEXT NOT NULL, active TEXT);
          CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(content, content='notes', content_rowid='rowid');
          CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN INSERT INTO notes_fts(rowid,content) VALUES(new.rowid,new.content); END;
          CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
            INSERT INTO notes_fts(notes_fts,rowid,content) VALUES('delete',old.rowid,old.content);
            INSERT INTO notes_fts(rowid,content) VALUES(new.rowid,new.content); END;")?;
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version < 2 {
            let tx = conn.unchecked_transaction()?;
            let notes: Vec<(String, String)> = {
                let mut stmt = tx.prepare("SELECT id,content FROM notes")?;
                let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
                rows.collect::<Result<_>>()?
            };
            tx.execute("DELETE FROM pairs", [])?;
            for (id, content) in notes {
                for pair in parse_pairs(&content) {
                    tx.execute(
                        "INSERT INTO pairs VALUES(?1,?2,?3)",
                        params![id, pair.key, pair.value],
                    )?;
                }
            }
            tx.pragma_update(None, "user_version", 2)?;
            tx.commit()?;
        }
        Ok(Self { conn })
    }
    pub fn backup_to(&self, path: &Path) -> Result<()> {
        self.conn.backup("main", path, None)
    }
    pub fn save_note(&self, note: &Note) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("INSERT INTO notes VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET content=excluded.content,updated=excluded.updated", params![note.id,note.content,note.updated])?;
        tx.execute("DELETE FROM pairs WHERE note_id=?1", [&note.id])?;
        for pair in parse_pairs(&note.content) {
            tx.execute(
                "INSERT INTO pairs VALUES(?1,?2,?3)",
                params![note.id, pair.key, pair.value],
            )?;
        }
        tx.commit()
    }
    pub fn save_session(&self, tabs: &[String], active: Option<&str>) -> Result<()> {
        self.conn.execute("INSERT INTO session VALUES(1,?1,?2) ON CONFLICT(id) DO UPDATE SET tabs=excluded.tabs,active=excluded.active", params![serde_json::to_string(tabs).unwrap(), active])?;
        Ok(())
    }
    pub fn session(&self) -> Result<Session> {
        let mut tabs = vec![];
        let mut active = None;
        let mut stmt = self
            .conn
            .prepare("SELECT tabs,active FROM session WHERE id=1")?;
        let mut rows = stmt.query([])?;
        if let Some(row) = rows.next()? {
            let json: String = row.get(0)?;
            tabs = serde_json::from_str(&json).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?;
            active = row.get(1)?;
        }
        let mut notes = vec![];
        for id in &tabs {
            let mut stmt = self
                .conn
                .prepare("SELECT id,content,updated FROM notes WHERE id=?1")?;
            let found = stmt.query_map([id], |r| {
                Ok(Note {
                    id: r.get(0)?,
                    content: r.get(1)?,
                    updated: r.get(2)?,
                })
            })?;
            for note in found {
                notes.push(note?);
            }
        }
        tabs.retain(|id| notes.iter().any(|n| &n.id == id));
        if !tabs.iter().any(|id| Some(id) == active.as_ref()) {
            active = tabs.first().cloned();
        }
        Ok(Session {
            notes,
            tabs,
            active,
        })
    }
    pub fn search(&self, query: &str) -> Result<Vec<Note>> {
        let (key, text) = search_query(query);
        let sql = if key.is_some() {
            "SELECT id,content,updated FROM notes WHERE EXISTS (SELECT 1 FROM pairs WHERE pairs.note_id=notes.id AND pairs.key=?2 AND instr(lower(pairs.value),lower(?1))>0) ORDER BY updated DESC LIMIT 100"
        } else {
            "SELECT id,content,updated FROM notes WHERE instr(lower(content),lower(?1))>0 AND ?2 IS NULL ORDER BY updated DESC LIMIT 100"
        };
        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map(params![text, key], |r| {
            Ok(Note {
                id: r.get(0)?,
                content: r.get(1)?,
                updated: r.get(2)?,
            })
        })?;
        rows.collect()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn update_backup_preserves_notes_tabs_and_search_indexes() {
        let path = std::env::temp_dir().join(format!(
            "bbb-notepad-update-backup-{}.sqlite3",
            std::process::id()
        ));
        let store = Store::open(Path::new(":memory:")).unwrap();
        let note = Note {
            id: "update-note".into(),
            content: "!SCRIPT:{\r\nHello 🍉\r\n}\r\n!ENV: secret".into(),
            updated: 42,
        };
        store.save_note(&note).unwrap();
        store
            .save_session(&[note.id.clone()], Some(&note.id))
            .unwrap();
        store.backup_to(&path).unwrap();
        let backup = Store::open(&path).unwrap();
        let session = backup.session().unwrap();
        assert_eq!(session.notes[0].content, note.content);
        assert_eq!(session.active, Some(note.id));
        assert_eq!(backup.search("pair:SCRIPT Hello").unwrap().len(), 1);
        drop(backup);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn restores_exact_content_and_searches_closed_notes_literally() {
        let path = std::env::temp_dir().join(format!("bbb-notes-{}.sqlite3", std::process::id()));
        let store = Store::open(&path).unwrap();
        let note = Note {
            id: "a".into(),
            content: "  CLOUDFLARE_API_TOKEN=100%_x\n\n".into(),
            updated: 1,
        };
        store.save_note(&note).unwrap();
        store.save_session(&["a".into()], Some("a")).unwrap();
        drop(store);
        let store = Store::open(&path).unwrap();
        assert_eq!(store.session().unwrap().notes[0].content, note.content);
        store.save_session(&[], None).unwrap();
        assert!(store.session().unwrap().notes.is_empty());
        assert_eq!(store.search("100%_").unwrap().len(), 1);
        assert_eq!(store.search("cloudflare_api").unwrap().len(), 1);
        assert!(store.search("missing").unwrap().is_empty());
        let changed = Note {
            content: "replacement".into(),
            ..note
        };
        store.save_note(&changed).unwrap();
        assert!(store.search("cloudflare").unwrap().is_empty());
        drop(store);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn pair_index_is_filtered_before_limit_and_changes_atomically() {
        let store = Store::open(Path::new(":memory:")).unwrap();
        for i in 0..105 {
            store
                .save_note(&Note {
                    id: format!("other-{i}"),
                    content: "unrelated".into(),
                    updated: i,
                })
                .unwrap();
        }
        let mut note = Note {
            id: "paired".into(),
            content: "!IDEA:{\nBuild capture\n}\n!ENV: secret".into(),
            updated: 0,
        };
        store.save_note(&note).unwrap();
        assert_eq!(store.search("pair:idea capture").unwrap().len(), 1);
        assert!(store.search("pair:IDEA secret").unwrap().is_empty());
        assert_eq!(store.search("pair:env secret").unwrap().len(), 1);
        note.content = "!TASK: revised".into();
        store.save_note(&note).unwrap();
        assert!(store.search("pair:IDEA").unwrap().is_empty());
        store.conn.execute_batch("CREATE TRIGGER abort_pair BEFORE INSERT ON pairs WHEN NEW.key='FAIL' BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
        note.content = "!FAIL: should roll back".into();
        assert!(store.save_note(&note).is_err());
        assert_eq!(
            store.search("pair:TASK revised").unwrap()[0].content,
            "!TASK: revised"
        );
        assert!(store.search("should roll back").unwrap().is_empty());
    }
    #[test]
    fn existing_notes_are_indexed_on_upgrade() {
        let path = std::env::temp_dir().join(format!(
            "bbb-notes-migration-{}.sqlite3",
            std::process::id()
        ));
        let old = Connection::open(&path).unwrap();
        old.execute_batch("CREATE TABLE notes(id TEXT PRIMARY KEY,content TEXT NOT NULL,updated INTEGER NOT NULL); INSERT INTO notes VALUES('old','!IDEA: existing capture',1);").unwrap();
        drop(old);
        let store = Store::open(&path).unwrap();
        assert_eq!(store.search("pair:IDEA existing").unwrap().len(), 1);
        drop(store);
        let old = Connection::open(&path).unwrap();
        old.execute_batch("INSERT INTO notes VALUES('named','!ENV(API token): upgrade-secret',2); PRAGMA user_version=1;").unwrap();
        drop(old);
        let store = Store::open(&path).unwrap();
        assert_eq!(store.search("pair:IDEA").unwrap().len(), 1);
        assert_eq!(store.search("pair:ENV upgrade-secret").unwrap().len(), 1);
        drop(store);
        std::fs::remove_file(path).unwrap();
    }
}
