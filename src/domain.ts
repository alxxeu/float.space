export interface Workspace {
  id: string;
  name: string;
  slot: number;
}

export interface Card {
  id: string;
  workspaceId: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tagColor?: string;
}
