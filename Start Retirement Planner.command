#!/bin/zsh
# Double-click to run the Retirement Planner. Leave this Terminal window
# open while using the app; close it (or Ctrl+C) when you're done.
cd "$(dirname "$0")"
PORT=5173
if lsof -i :"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  # Already running — just open the browser
  open "https://localhost:$PORT"
else
  (sleep 2 && open "https://localhost:$PORT") &
  npm run dev
fi
