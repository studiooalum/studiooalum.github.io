set homePath to POSIX path of (path to home folder)
set cachePath to homePath & "Library/Application Support/StudioOALUM/repo-path.txt"
set launcherPath to homePath & "studiooalum_website/scripts/launch-sanity-studio.sh"

try
	set cachedRepoPath to do shell script "if [ -f " & quoted form of cachePath & " ]; then cat " & quoted form of cachePath & "; fi"
	if cachedRepoPath is not "" then
		set launcherPath to cachedRepoPath & "/scripts/launch-sanity-studio.sh"
	end if
end try

try
	set launcherExists to do shell script "if [ -f " & quoted form of launcherPath & " ]; then printf yes; else printf no; fi"
	on error
		set launcherExists to "no"
end try

if launcherExists is not "yes" then
	try
		set launcherPath to do shell script "find " & quoted form of homePath & " -maxdepth 6 \\( -path " & quoted form of (homePath & "Library") & " -o -path " & quoted form of (homePath & "Library/*") & " -o -path " & quoted form of (homePath & ".Trash") & " -o -path " & quoted form of (homePath & ".Trash/*") & " -o -path '*/node_modules' -o -path '*/node_modules/*' \\) -prune -o -path '*/scripts/launch-sanity-studio.sh' -print 2>/dev/null | head -n 1"
	on error
		set launcherPath to ""
	end try
end if

if launcherPath is "" then
	display dialog "Sanity Studio launcher not found. Reinstall the launcher or open the repo and run apps/studio/start-studio.sh." buttons {"OK"} default button "OK" with icon caution
	return
end if

tell application "Terminal"
	activate
	do script "bash " & quoted form of launcherPath
end tell