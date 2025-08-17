Start opencode with the anthropic/claude-sonnet-4-20250514 model, switch to GPT OSS 120B using the /models command, and ask it to analyze the project. You MUST capture the COMPLETE response.

1. Start opencode in the current working directory with the specified model:
   ```
   opencode --model anthropic/claude-sonnet-4-20250514
   ```

2. Once opencode is running, use the /models slash command to switch to GPT OSS 120B:
   ```
   /models
   ```
   When the models dialog opens, type "GPT OSS 120B" to filter the list, then select GPT OSS 120B by pressing enter.

3. After successfully switching models, prompt it to analyze the project:
   ```
   Read README.md explain what this project does
   ```

4. Capture the model's COMPLETE response. This MUST scroll upwards to capture the full model response.

5. Output the model's COMPLETE response.

IMPORTANT: If you cannot successfully switch to GPT OSS 120B, the task has failed. Try at most 3 times. If failure persists, report that the model switching failed and do not proceed with the analysis.