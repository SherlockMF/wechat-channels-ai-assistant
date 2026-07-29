import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appStateItems = sqliteTable(
  "app_state_items",
  {
    collection: text("collection").notNull(),
    id: text("id").notNull(),
    payload: text("payload").notNull(),
  },
  (table) => [primaryKey({ columns: [table.collection, table.id] })],
);

export type AppStateItem = typeof appStateItems.$inferSelect;
