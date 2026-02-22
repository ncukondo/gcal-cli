#!/usr/bin/env bun
import { Command } from "commander";

const program = new Command();

program.name("gcal").description("CLI tool for managing Google Calendar events").version("0.1.0");

program.parse();
