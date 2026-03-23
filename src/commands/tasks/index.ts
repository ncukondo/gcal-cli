import { Command } from "commander";

export function createTasksCommand(): Command {
  const cmd = new Command("tasks").description("Manage Google Tasks");

  const listsCmd = new Command("lists").description("List task lists");
  cmd.addCommand(listsCmd);

  return cmd;
}
