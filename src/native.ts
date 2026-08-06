import { invoke } from "@tauri-apps/api/core";
import type { Card, Workspace } from "./domain";

export async function loadWorkspaces(): Promise<Workspace[]> {
  return invoke<Workspace[]>("list_workspaces");
}

export async function createWorkspace(name: string): Promise<Workspace> {
  return invoke<Workspace>("create_workspace", { name });
}

export async function loadCards(workspaceId: string): Promise<Card[]> {
  return invoke<Card[]>("list_cards", { workspaceId });
}

export async function createCard(card: Omit<Card, "id">): Promise<Card> {
  return invoke<Card>("create_card", { card });
}

export async function updateCard(card: Card): Promise<void> {
  return invoke("update_card", { card });
}

export async function deleteCard(id: string): Promise<void> {
  return invoke("delete_card", { id });
}
