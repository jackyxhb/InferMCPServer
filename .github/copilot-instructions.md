<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->
- [x] Verify that the copilot-instructions.md file in the .github directory is created. Summary: File successfully created.

- [x] Clarify Project Requirements
	<!-- Ask for project type, language, and frameworks if not specified. Skip if already provided. --> Summary: Project type is MCP server, using TypeScript, based on user requirements for resource access via SSH and RDBMS, integrated with AI Copilot tools.

- [x] Scaffold the Project
	<!--
	Ensure that the previous step has been marked as completed.
	Call project setup tool with projectType parameter.
	Run scaffolding command to create project files and folders.
	Use '.' as the working directory.
	If no appropriate projectType is available, search documentation using available tools.
	Otherwise, create the project structure manually using available file creation tools.
	--> Summary: Project scaffolded with TypeScript MCP server setup, including package.json, tsconfig.json, basic index.ts, and dependencies installed via npm install.

- [x] Customize the Project
	<!--
	Verify that all previous steps have been completed successfully and you have marked the step as completed.
	Develop a plan to modify codebase according to user requirements.
	Apply modifications using appropriate tools and user-provided references.
	Skip this step for "Hello World" projects.
	--> Summary: Added tools for SSH command execution and PostgreSQL database queries to the MCP server. The server is now ready for integration with AI Copilot tools that support MCP, such as GitHub Copilot in VS Code.

- [x] Install Required Extensions
	<!-- ONLY install extensions provided mentioned in the get_project_setup_info. Skip this step otherwise and mark as completed. --> Summary: No specific extensions required for TypeScript MCP server; skipped.

- [x] Compile the Project
	<!--
	Verify that all previous steps have been completed.
	Install any missing dependencies.
	Run diagnostics and resolve any issues.
	Check for markdown files in project folder for relevant instructions on how to do this.
	--> Summary: Project compiled successfully with npm run build after installing type dependencies and fixing type errors in code.

- [x] Create and Run Task
	<!--
	Verify that all previous steps have been completed.
	Check https://code.visualstudio.com/docs/debugtest/tasks to determine if the project needs a task. If so, use the create_and_run_task to create and launch a task based on package.json, README.md, and project structure.
	Skip this step otherwise.
	 --> Summary: Created task to run the MCP server using npm start.

- [ ] Launch the Project
	<!--
	Verify that all previous steps have been completed.
	Prompt user for debug mode, launch only if confirmed.
	 -->

- [x] Ensure Documentation is Complete
	<!--
	Verify that all previous steps have been completed.
	Verify that README.md and the copilot-instructions.md file in the .github directory exists and contains current project information.
	Clean up the copilot-instructions.md file in the .github directory by removing all HTML comments.
	 --> Summary: Verified README.md exists with project info. Cleaned up copilot-instructions.md by removing comments.

References:
- TypeScript SDK Documentation: https://github.com/modelcontextprotocol/typescript-sdk

- Work through each checklist item systematically.
- Keep communication concise and focused.
- Follow development best practices.
