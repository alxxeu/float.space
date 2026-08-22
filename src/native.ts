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

export async function updateWorkspace(
  id: string,
  name: string
): Promise<void> {
  return invoke("update_workspace", { id, name });
}

export async function loadOnboarding(): Promise<{
  completed: boolean;
  step: number;
}> {
  return invoke("load_onboarding");
}

export async function saveOnboarding(
  completed: boolean,
  step: number
): Promise<void> {
  return invoke("save_onboarding", {
    completed,
    step,
  });
}

export async function setOverlayMode(
  enabled: boolean,
  restoreToWorkspace = false
): Promise<void> {
  return invoke("set_overlay_mode", {
    enabled,
    restoreToWorkspace,
  });
}

export async function minimizeOtherWindows(): Promise<void> {
  return invoke("minimize_other_windows");
}

export async function activateFloatspace(): Promise<void> {
  return invoke("activate_floatspace");
}

export async function bringFloatspaceToFront(): Promise<void> {
  return invoke("bring_floatspace_to_front");
}
