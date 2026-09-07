import type { TabId } from "../domain/types";

export function screenClass(id: TabId, activeTab: TabId): string {
  return `screen${activeTab === id ? " active" : ""}`;
}
