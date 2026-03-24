import { Command } from "commander";

export function createTasksCommand(): {
  tasksCmd: Command;
  listsCmd: Command;
  listCmd: Command;
  showCmd: Command;
  addCmd: Command;
  updateCmd: Command;
  doneCmd: Command;
  undoneCmd: Command;
  deleteCmd: Command;
} {
  const tasksCmd = new Command("tasks").description("Manage Google Tasks");

  const listsCmd = new Command("lists").description("List task lists");
  tasksCmd.addCommand(listsCmd);

  const listCmd = new Command("list")
    .description("List tasks")
    .option("-l, --list <name-or-id>", "Task list name or ID")
    .option("--all", "Include completed tasks")
    .option("--completed", "Show only completed tasks")
    .option("--due-before <date>", "Tasks due before date (YYYY-MM-DD)")
    .option("--due-after <date>", "Tasks due after date (YYYY-MM-DD)");
  tasksCmd.addCommand(listCmd);

  const showCmd = new Command("show")
    .description("Show task details")
    .argument("<task-id>", "Task ID")
    .option("-l, --list <name-or-id>", "Task list name or ID");
  tasksCmd.addCommand(showCmd);

  const addCmd = new Command("add")
    .description("Create a new task")
    .requiredOption("-t, --title <title>", "Task title")
    .option("-n, --notes <text>", "Notes")
    .option("--due <date>", "Due date (YYYY-MM-DD)")
    .option("-l, --list <name-or-id>", "Task list name or ID")
    .option("--parent <task-id>", "Parent task ID (create as subtask)");
  tasksCmd.addCommand(addCmd);

  const updateCmd = new Command("update")
    .description("Update an existing task")
    .argument("<task-id>", "Task ID to update")
    .option("-t, --title <title>", "New title")
    .option("-n, --notes <text>", "New notes")
    .option("--due <date>", "New due date (YYYY-MM-DD)")
    .option("-l, --list <name-or-id>", "Task list name or ID");
  tasksCmd.addCommand(updateCmd);

  const doneCmd = new Command("done")
    .description("Mark a task as completed")
    .argument("<task-id>", "Task ID to complete")
    .option("-l, --list <name-or-id>", "Task list name or ID");
  tasksCmd.addCommand(doneCmd);

  const undoneCmd = new Command("undone")
    .description("Mark a task as not completed")
    .argument("<task-id>", "Task ID to reopen")
    .option("-l, --list <name-or-id>", "Task list name or ID");
  tasksCmd.addCommand(undoneCmd);

  const deleteCmd = new Command("delete")
    .description("Delete a task")
    .argument("<task-id>", "Task ID to delete")
    .option("-l, --list <name-or-id>", "Task list name or ID");
  tasksCmd.addCommand(deleteCmd);

  return { tasksCmd, listsCmd, listCmd, showCmd, addCmd, updateCmd, doneCmd, undoneCmd, deleteCmd };
}
