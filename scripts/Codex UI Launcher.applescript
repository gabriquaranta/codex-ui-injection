try
	do shell script "/Users/gabrielequaranta/Developer/codex-ui-injection/scripts/launch-codex-ui.sh"
on error errorMessage
	display dialog errorMessage with title "Codex UI Launcher" buttons {"OK"} default button "OK"
end try
