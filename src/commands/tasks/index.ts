import { Command } from "commander";

export function createTasksCommand(): { tasksCmd: Command; listsCmd: Command } {
  const tasksCmd = new Command("tasks").description("Manage Google Tasks");

  const listsCmd = new Command("lists").description("List task lists");
  tasksCmd.addCommand(listsCmd);

  return { tasksCmd, listsCmd };
}
