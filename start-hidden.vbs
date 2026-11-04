' Starts bind.js without a console window (for autostart). Output goes to bind.log
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = dir
shell.Run "cmd.exe /c node bind.js >> bind.log 2>&1", 0, False
