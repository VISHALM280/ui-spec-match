import type { ActionItem } from "./catchup";

export type TaskStatus = "all" | "pending" | "completed";

export function filterTasks(items: ActionItem[], done: boolean[], person: string, status: TaskStatus) {
  return items.map((item, index) => ({ item, index })).filter(({ item, index }) =>
    (!person || item.assignee === person) &&
    (status === "all" || (status === "completed" ? Boolean(done[index]) : !done[index])),
  );
}