use std::path::PathBuf;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Serialize)]
pub struct Workspace {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) slot: i64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub(crate) id: String,
    pub(crate) workspace_id: String,
    pub(crate) text: String,
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) width: f64,
    pub(crate) height: f64,
    pub(crate) tag_color: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewCard {
    workspace_id: String,
    text: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn open(path: PathBuf) -> rusqlite::Result<Self> {
        let connection = Connection::open(path)?;
        
        // 1. Создаем базовые таблицы в рамках одной валидной SQL строки
        connection.execute_batch(
            "
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS workspaces (
              id TEXT PRIMARY KEY NOT NULL,
              name TEXT NOT NULL,
              slot INTEGER NOT NULL UNIQUE CHECK (slot BETWEEN 1 AND 10),
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS cards (
              id TEXT PRIMARY KEY NOT NULL,
              workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
              text TEXT NOT NULL DEFAULT '',
              x REAL NOT NULL,
              y REAL NOT NULL,
              width REAL NOT NULL,
              height REAL NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS cards_workspace_id_idx ON cards(workspace_id);
            
            CREATE TABLE IF NOT EXISTS onboarding (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              completed INTEGER NOT NULL DEFAULT 0,
              step INTEGER NOT NULL DEFAULT 0
            );

            INSERT OR IGNORE INTO onboarding (id, completed, step)
            VALUES (1, 0, 0);
            "
        )?;

        // 2. Безопасно добавляем колонку для старых баз данных средствами Rust
        let _ = connection.execute(
            "ALTER TABLE cards ADD COLUMN tag_color TEXT",
            []
        );

        let database = Self { connection };
        database.ensure_default_workspace()?;
        Ok(database)
        }

    pub fn list_workspaces(&self) -> rusqlite::Result<Vec<Workspace>> {
        let mut statement = self
            .connection
            .prepare("SELECT id, name, slot FROM workspaces ORDER BY slot ASC")?;
        let workspaces = statement
            .query_map([], |row| {
                Ok(Workspace {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    slot: row.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(workspaces)
    }

    pub fn create_workspace(&self, name: String) -> rusqlite::Result<Workspace> {
        let slot = self.connection.query_row(
            "SELECT COALESCE(MAX(slot), 0) + 1 FROM workspaces",
            [],
            |row| row.get::<_, i64>(0),
        )?;
        if slot > 10 {
            return Err(rusqlite::Error::ExecuteReturnedResults);
        }
        let workspace = Workspace {
            id: Uuid::new_v4().to_string(),
            name,
            slot,
        };
        self.connection.execute(
            "INSERT INTO workspaces (id, name, slot) VALUES (?1, ?2, ?3)",
            params![workspace.id, workspace.name, workspace.slot],
        )?;
        Ok(workspace)
    }

    pub fn update_workspace(&self, id: String, name: String) -> rusqlite::Result<()> {
        self.connection.execute(
            "UPDATE workspaces
         SET name = ?1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2",
            params![name, id],
        )?;

        Ok(())
    }
    pub fn list_cards(&self, workspace_id: String) -> rusqlite::Result<Vec<Card>> {
        let mut statement = self.connection.prepare("SELECT id, workspace_id, text, x, y, width, height FROM cards WHERE workspace_id = ?1 ORDER BY created_at ASC")?;
        let cards = statement
            .query_map([workspace_id], Self::card_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(cards)
    }

    pub fn create_card(&self, new_card: NewCard) -> rusqlite::Result<Card> {
        let card = Card {
            id: Uuid::new_v4().to_string(),
            workspace_id: new_card.workspace_id,
            text: new_card.text,
            x: new_card.x,
            y: new_card.y,
            width: new_card.width,
            height: new_card.height,
            tag_color: None,
        };
        self.connection.execute("INSERT INTO cards (id, workspace_id, text, x, y, width, height) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", params![card.id, card.workspace_id, card.text, card.x, card.y, card.width, card.height])?;
        Ok(card)
    }

    pub fn update_card(&self, card: Card) -> rusqlite::Result<()> {
        self.connection.execute("UPDATE cards SET text = ?1, x = ?2, y = ?3, width = ?4, height = ?5, updated_at = CURRENT_TIMESTAMP WHERE id = ?6", params![card.text, card.x, card.y, card.width, card.height, card.id])?;
        Ok(())
    }

    pub fn delete_card(&self, id: String) -> rusqlite::Result<()> {
        self.connection
            .execute("DELETE FROM cards WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn load_onboarding(&self) -> rusqlite::Result<(bool, i64)> {
        self.connection.query_row(
            "SELECT completed, step FROM onboarding WHERE id = 1",
            [],
            |row| {
                let completed: i64 = row.get(0)?;
                let step: i64 = row.get(1)?;
                Ok((completed != 0, step))
            },
        )
    }

    pub fn save_onboarding(&self, completed: bool, step: i64) -> rusqlite::Result<()> {
        self.connection.execute(
            "UPDATE onboarding
         SET completed = ?1, step = ?2
         WHERE id = 1",
            params![completed as i64, step],
        )?;

        Ok(())
    }

    fn card_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Card> {
        Ok(Card {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            text: row.get(2)?,
            x: row.get(3)?,
            y: row.get(4)?,
            width: row.get(5)?,
            height: row.get(6)?,
            tag_color: row.get(7).ok(),
        })
    }

    fn ensure_default_workspace(&self) -> rusqlite::Result<()> {
        let exists: bool =
            self.connection
                .query_row("SELECT EXISTS(SELECT 1 FROM workspaces)", [], |row| {
                    row.get(0)
                })?;

        if !exists {
            self.connection.execute(
                "INSERT INTO workspaces (id, name, slot) VALUES (?1, ?2, 1)",
                params![Uuid::new_v4().to_string(), "Untitled space"],
            )?;
        }

        Ok(())
    }
}
