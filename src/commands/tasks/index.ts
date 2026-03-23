import { Command } from "commander";

export function createTasksCommand(): {
  tasksCmd: Command;
  listsCmd: Command;
  listCmd: Command;
  showCmd: Command;
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

  return { tasksCmd, listsCmd, listCmd, showCmd };
}
